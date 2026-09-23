import { LiveCheckout } from '@/components/checkout/live-checkout';
import { loadCheckout } from '@/lib/deipo/repositories/checkout';
export const dynamic='force-dynamic';
import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getPreviewDrop, type PreviewParams } from '@/content/current-drop';
import { DropProvider } from '@/components/drop/drop-context';
import { CheckoutShell } from '@/components/checkout/checkout-shell';
import { getSiteMode } from '@/lib/site-mode';
import { SitePresentation } from '@/components/ui/site-presentation';
export const metadata: Metadata = { title: 'Tu drop', robots: { index: false, follow: false }, alternates: { canonical: null } };
export default async function CheckoutPage({ searchParams }: { searchParams: Promise<PreviewParams> }) {
  const params = await searchParams;
  if (getSiteMode(params) === 'production') {const result=await loadCheckout().then(state=>({state,failed:false})).catch(()=>({state:null,failed:true}));return <LiveCheckout initial={result.state} failed={result.failed}/>;}
  // eslint-disable-next-line react-hooks/purity -- Server request time is serialized once for identical SSR and hydration.
  const initialTime = Date.now();
  return <Suspense><SitePresentation mode={getSiteMode(params)}><DropProvider drop={getPreviewDrop(params)} initialTime={initialTime}><CheckoutShell /></DropProvider></SitePresentation></Suspense>;
}
