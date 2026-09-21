import { Unavailable } from '@/components/drop/unavailable';
import type { Metadata } from 'next';
import { ReceiptPrinter } from '@/components/receipt/receipt-printer';
import { getSiteMode } from '@/lib/site-mode';
import { SitePresentation } from '@/components/ui/site-presentation';
import type { PreviewParams } from '@/content/current-drop';
export const metadata: Metadata = { title: 'Tu recibo', robots: { index: false, follow: false }, alternates: { canonical: null } };
export default async function SuccessPage({ searchParams }: { searchParams: Promise<PreviewParams> }) { if (getSiteMode(await searchParams) === 'production') return <Unavailable />; return <SitePresentation mode={getSiteMode(await searchParams)}><ReceiptPrinter /></SitePresentation>; }
