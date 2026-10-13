import type { Metadata } from "next";
import { DeipoLogo } from "@/components/brand/deipo-logo";
import { AssistedClaim } from "@/components/commerce/assisted-claim";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Tu pedido asistido",
  robots: { index: false, follow: false },
  alternates: { canonical: null },
};
export default async function Buy({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <main id="main" className="live-checkout-main">
      <DeipoLogo />
      <p className="eyebrow">TU PEDIDO / DEIPO</p>
      <h1>Tu drop te espera.</h1>
      <p>
        Consultaremos disponibilidad y reservaremos tu selección. Revisá el
        resumen antes de continuar al pago.
      </p>
      <AssistedClaim token={token} />
    </main>
  );
}
