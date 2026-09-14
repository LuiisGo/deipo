import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getPreviewDrop, type PreviewParams } from '@/content/current-drop';
import { DropProvider } from '@/components/drop/drop-context';
import { CheckoutShell } from '@/components/checkout/checkout-shell';
export const metadata: Metadata = { title: 'Tu drop', robots: { index: false, follow: false }, alternates: { canonical: null } };
export default async function CheckoutPage({ searchParams }: { searchParams: Promise<PreviewParams> }) {
  return <Suspense><DropProvider drop={getPreviewDrop(await searchParams)}><CheckoutShell /></DropProvider></Suspense>;
}
