/** Bộ sticker Chép Con (mục 7.7). Thêm sticker = thêm một dòng; app hiển thị theo id. */
export const STICKERS = [
  { id: 'gioi-lam', label: 'Giỏi lắm!' },
  { id: 'tuyet-voi', label: 'Tuyệt vời!' },
  { id: 'co-len', label: 'Cố lên nhé!' },
  { id: 'chu-dep', label: 'Chữ đẹp quá!' },
  { id: 'doc-hay', label: 'Đọc hay lắm!' },
] as const;
export type StickerId = (typeof STICKERS)[number]['id'];
export const STICKER_IDS = STICKERS.map((s) => s.id) as [StickerId, ...StickerId[]];
