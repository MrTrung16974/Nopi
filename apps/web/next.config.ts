import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // /api/* do route handler src/app/api/[...path]/route.ts (BFF, cookie httpOnly) chuyển tiếp tới API
};
export default config;
