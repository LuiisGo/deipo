'use client';
import { ArrowIcon } from '@/components/ui/arrow-icon';
export default function ErrorPage({ reset }: { reset: () => void }) { return <main id="main" className="checkout-unavailable page-grid"><p className="eyebrow">UN MOMENTO.</p><h1>LET’S TRY<br />THAT AGAIN.</h1><p>No pudimos cargar esta parte. Tus datos no se enviaron.</p><button className="button" onClick={reset}>VOLVER A INTENTAR <ArrowIcon /></button></main>; }
