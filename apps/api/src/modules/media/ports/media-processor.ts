import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

export interface ProbeResult {
  durationS: number | null;
  width: number | null;
  height: number | null;
  hasVideo: boolean;
  hasAudio: boolean;
}

/**
 * Cổng xử lý media chạy trong worker: đo thời lượng, tạo ảnh thu nhỏ, chuẩn hoá video/ghi âm.
 * Thay bằng dịch vụ xử lý media của nhà cung cấp cloud = viết adapter khác.
 */
export interface MediaProcessor {
  probe(path: string): Promise<ProbeResult>;
  /** Ảnh thu nhỏ JPEG cạnh dài ~480px (từ ảnh hoặc khung hình đầu của video). */
  thumbnail(input: string, output: string, opts: { atSecond?: number }): Promise<void>;
  /** Video MP4 H.264 tối đa 720p, AAC, phát được ngay khi đang tải (faststart). */
  normalizeVideo(input: string, output: string): Promise<void>;
  /** Ghi âm AAC mono (.m4a) — phát được trên mọi máy, nhỏ gọn. */
  normalizeAudio(input: string, output: string): Promise<void>;
}
export const MEDIA_PROCESSOR = Symbol('MEDIA_PROCESSOR');

export class FfmpegProcessor implements MediaProcessor {
  constructor(private readonly bin = { ffmpeg: 'ffmpeg', ffprobe: 'ffprobe' }) {}

  async probe(path: string): Promise<ProbeResult> {
    const { stdout } = await run(this.bin.ffprobe, ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height', '-of', 'json', path]);
    const j = JSON.parse(stdout) as { format?: { duration?: string }; streams?: { codec_type: string; width?: number; height?: number }[] };
    const v = j.streams?.find((s) => s.codec_type === 'video');
    const d = Number(j.format?.duration);
    return {
      durationS: Number.isFinite(d) ? Math.round(d * 10) / 10 : null,
      width: v?.width ?? null,
      height: v?.height ?? null,
      hasVideo: Boolean(v),
      hasAudio: Boolean(j.streams?.some((s) => s.codec_type === 'audio')),
    };
  }

  async thumbnail(input: string, output: string, opts: { atSecond?: number }) {
    const seek = opts.atSecond ? ['-ss', String(opts.atSecond)] : [];
    await run(this.bin.ffmpeg, ['-y', '-v', 'error', ...seek, '-i', input, '-frames:v', '1', '-vf', "scale='if(gt(iw,ih),min(480,iw),-2)':'if(gt(iw,ih),-2,min(480,ih))'", '-q:v', '4', output]);
  }

  async normalizeVideo(input: string, output: string) {
    await run(this.bin.ffmpeg, [
      '-y', '-v', 'error', '-i', input,
      '-vf', "scale='if(gt(iw,ih),-2,min(720,iw))':'if(gt(iw,ih),min(720,ih),-2)'",
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '96k', '-ac', '1', '-movflags', '+faststart', output,
    ], { maxBuffer: 10 * 1024 * 1024 });
  }

  async normalizeAudio(input: string, output: string) {
    await run(this.bin.ffmpeg, ['-y', '-v', 'error', '-i', input, '-vn', '-c:a', 'aac', '-b:a', '64k', '-ac', '1', output]);
  }
}
