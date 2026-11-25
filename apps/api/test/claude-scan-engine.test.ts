import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { ClaudeScanEngine, ScanError } from '../src/modules/scan/public-api.js';

/** Client giả: ghi lại request, trả response dựng sẵn — kiểm tra adapter mà không gọi mạng. */
function fakeClient(response: Record<string, unknown> | Error) {
  const calls: Record<string, unknown>[] = [];
  const client = {
    beta: {
      messages: {
        parse: async (params: Record<string, unknown>) => {
          calls.push(params);
          if (response instanceof Error) throw response;
          return response;
        },
      },
    },
  } as unknown as Anthropic;
  return { client, calls };
}

const img = { bytes: Buffer.from('anh-trang-de'), mimeType: 'image/jpeg' as const };

describe('ClaudeScanEngine (adapter đọc đề bằng Claude)', () => {
  it('gửi ảnh base64 + yêu cầu chỉ chép đề, ép JSON theo schema, bật dự phòng khi bị từ chối', async () => {
    const { client, calls } = fakeClient({
      stop_reason: 'end_turn',
      parsed_output: {
        title: ' Bài 5 ',
        instructions: '',
        items: [
          { number: '1', itemType: 'open', promptText: ' Tính 5 + 3 ', promptLatex: '5 + 3', options: [], confidence: 1.4 },
          { number: '2', itemType: 'open', promptText: '   ', promptLatex: null, options: null, confidence: 0.5 },
        ],
      },
    });
    const out = await new ClaudeScanEngine(client).extract([img, img], { grade: 2, subject: 'Toán' });
    const p = calls[0]!;
    expect(p).toMatchObject({ model: 'claude-opus-5-5', max_tokens: 16000, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default', output_config: { effort: 'medium' } });
    expect((p.output_config as { format: unknown }).format).toBeDefined();
    expect(p.system).toContain('CHÉP LẠI ĐỀ');
    expect(p.system).toContain('Không giải bài');
    const content = (p.messages as { content: { type: string; source?: { type: string; data: string } ; text?: string }[] }[])[0]!.content;
    expect(content.filter((c) => c.type === 'image')).toHaveLength(2);
    expect(content[0]!.source).toMatchObject({ type: 'base64', data: Buffer.from('anh-trang-de').toString('base64') });
    expect(content.at(-1)!.text).toBe('Chép đề từ 2 ảnh trên (lớp 2, môn Toán).');
    // Chuẩn hoá đầu ra: bỏ câu rỗng, cắt khoảng trắng, độ chắc chắn trong [0,1], options rỗng → null
    expect(out).toEqual({
      title: 'Bài 5',
      instructions: null,
      items: [{ number: '1', itemType: 'open', promptText: 'Tính 5 + 3', promptLatex: '5 + 3', options: null, aiConfidence: 1 }],
    });
  });

  it('bị từ chối / quá dài → lỗi dừng hẳn; quá tải → lỗi tạm (worker thử lại)', async () => {
    await expect(new ClaudeScanEngine(fakeClient({ stop_reason: 'refusal', parsed_output: null }).client).extract([img], {})).rejects.toMatchObject({ retryable: false });
    await expect(new ClaudeScanEngine(fakeClient({ stop_reason: 'max_tokens', parsed_output: null }).client).extract([img], {})).rejects.toBeInstanceOf(ScanError);
    const overloaded = new Anthropic.RateLimitError(429, { error: { message: 'rate' } }, 'rate', new Headers());
    await expect(new ClaudeScanEngine(fakeClient(overloaded).client).extract([img], {})).rejects.toMatchObject({ retryable: true });
  });
});
