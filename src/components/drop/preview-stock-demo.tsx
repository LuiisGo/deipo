'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { useSiteMode } from '@/components/ui/site-presentation';
import { DropProvider } from './drop-context';
import { getDropStatus, isPurchasable } from '@/lib/drop';
import { getInventory } from '@/lib/inventory';
import type { Drop } from '@/types/drop';

// Separate from the data provider: production/customer views never mount this clock.
export function PreviewStockDemo({ drop, enabled, initialTime, children }: { drop: Drop; enabled: boolean; initialTime: number; children: ReactNode }) {
  const mode = useSiteMode();
  if (mode !== 'preview' || !enabled) return <DropProvider drop={drop} initialTime={initialTime}>{children}</DropProvider>;
  return <BoundedSimulation key={JSON.stringify([drop.id, drop.capacity, drop.prelaunchSoldUnits, drop.sold, drop.heldUnits, drop.status, drop.ordersOpenAt, drop.salesCloseAt])} drop={drop} initialTime={initialTime}>{children}</BoundedSimulation>;
}
function BoundedSimulation({ drop, initialTime, children }: { drop: Drop; initialTime: number; children: ReactNode }) {
  const [increase, setIncrease] = useState(0);
  const available = getInventory(drop).available;
  useEffect(() => {
    const timers = [1, 3, 5].map((increment, index) => window.setTimeout(() => {
      if (isPurchasable(getDropStatus(drop))) setIncrease(Math.min(increment, available));
    }, (index + 1) * 12000));
    return () => timers.forEach(clearTimeout);
  }, [drop, available]);
  return <DropProvider drop={{ ...drop, sold: drop.sold + increase }} initialTime={initialTime}>
    <div className="stock-demo-notice" role="status">SIMULACIÓN INTERNA DE STOCK · +{increase} / +5 · SIN VENTAS REALES</div>
    {children}
  </DropProvider>;
}
