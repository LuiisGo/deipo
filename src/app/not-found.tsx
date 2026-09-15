import { ArrowIcon } from '@/components/ui/arrow-icon';
import Link from 'next/link';
import { Wordmark } from '@/components/brand/wordmark';
export default function NotFound() { return <main id="main" className="checkout-unavailable page-grid"><Wordmark /><p className="eyebrow">404 / FUERA DEL MENÚ</p><h1>NOT THIS<br />DROP.</h1><p>La página que buscás no está aquí.</p><Link href="/" className="button">VOLVER AL DROP <span><ArrowIcon /></span></Link></main>; }
