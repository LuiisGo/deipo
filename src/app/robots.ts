import type { MetadataRoute } from 'next';
import { brand } from '@/content/brand';
export default function robots(): MetadataRoute.Robots { return { rules: { userAgent: '*', disallow: '/' }, ...(brand.siteUrl ? { sitemap: `${brand.siteUrl}/sitemap.xml` } : {}) }; }
