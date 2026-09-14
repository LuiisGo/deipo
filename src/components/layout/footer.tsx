import Link from 'next/link';
import { Wordmark } from '@/components/brand/wordmark';
import { brand } from '@/content/brand';
export function Footer() {
  return <footer className="footer page-grid"><div className="footer-top"><Link href="/" aria-label="deipo. home"><Wordmark /></Link><p className="eyebrow">A MORE INTERESTING<br />TABLE AWAITS.</p></div>
    <div className="footer-bottom"><span className="caption">© {new Date().getFullYear()} {brand.name} · Guatemala City</span><nav aria-label="Legal"><Link href="/legal/terms">Términos</Link><Link href="/legal/privacy">Privacidad</Link><Link href="/legal/orders">Pedidos</Link><Link href="/legal/quality">Calidad</Link></nav><div className="social-links">{brand.instagram ? <a href={brand.instagram} target="_blank" rel="noopener noreferrer">Instagram ↗</a> : <span>Instagram · pronto</span>}{brand.whatsapp ? <a href={brand.whatsapp} target="_blank" rel="noopener noreferrer">WhatsApp ↗</a> : <span>Soporte · pronto</span>}</div></div>
  </footer>;
}
