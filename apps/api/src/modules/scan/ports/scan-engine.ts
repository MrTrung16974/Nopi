import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { ScanResult } from '@nopi/contracts';
import { z } from 'zod';

export interface ScanImage {
  bytes: Buffer;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
}
export interface ScanHints {
  grade?: number;
  subject?: string;
}

/** Lỗi tạm (mạng, quá tải) → worker thử lại; lỗi dừng hẳn (ảnh không phải đề, bị từ chối) → báo người dùng. */
export class ScanError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

/**
 * Cổng đọc đề từ ảnh. Mỗi nhà cung cấp một adapter (mô hình đọc ảnh, OCR tiếng Việt trong nước…);
 * chọn nhà cung cấp sau bài thử ~100 trang thật (mục 9). Chỉ CHÉP đề, không giải, không đưa đáp án.
 */
export interface ScanEngine {
  readonly id: string;
  extract(images: ScanImage[], hints: ScanHints): Promise<ScanResult>;
}
export const SCAN_ENGINE = Symbol('SCAN_ENGINE');

// ---------------- Claude (Anthropic API) ----------------

/** Schema đầu ra ép bằng structured outputs — model trả đúng JSON này. */
const OutputSchema = z.object({
  title: z.string(),
  instructions: z.string().nullable(),
  items: z.array(
    z.object({
      number: z.string().nullable(),
      itemType: z.enum(['open', 'multiple_choice', 'fill_blank', 'read_aloud']),
      promptText: z.string(),
      promptLatex: z.string().nullable(),
      options: z.array(z.string()).nullable(),
      confidence: z.number(),
    }),
  ),
});

const SYSTEM_PROMPT = `Bạn chép đề bài từ ảnh chụp trang sách giáo khoa hoặc phiếu bài tập của học sinh Việt Nam (lớp 1–9) để giáo viên giao bài qua ứng dụng.

Nhiệm vụ của bạn chỉ là CHÉP LẠI ĐỀ. Không giải bài, không gợi ý, không thêm đáp án. Nếu trên trang đã có chữ viết tay trả lời hoặc đáp án in sẵn, bỏ phần đó và giữ chỗ trống (ví dụ "....."), vì học sinh sẽ thấy nội dung bạn chép.

Cách chép:
- Giữ nguyên chữ tiếng Việt có dấu, đúng chính tả như trên trang. Không viết lại, không tóm tắt.
- title: tên bài hoặc tiêu đề chính của trang (ví dụ "Bài 12: Phép cộng trong phạm vi 10"). Để chuỗi rỗng nếu không có.
- instructions: lời dặn chung cho cả bài (nếu có), không lặp lại trong từng câu.
- items: mỗi câu/bài tập đánh số là một mục, theo đúng thứ tự trên trang (nhiều ảnh thì theo thứ tự ảnh). number là số thứ tự như in ("1", "2a", "Bài 3"…), null nếu không có.
- itemType: "multiple_choice" khi có các phương án A/B/C/D (đưa từng phương án vào options, giữ chữ cái đầu như "A. 12"); "fill_blank" khi có chỗ trống cần điền; "read_aloud" khi yêu cầu đọc to, đọc thuộc, kể lại; còn lại "open".
- Biểu thức toán: ghi bằng chữ thường trong promptText và thêm bản LaTeX vào promptLatex (null nếu câu không có công thức).
- confidence từ 0 đến 1: hạ thấp khi chữ mờ, bị che, chữ viết tay khó đọc hoặc bạn không chắc đã chép đúng, để giáo viên soát lại.
- Bỏ qua số trang, đầu trang, chân trang, hình minh hoạ không có chữ.
- Nếu ảnh không phải trang đề bài, trả title rỗng và items rỗng.`;

export class ClaudeScanEngine implements ScanEngine {
  readonly id = 'claude';
  private readonly client: Anthropic;

  constructor(client?: Anthropic) {
    // Thông tin xác thực lấy từ môi trường (ANTHROPIC_API_KEY hoặc hồ sơ `ant auth login`)
    this.client = client ?? new Anthropic({ maxRetries: 2, timeout: 120_000 });
  }

  async extract(images: ScanImage[], hints: ScanHints): Promise<ScanResult> {
    const context = [hints.grade ? `lớp ${hints.grade}` : null, hints.subject ? `môn ${hints.subject}` : null].filter(Boolean).join(', ');
    try {
      const response = await this.client.beta.messages.parse({
        model: 'claude-opus-5-5',
        max_tokens: 16000,
        // Bị từ chối nhầm (bộ lọc an toàn) thì server tự chạy lại trên model dự phòng
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: SYSTEM_PROMPT,
        output_config: { effort: 'medium', format: betaZodOutputFormat(OutputSchema) },
        messages: [
          {
            role: 'user',
            content: [
              ...images.map((img) => ({
                type: 'image' as const,
                source: { type: 'base64' as const, media_type: img.mimeType, data: img.bytes.toString('base64') },
              })),
              { type: 'text' as const, text: `Chép đề từ ${images.length} ảnh trên${context ? ` (${context})` : ''}.` },
            ],
          },
        ],
      });
      if (response.stop_reason === 'refusal') throw new ScanError('Chưa đọc được trang này, thầy cô soạn tay giúp nhé', false);
      if (response.stop_reason === 'max_tokens') throw new ScanError('Trang quá dài, thầy cô quét ít trang hơn mỗi lần nhé', false);
      const out = response.parsed_output;
      if (!out) throw new ScanError('Chưa đọc được đề, thử lại nhé', true);
      return {
        title: out.title.trim(),
        instructions: out.instructions?.trim() || null,
        items: out.items
          .filter((it) => it.promptText.trim())
          .map((it) => ({
            number: it.number,
            itemType: it.itemType,
            promptText: it.promptText.trim(),
            promptLatex: it.promptLatex || null,
            options: it.options?.length ? it.options : null,
            aiConfidence: Math.min(1, Math.max(0, it.confidence)),
          })),
      };
    } catch (err) {
      if (err instanceof ScanError) throw err;
      if (err instanceof Anthropic.RateLimitError || err instanceof Anthropic.InternalServerError || err instanceof Anthropic.APIConnectionError) {
        throw new ScanError('Dịch vụ đọc đề đang bận, đang thử lại…', true);
      }
      if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
        throw new ScanError('Chưa cấu hình dịch vụ đọc đề', false);
      }
      if (err instanceof Anthropic.BadRequestError) throw new ScanError('Ảnh không đọc được (định dạng/kích thước), chụp lại nhé', false);
      throw err;
    }
  }
}

// ---------------- Bản giả (dev/test) ----------------

/** Trả một đề mẫu cố định (theo số ảnh) để chạy trọn luồng mà không gọi AI. */
export class FakeScanEngine implements ScanEngine {
  readonly id = 'fake';
  calls = 0;
  failNext: ScanError | null = null;
  async extract(images: ScanImage[]): Promise<ScanResult> {
    this.calls++;
    if (this.failNext) {
      const e = this.failNext;
      this.failNext = null;
      throw e;
    }
    return {
      title: 'Bài 12: Phép cộng trong phạm vi 10',
      instructions: 'Tính nhẩm rồi viết kết quả vào vở.',
      items: [
        { number: '1', itemType: 'fill_blank', promptText: '3 + 4 = .....', promptLatex: '3 + 4 = \\square', options: null, aiConfidence: 0.97 },
        { number: '2', itemType: 'multiple_choice', promptText: 'Số nào lớn hơn 7?', promptLatex: null, options: ['A. 5', 'B. 9', 'C. 6'], aiConfidence: 0.92 },
        { number: '3', itemType: 'open', promptText: `Viết phép cộng có kết quả bằng 10 (trang ${images.length}).`, promptLatex: null, options: null, aiConfidence: 0.55 },
      ],
    };
  }
}
