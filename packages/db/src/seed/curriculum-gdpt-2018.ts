import type { GradingSchemeId } from '@nopi/domain';

/**
 * Danh mục môn theo chương trình GDPT 2018.
 * - Tiểu học (lớp 1–5): đánh giá thường xuyên bằng nhận xét (TT 27/2020) → completion_level
 * - THCS (lớp 6–9): TT 32/2018 sửa đổi bởi TT 13/2022; thang theo TT 22/2021
 * Sửa danh mục = sửa file này và chạy lại seed (idempotent), không sửa code nghiệp vụ.
 */
export interface SubjectSeed {
  code: string;
  name: string;
  shortName: string;
  groupCode?: string;
  icon: string;
  color: string;
  /** khối → cấu hình riêng của khối đó */
  grades: Partial<Record<number, { optional?: boolean; scheme: GradingSchemeId; name?: string }>>;
}

const range = (from: number, to: number, cfg: { optional?: boolean; scheme: GradingSchemeId }) =>
  Object.fromEntries(Array.from({ length: to - from + 1 }, (_, i) => [from + i, cfg]));

const P = { scheme: 'completion_level' } as const; // tiểu học
const S10 = { scheme: 'score_10' } as const; // THCS: nhận xét + điểm
const PF = { scheme: 'pass_fail' } as const; // THCS: Đạt / Chưa đạt

/** Thứ tự trong mảng = thứ tự ô trên trang chủ (cố định, không nhảy vị trí). */
export const SUBJECTS: SubjectSeed[] = [
  { code: 'TIENG_VIET', name: 'Tiếng Việt', shortName: 'Tiếng Việt', icon: 'book-open', color: '#F97316', grades: range(1, 5, P) },
  { code: 'NGU_VAN', name: 'Ngữ văn', shortName: 'Ngữ văn', icon: 'book-open', color: '#F97316', grades: range(6, 9, S10) },
  { code: 'TOAN', name: 'Toán', shortName: 'Toán', icon: 'calculator', color: '#2563EB', grades: { ...range(1, 5, P), ...range(6, 9, S10) } },
  {
    code: 'NGOAI_NGU_1', name: 'Ngoại ngữ 1 (Tiếng Anh)', shortName: 'Tiếng Anh', icon: 'languages', color: '#7C3AED',
    grades: { ...range(1, 2, { ...P, optional: true }), ...range(3, 5, P), ...range(6, 9, S10) },
  },
  { code: 'DAO_DUC', name: 'Đạo đức', shortName: 'Đạo đức', icon: 'heart', color: '#DB2777', grades: range(1, 5, P) },
  { code: 'GDCD', name: 'Giáo dục công dân', shortName: 'GDCD', icon: 'heart', color: '#DB2777', grades: range(6, 9, S10) },
  { code: 'TN_XH', name: 'Tự nhiên và Xã hội', shortName: 'TN & XH', icon: 'sprout', color: '#16A34A', grades: range(1, 3, P) },
  { code: 'KHOA_HOC', name: 'Khoa học', shortName: 'Khoa học', icon: 'search', color: '#0D9488', grades: range(4, 5, P) },
  { code: 'KHTN', name: 'Khoa học tự nhiên', shortName: 'KHTN', icon: 'flask-conical', color: '#0D9488', grades: range(6, 9, S10) },
  { code: 'LS_DL', name: 'Lịch sử và Địa lí', shortName: 'Sử & Địa', icon: 'globe', color: '#92400E', grades: { ...range(4, 5, P), ...range(6, 9, S10) } },
  { code: 'TIN_HOC_CN', name: 'Tin học và Công nghệ', shortName: 'Tin & CN', icon: 'monitor', color: '#475569', grades: range(3, 5, P) },
  { code: 'TIN_HOC', name: 'Tin học', shortName: 'Tin học', icon: 'monitor', color: '#475569', grades: range(6, 9, S10) },
  { code: 'CONG_NGHE', name: 'Công nghệ', shortName: 'Công nghệ', icon: 'wrench', color: '#64748B', grades: range(6, 9, S10) },
  { code: 'GDTC', name: 'Giáo dục thể chất', shortName: 'Thể dục', icon: 'volleyball', color: '#DC2626', grades: { ...range(1, 5, P), ...range(6, 9, PF) } },
  // Âm nhạc và Mĩ thuật tách hai ô vì thường do hai giáo viên dạy; cùng nhóm Nghệ thuật
  { code: 'AM_NHAC', name: 'Nghệ thuật — Âm nhạc', shortName: 'Âm nhạc', groupCode: 'NGHE_THUAT', icon: 'music', color: '#CA8A04', grades: { ...range(1, 5, P), ...range(6, 9, PF) } },
  { code: 'MI_THUAT', name: 'Nghệ thuật — Mĩ thuật', shortName: 'Mĩ thuật', groupCode: 'NGHE_THUAT', icon: 'palette', color: '#D97706', grades: { ...range(1, 5, P), ...range(6, 9, PF) } },
  { code: 'HDTN', name: 'Hoạt động trải nghiệm', shortName: 'Trải nghiệm', icon: 'star', color: '#0284C7', grades: range(1, 5, P) },
  { code: 'HDTN_HN', name: 'Hoạt động trải nghiệm, hướng nghiệp', shortName: 'Trải nghiệm', icon: 'star', color: '#0284C7', grades: range(6, 9, PF) },
  { code: 'GDDP', name: 'Nội dung giáo dục địa phương', shortName: 'GD địa phương', icon: 'map-pin', color: '#0891B2', grades: range(6, 9, PF) },
  {
    code: 'TIENG_DTTS', name: 'Tiếng dân tộc thiểu số', shortName: 'Tiếng dân tộc', icon: 'type', color: '#4D7C0F',
    grades: { ...range(1, 5, { ...P, optional: true }), ...range(6, 9, { ...S10, optional: true }) },
  },
  { code: 'NGOAI_NGU_2', name: 'Ngoại ngữ 2', shortName: 'Ngoại ngữ 2', icon: 'languages', color: '#6D28D9', grades: range(6, 9, { ...S10, optional: true }) },
];

/** Câu nhận xét mẫu của hệ thống. */
export const SYSTEM_COMMENTS: { stage: 'primary' | 'lower_secondary' | null; subjectCode?: string; text: string }[] = [
  { stage: 'primary', text: 'Con làm bài đầy đủ, cô khen con!' },
  { stage: 'primary', text: 'Chữ viết đẹp, trình bày sạch sẽ.' },
  { stage: 'primary', subjectCode: 'TIENG_VIET', text: 'Con đọc to, rõ ràng.' },
  { stage: 'primary', subjectCode: 'TIENG_VIET', text: 'Con đọc còn chậm, luyện đọc thêm ở nhà nhé.' },
  { stage: 'primary', subjectCode: 'TOAN', text: 'Con tính đúng và nhanh.' },
  { stage: 'primary', subjectCode: 'TOAN', text: 'Con cẩn thận hơn khi tính nhé.' },
  { stage: 'primary', text: 'Con cố gắng thêm một chút nữa nhé!' },
  { stage: 'lower_secondary', text: 'Bài làm tốt, trình bày rõ ràng.' },
  { stage: 'lower_secondary', text: 'Cần trình bày lời giải đầy đủ hơn.' },
  { stage: 'lower_secondary', text: 'Em xem lại phần kiến thức này và làm lại nhé.' },
  { stage: null, text: 'Tiến bộ rõ so với bài trước!' },
];

/** Mẫu bài có sẵn (mục 6.1 tài liệu thiết kế). */
export const SYSTEM_ASSIGNMENT_TEMPLATES = [
  { code: 'READ_ALOUD', name: 'Đọc bài, đọc thuộc lòng', subjects: ['TIENG_VIET', 'NGOAI_NGU_1'], defaults: { submissionKinds: ['audio'], maxPhotos: 0, maxMediaSeconds: 180 } },
  { code: 'NOTEBOOK', name: 'Bài tập trong vở', subjects: ['TOAN', 'TIENG_VIET', 'NGU_VAN'], defaults: { submissionKinds: ['photo'], maxPhotos: 5, maxMediaSeconds: 0 } },
  { code: 'PERFORMANCE', name: 'Bài tập thể dục, hát, múa', subjects: ['GDTC', 'AM_NHAC'], defaults: { submissionKinds: ['video'], maxPhotos: 0, maxMediaSeconds: 120 } },
  { code: 'CRAFT', name: 'Vẽ tranh, làm sản phẩm', subjects: ['MI_THUAT', 'CONG_NGHE', 'HDTN', 'HDTN_HN'], defaults: { submissionKinds: ['photo', 'video'], maxPhotos: 3, maxMediaSeconds: 60 } },
  { code: 'PRESENTATION', name: 'Kể chuyện, thuyết trình', subjects: ['TIENG_VIET', 'NGU_VAN', 'KHTN'], defaults: { submissionKinds: ['video', 'audio'], maxPhotos: 0, maxMediaSeconds: 180 } },
] as const;
