import type { NextConfig } from 'next';
const assetOrigin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qntjxfmwblhetpsmzzhm.supabase.co');
const config: NextConfig = {
  poweredByHeader: false,
  logging: { incomingRequests: { ignore: [/\/(order|buy)\//] }, serverFunctions: false },
  distDir: process.env.DEIPO_BUILD_DIR || '.next',
  images: { remotePatterns: [{ protocol: assetOrigin.protocol === 'http:' ? 'http' : 'https', hostname: assetOrigin.hostname, port: assetOrigin.port, pathname: '/storage/v1/object/public/drop-assets/**' }] },
  async headers() {
    return [{ source: '/(.*)', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
      { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
    ] }, ...['/order/:path*','/buy/:path*','/success','/api/customer/:path*','/ops/print/:path*'].map(source=>({source,headers:[
      {key:'Cache-Control',value:'private, no-store'},
      {key:'Netlify-CDN-Cache-Control',value:'no-store'},
      {key:'Referrer-Policy',value:'no-referrer'},
      {key:'X-Robots-Tag',value:'noindex, nofollow'},
    ]}))];
  },
};
export default config;
