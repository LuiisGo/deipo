'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { DeipoLogo } from '@/components/brand/deipo-logo';
import { LiveStockIndicator, usePreviewHref } from '@/components/drop/controls';
import { useDrop } from '@/components/drop/drop-context';
import { isPurchasable } from '@/lib/drop';
export function Navigation() {
  const { status } = useDrop();
  const home = usePreviewHref('/');
  const active = isPurchasable(status);
  const [compact, setCompact] = useState(false);
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    const mobile = window.matchMedia('(max-width: 767px)');
    let frame = 0;
    const update = () => {
      frame = 0;
      const focusedNavigation = nav.current?.querySelector(':focus-visible');
      setCompact(previous => mobile.matches && !focusedNavigation && (previous ? window.scrollY > 120 : window.scrollY >= 260));
    };
    const queue = () => { if (!frame) frame = requestAnimationFrame(update); };
    queue();
    window.addEventListener('scroll', queue, { passive: true });
    mobile.addEventListener('change', queue);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', queue); mobile.removeEventListener('change', queue); };
  }, []);
  return <header className="navigation page-grid" data-signal={compact ? 'compact' : 'expanded'}><Link href={home} aria-label="deipo. inicio" onFocus={event => { if (event.currentTarget.matches(':focus-visible')) setCompact(false); }}><DeipoLogo /></Link><nav ref={nav} aria-label="Navegación principal" onFocus={() => setCompact(false)}><a href="#the-drop">{status === 'sold_out' ? 'ARCHIVE' : 'THE DROP'}</a><a href={active ? '#how-it-works' : '#next-drop'}>{active ? 'CÓMO FUNCIONA' : 'NEXT DROP'}</a></nav><LiveStockIndicator /></header>;
}
