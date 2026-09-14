import Link from 'next/link';
import { Wordmark } from '@/components/brand/wordmark';
import { LiveStockIndicator } from '@/components/drop/controls';
export function Navigation() {
  return <header className="navigation page-grid"><Link href="/" aria-label="deipo. home"><Wordmark /></Link><nav aria-label="Main navigation"><a href="#the-drop">THE DROP</a><a href="#how-it-works">CÓMO FUNCIONA</a></nav><LiveStockIndicator /></header>;
}
