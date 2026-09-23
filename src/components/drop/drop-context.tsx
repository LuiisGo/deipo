'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import type { Drop, DropStatus } from '@/types/drop';
import { getDropStatus } from '@/lib/drop';
import { getInventory } from '@/lib/inventory';
import { useRouter } from 'next/navigation';
import { track } from '@/lib/analytics';
const DropContext = createContext<{ drop: Drop; status: DropStatus; inventory: ReturnType<typeof getInventory> } | null>(null);
export function DropProvider({ drop, initialTime, children }: { drop: Drop; initialTime: number; children: React.ReactNode }) {
  const [clock, setClock] = useState<{ opening: string | null; closing: string | null; now: number } | null>(null);
  useEffect(() => {
    if (!drop.salesCloseAt && !drop.ordersOpenAt) return;
    const check = () => setClock({ opening: drop.ordersOpenAt, closing: drop.salesCloseAt, now: Date.now() });
    check();
    const timer = setInterval(check, 1000);
    return () => clearInterval(timer);
  }, [drop.ordersOpenAt, drop.salesCloseAt]);
  // Stable SSR/hydration snapshot. Ignore clock state from a previously injected schedule.
  const now = clock?.opening === drop.ordersOpenAt && clock?.closing === drop.salesCloseAt ? clock.now : initialTime;
  const status = getDropStatus(drop, now);
  const inventory = getInventory(drop);
  useEffect(() => { track(status === 'sold_out' ? 'sold_out_view' : 'view_drop', { drop_id: drop.id, status }); }, [drop.id, status]);
  const router=useRouter();
  useEffect(()=>{
    if(drop.source!=='production'||!drop.onlineOrderingEnabled||status==='sold_out'||status==='sales_closed')return;
    let busy=false;
    const refresh=()=>{if(document.visibilityState!=='visible'||busy)return;busy=true;router.refresh();setTimeout(()=>{busy=false;},1500);};
    const timer=setInterval(refresh,15000);
    document.addEventListener('visibilitychange',refresh);window.addEventListener('focus',refresh);
    return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',refresh);window.removeEventListener('focus',refresh);};
  },[drop.source,drop.onlineOrderingEnabled,status,router]);
  return <DropContext.Provider value={{ drop, status, inventory }}>{children}</DropContext.Provider>;
}
export function useDrop() {
  const value = useContext(DropContext);
  if (!value) throw new Error('DropProvider is required.');
  return value;
}
