import type { Metadata } from 'next';
import '@fontsource/manrope/latin-400.css';
import '@fontsource/manrope/latin-500.css';
import '@fontsource/manrope/latin-600.css';
import '@fontsource/manrope/latin-700.css';
import '@fontsource/anton/latin-400.css';
import './globals.css';
import { brand } from '@/content/brand';
import { OrderProvider } from '@/components/checkout/order-context';
export const metadata: Metadata = {
  title: { default: 'deipo. — Limited food drops by chefs', template: '%s | deipo.' },
  description: 'Drops gastronómicos limitados, creados por chefs en Ciudad de Guatemala. Conocé DROP 001 — SUNDAY ROAST. Vista previa antes del lanzamiento.',
  metadataBase: new URL(brand.siteUrl || 'http://localhost:3000'),
  ...(brand.siteUrl ? { alternates: { canonical: '/' } } : {}),
  openGraph: { title: 'deipo. — A more interesting table awaits.', description: 'Drops gastronómicos limitados. Ciudad de Guatemala. Vista previa antes del lanzamiento.', type: 'website', locale: 'es_GT', siteName: brand.name },
  twitter: { card: 'summary_large_image' },
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="es-GT"><body><a className="skip-link" href="#main">Saltar al contenido</a><OrderProvider>{children}</OrderProvider></body></html>;
}
