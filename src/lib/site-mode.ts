import type { PreviewParams } from '@/content/current-drop';

export type SiteMode = 'preview' | 'customer-preview';

// Presentation only. Neither value enables orders, persistence, payments or indexing.
export function getSiteMode(params: PreviewParams = {}): SiteMode {
  const value = params.mode ?? process.env.NEXT_PUBLIC_SITE_MODE;
  return value === 'customer-preview' ? 'customer-preview' : 'preview';
}
