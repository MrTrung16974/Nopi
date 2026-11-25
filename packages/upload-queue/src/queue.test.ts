import { describe, expect, it } from 'vitest';
import { UploadQueue } from './queue.js';
import type { QueueStorage, QueueTransport, UploadJob } from './types.js';

class MemStorage implements QueueStorage {
  data = '[]';
  async load() {
    return JSON.parse(this.data) as UploadJob[];
  }
  async save(jobs: UploadJob[]) {
    this.data = JSON.stringify(jobs);
  }
}

const netErr = () => Object.assign(new Error('Network request failed'), { code: 'network' });
const apiErr = (code: string, message: string) => Object.assign(new Error(message), { code });

/** Kho + API giả, đếm số lần gọi, có thể "rớt mạng" ở bước bất kỳ. */
class FakeTransport implements QueueTransport {
  online = true;
  calls: string[] = [];
  failOnce = new Set<string>();
  multipartSize = 0;
  serverParts = new Map<string, Map<number, string>>();
  submitted: string[][] = [];
  private n = 0;

  private maybeFail(step: string, err: Error = netErr()) {
    this.calls.push(step);
    if (this.failOnce.has(step)) {
      this.failOnce.delete(step);
      throw err;
    }
  }
  async isOnline() {
    return this.online;
  }
  async requestUpload(_job: UploadJob, file: { sizeBytes: number; kind: string }) {
    this.maybeFail(`request:${file.kind}`);
    const mediaId = `m${++this.n}`;
    if (file.sizeBytes > this.multipartSize && this.multipartSize > 0) {
      this.serverParts.set(mediaId, new Map());
      return { method: 'multipart' as const, mediaId, partSize: 10, expiresIn: 3600, parts: [1, 2, 3].map((p) => ({ partNumber: p, url: `u/${mediaId}/${p}` })) };
    }
    return { method: 'put' as const, mediaId, url: `u/${mediaId}`, headers: {}, expiresIn: 3600 };
  }
  async putFile(file: { kind: string }) {
    this.maybeFail(`put:${file.kind}`);
  }
  async putPart(_f: unknown, url: string) {
    const [, mediaId, p] = url.split('/');
    this.maybeFail(`part:${p}`);
    this.serverParts.get(mediaId!)!.set(Number(p), `etag-${p}`);
    return `etag-${p}`;
  }
  async multipartStatus(_job: UploadJob, mediaId: string) {
    this.calls.push('status');
    const done = this.serverParts.get(mediaId)!;
    return {
      uploaded: [...done].map(([partNumber, etag]) => ({ partNumber, etag, size: 10 })),
      parts: [1, 2, 3].filter((p) => !done.has(p)).map((p) => ({ partNumber: p, url: `u/${mediaId}/${p}` })),
      partSize: 10,
    };
  }
  async complete(_job: UploadJob, mediaId: string, parts?: { partNumber: number }[]) {
    this.maybeFail(`complete:${mediaId}`);
    if (parts) this.calls.push(`parts:${parts.map((p) => p.partNumber).sort().join(',')}`);
    return { id: mediaId, kind: 'photo' as const, status: 'processing' as const, mimeType: 'image/jpeg', durationS: null, url: null, thumbnailUrl: null };
  }
  async submit(_job: UploadJob, mediaIds: string[]) {
    this.maybeFail('submit');
    this.submitted.push(mediaIds);
    return {} as never;
  }
}

function setup() {
  let now = 1_000_000;
  const storage = new MemStorage();
  const transport = new FakeTransport();
  const make = () => new UploadQueue(storage, transport, { now: () => now, backoff: () => 5000 });
  return { storage, transport, make, tick: (ms: number) => (now += ms) };
}

const photo = { localUri: 'file:///p.jpg', kind: 'photo' as const, mimeType: 'image/jpeg', sizeBytes: 5 };
const audio = { localUri: 'file:///a.m4a', kind: 'audio' as const, mimeType: 'audio/mp4', sizeBytes: 5, durationS: 30 };

describe('hàng đợi nộp bài', () => {
  it('bình thường: tải từng file rồi nộp một lần, đúng thứ tự', async () => {
    const { transport, make } = setup();
    const q = make();
    await q.enqueue({ studentAssignmentId: 'sa1', as: 'student', files: [photo, audio] });
    await q.processDue();
    expect(transport.submitted).toEqual([['m1', 'm2']]);
    expect(q.list()[0]).toMatchObject({ state: 'done', progress: 1 });
  });

  it('mất mạng lúc đang tải: chờ rồi thử lại, không xin URL mới, không tải lại file đã lên', async () => {
    const { transport, make, tick } = setup();
    const q = make();
    transport.failOnce.add('put:audio');
    await q.enqueue({ studentAssignmentId: 'sa1', as: 'student', files: [photo, audio] });
    await q.processDue();
    expect(q.list()[0]).toMatchObject({ state: 'pending' });
    await q.processDue(); // chưa tới giờ thử lại
    expect(transport.calls.filter((c) => c === 'put:audio')).toHaveLength(1);

    tick(5000);
    await q.processDue();
    expect(q.list()[0]!.state).toBe('done');
    expect(transport.calls.filter((c) => c.startsWith('request:'))).toEqual(['request:photo', 'request:audio']);
    expect(transport.calls.filter((c) => c === 'put:photo')).toHaveLength(1);
  });

  it('tắt app giữa chừng: mở lại thì làm tiếp từ bước đã lưu', async () => {
    const { storage, transport, make, tick } = setup();
    const q1 = make();
    transport.failOnce.add('complete:m1'); // tải xong nhưng chưa kịp xác nhận
    await q1.enqueue({ studentAssignmentId: 'sa1', as: 'adult', files: [photo] });
    await q1.processDue();
    // giả lập app bị tắt khi đang chạy
    const saved = JSON.parse(storage.data) as UploadJob[];
    saved[0]!.state = 'uploading';
    storage.data = JSON.stringify(saved);

    tick(5000);
    const q2 = make();
    await q2.processDue();
    expect(q2.list()[0]!.state).toBe('done');
    expect(transport.calls.filter((c) => c === 'put:photo')).toHaveLength(1); // không tải lại
    expect(transport.submitted).toEqual([['m1']]);
  });

  it('video lớn tải theo phần: rớt mạng ở phần 2 thì lần sau chỉ tải phần 2, 3', async () => {
    const { transport, make, tick } = setup();
    transport.multipartSize = 20;
    const q = make();
    transport.failOnce.add('part:2');
    await q.enqueue({ studentAssignmentId: 'sa1', as: 'student', files: [{ localUri: 'file:///v.mp4', kind: 'video', mimeType: 'video/mp4', sizeBytes: 30 }] });
    await q.processDue();
    expect(q.list()[0]!.files[0]!.parts).toEqual([{ partNumber: 1, etag: 'etag-1' }]);

    tick(5000);
    await q.processDue();
    expect(transport.calls.filter((c) => c.startsWith('part:'))).toEqual(['part:1', 'part:2', 'part:2', 'part:3']);
    expect(transport.calls).toContain('status');
    expect(transport.calls).toContain('parts:1,2,3');
    expect(q.list()[0]!.state).toBe('done');
  });

  it('lỗi dữ liệu (quá hạn, không có quyền…) thì dừng và báo; bấm "Gửi lại" thì chạy tiếp', async () => {
    const { transport, make } = setup();
    const q = make();
    transport.failOnce.add('submit');
    const failSubmit = transport.submit.bind(transport);
    let first = true;
    transport.submit = async (job, ids) => {
      if (first) {
        first = false;
        transport.calls.push('submit');
        throw apiErr('validation_failed', 'Đã quá hạn nộp và cô chưa cho phép nộp muộn');
      }
      return failSubmit(job, ids);
    };
    transport.failOnce.delete('submit');
    const id = await q.enqueue({ studentAssignmentId: 'sa1', as: 'student', files: [photo] });
    await q.processDue();
    expect(q.list()[0]).toMatchObject({ state: 'failed', error: 'Đã quá hạn nộp và cô chưa cho phép nộp muộn' });
    await q.retry(id);
    await q.processDue();
    expect(q.list()[0]!.state).toBe('done');
    expect(transport.calls.filter((c) => c === 'put:photo')).toHaveLength(1);
  });

  it('không có mạng thì không làm gì; báo tiến độ cho màn "Đang gửi…"', async () => {
    const { transport, make } = setup();
    const q = make();
    transport.online = false;
    const seen: number[] = [];
    q.subscribe((jobs) => jobs[0] && seen.push(jobs[0].progress));
    await q.enqueue({ studentAssignmentId: 'sa1', as: 'student', files: [photo] });
    await q.processDue();
    expect(transport.calls).toEqual([]);
    expect(q.forAssignment('sa1')).toHaveLength(1);
    transport.online = true;
    await q.processDue();
    expect(seen.at(-1)).toBe(1);
    expect(seen.some((p) => p > 0 && p < 1)).toBe(true);
    expect(q.forAssignment('sa1')).toHaveLength(0); // xong thì không còn "đang gửi"
  });
});
