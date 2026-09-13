import type { NextConfig } from 'next';

// Static export: unlimited free hosting (GitHub Pages / Cloudflare Pages).
// No API routes, no middleware — AI + data run 100% in the browser.
const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
