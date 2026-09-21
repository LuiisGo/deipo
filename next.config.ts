import type { NextConfig } from 'next';
const assetOrigin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qntjxfmwblhetpsmzzhm.supabase.co');
const config: NextConfig = {
  poweredByHeader: false,
  distDir: process.env.DEIPO_BUILD_DIR || '.next',
  images: { remotePatterns: [{ protocol: assetOrigin.protocol === 'http:' ? 'http' : 'https', hostname: assetOrigin.hostname, port: assetOrigin.port, pathname: '/storage/v1/object/public/drop-assets/**' }] },
  async headers() {
    return [{ source: '/(.*)', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
    ] }];
  },
};
export default config;
