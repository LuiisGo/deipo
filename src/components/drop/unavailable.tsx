import Link from 'next/link';
import { DeipoLogo } from '@/components/brand/deipo-logo';
import { formatOpening } from '@/lib/time';
export function Unavailable({failed=false,next=null}: {failed?:boolean;next?:{number:string;name:string;ordersOpenAt:string|null}|null}) {
 return <main id="main" className="brand-opening page-grid" style={{minHeight:'100svh',paddingTop:'12vh'}}><DeipoLogo variant="hero" /><div><p className="eyebrow">{failed?'TEMPORALMENTE NO DISPONIBLE':'A MORE INTERESTING TABLE AWAITS.'}</p><h1>{next ? `DROP ${next.number} — ${next.name}` : 'Lo bueno merece un momento.'}</h1><p>{next ? formatOpening({ordersOpenAt:next.ordersOpenAt,openingReference:null}) : 'Pronto compartiremos el próximo drop.'}</p><p>Los pedidos online todavía no están habilitados.</p>{failed && <Link href="/">Volver a intentar</Link>}</div></main>;
}
