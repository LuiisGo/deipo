'use client';
import Link from 'next/link';
import { DeipoLogo } from '@/components/brand/deipo-logo';
import { LiveStockIndicator, usePreviewHref } from '@/components/drop/controls';
import { useDrop } from '@/components/drop/drop-context';
import { isPurchasable } from '@/lib/drop';
export function Navigation() {
  const { status } = useDrop();
  const home = usePreviewHref('/');
  const active = isPurchasable(status);
  return <header className="navigation page-grid"><Link href={home} aria-label="deipo. inicio"><DeipoLogo /></Link><nav aria-label="Navegación principal"><a href="#the-drop">{status === 'sold_out' ? 'ARCHIVE' : 'THE DROP'}</a><a href={active ? '#how-it-works' : '#next-drop'}>{active ? 'CÓMO FUNCIONA' : 'NEXT DROP'}</a></nav><LiveStockIndicator /></header>;
}
