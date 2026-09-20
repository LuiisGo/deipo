import { previewDrop } from '@/lib/deipo/repositories/storefront';
import { Storefront } from '@/components/drop/storefront';
export default async function Preview({params}: {params:Promise<{id:string}>}) { const {id}=await params;const drop=await previewDrop(id);
// eslint-disable-next-line react-hooks/purity -- Serialize request time once for hydration.
const initialTime=Date.now();
return <Storefront drop={drop} mode="admin-preview" initialTime={initialTime} />; }
