import type { MetadataRoute } from 'next';
import { brand } from '@/content/brand';
// V0 is intentionally noindex; enable the confirmed public origin at launch.
export default function sitemap(): MetadataRoute.Sitemap { return brand.isDemo || !brand.siteUrl ? [] : [{ url: brand.siteUrl, changeFrequency: 'weekly', priority: 1 }]; }
