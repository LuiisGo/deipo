import type { PreviewParams } from '@/content/current-drop';

export type SiteMode = 'preview' | 'customer-preview' | 'production' | 'admin-preview';

// Preview must be intentional in production builds; missing/invalid configuration fails closed.
export function getSiteMode(params: PreviewParams = {}): SiteMode {
  const configured = process.env.NEXT_PUBLIC_SITE_MODE;
  if (configured && configured !== 'preview' && configured !== 'customer-preview') return 'production';
  if (!configured && process.env.NODE_ENV === 'production') return 'production';
  const value = params.mode ?? process.env.NEXT_PUBLIC_SITE_MODE;
  return value === 'customer-preview' ? 'customer-preview' : 'preview';
}
