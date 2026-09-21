import { getPreviewDrop, type PreviewParams } from '@/content/current-drop';
import { Storefront } from '@/components/drop/storefront';
import { getSiteMode } from '@/lib/site-mode';
import { storefrontState } from '@/lib/deipo/repositories/storefront';
import { Unavailable } from '@/components/drop/unavailable';
export const dynamic='force-dynamic';
export default async function Home({searchParams}: {searchParams:Promise<PreviewParams>}) {
  const params=await searchParams; const mode=getSiteMode(params);
  // eslint-disable-next-line react-hooks/purity -- Serialize one server request timestamp for hydration.
  const initialTime=Date.now();
  if(mode==='production') {
    const data=await storefrontState().catch(()=>null);
    if(!data) return <Unavailable failed />;
    const {current,next}=data;
    if(!current) return <Unavailable next={next ? {number:next.number,name:next.name,ordersOpenAt:next.ordersOpenAt}:null} />;
    return <Storefront drop={current} mode="production" initialTime={initialTime} />;
  }
  return <Storefront drop={getPreviewDrop(params)} mode={mode} params={params} initialTime={initialTime} />;
}
