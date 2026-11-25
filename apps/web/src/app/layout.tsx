import type { Metadata } from 'next';
import './globals.css';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Nopi – Giao bài & nộp bài',
  description: 'Nộp bài, vượt vũ môn cùng Chép Con — Tiểu học & THCS (lớp 1–9)',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&family=Nunito:wght@600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
