'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import type { Drop, DropStatus } from '@/types/drop';
import { getDropStatus } from '@/lib/drop';
import { track } from '@/lib/analytics';
const DropContext = createContext<{ drop: Drop; status: DropStatus } | null>(null);
export function DropProvider({ drop, children }: { drop: Drop; children: React.ReactNode }) {
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    if (!drop.salesCloseAt) return;
    const check = () => setExpired(Date.parse(drop.salesCloseAt!) <= Date.now());
    check();
    const timer = setInterval(check, 1000);
    return () => clearInterval(timer);
  }, [drop.salesCloseAt]);
  const status = getDropStatus(drop, expired ? Infinity : 0);
  useEffect(() => { track(status === 'sold_out' ? 'sold_out_view' : 'view_drop', { drop_id: drop.id, status }); }, [drop.id, status]);
  // Inventory data is injected here; replace the mock snapshot with a subscription later.
  return <DropContext.Provider value={{ drop, status }}>{children}</DropContext.Provider>;
}
export function useDrop() {
  const value = useContext(DropContext);
  if (!value) throw new Error('DropProvider is required.');
  return value;
}
