import { ArrowIcon } from '@/components/ui/arrow-icon';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { legalPages } from '@/content/legal';
import { Wordmark } from '@/components/brand/wordmark';
import { Footer } from '@/components/layout/footer';
export function generateStaticParams() { return Object.keys(legalPages).map(slug => ({ slug })); }
function getLegal(slug: string) { return legalPages[slug as keyof typeof legalPages]; }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return { title: getLegal(slug)?.title || 'No encontrado', alternates: { canonical: null }, robots: { index: false, follow: false } };
}
export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const page = getLegal((await params).slug); if (!page) notFound();
  return <><header className="checkout-nav page-grid"><Link href="/" aria-label="deipo. inicio"><Wordmark /></Link><Link href="/"><ArrowIcon direction="left" /> VOLVER AL DROP</Link></header><main id="main" className="legal-page page-grid"><p className="eyebrow">{page.title}</p><h1>{page.heading}</h1><p className="legal-draft">BORRADOR — REQUIERE REVISIÓN LEGAL</p><p className="legal-intro">{page.intro}</p>{page.sections.map(([title, body]) => <section key={title}><h2>{title}</h2><p>{body}</p></section>)}</main><Footer /></>;
}
