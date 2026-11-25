'use client';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

/** Ảnh QR tạo ngay trên trình duyệt (không gửi mã ra dịch vụ ngoài). */
export function QrImage({ value, size = 180, alt }: { value: string; size?: number; alt: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(value, { width: size * 2, margin: 1, errorCorrectionLevel: 'M' }).then(setSrc, () => setSrc(null));
  }, [value, size]);
  return src ? <img src={src} width={size} height={size} alt={alt} /> : <div style={{ width: size, height: size }} />;
}
