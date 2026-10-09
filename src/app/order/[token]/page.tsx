import Image from "next/image";
import type { Metadata } from "next";
import { DeipoLogo } from "@/components/brand/deipo-logo";
import { readCustomerTracker } from "@/lib/deipo/customer-access";
import { publicProgress } from "@/lib/commerce/messages";
import { trackerQr } from "@/lib/commerce/qr";
import { formatOpsTime } from "@/lib/deipo/operations";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Tu pedido",
  robots: { index: false, follow: false },
  alternates: { canonical: null },
};
export default async function Tracker({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const tracker = await readCustomerTracker(token).catch(() => null);
  if (!tracker)
    return (
      <main id="main" className="live-checkout-main">
        <DeipoLogo />
        <h1>Enlace no disponible.</h1>
        <p>
          Este acceso no es válido o ya venció. Solicitá un nuevo enlace a
          DEIPO.
        </p>
      </main>
    );
  const progress = publicProgress(tracker.status, tracker.method);
  const qr = await trackerQr(token).catch(() => null);
  return (
    <main id="main" className="live-checkout-main customer-tracker">
      <DeipoLogo />
      <p className="eyebrow">TU PEDIDO / {tracker.order_code}</p>
      <p className="eyebrow">
        DROP {String(tracker.drop_number).padStart(3, "0")}
      </p>
      <h1>{tracker.product}</h1>
      <p>
        {tracker.quantity} unidades ·{" "}
        {tracker.method === "pickup" ? "PICKUP" : "DELIVERY"}
      </p>
      <p>
        {tracker.slot_start_at && tracker.slot_end_at
          ? `${formatOpsTime(tracker.slot_start_at)} – ${formatOpsTime(tracker.slot_end_at)}`
          : "Horario por confirmar"}
      </p>
      <p>PAGO CONFIRMADO</p>
      {progress.cancelled ? (
        <p>
          La entrega requiere atención. Contactá a DEIPO para conocer la
          resolución.
        </p>
      ) : (
        <ol className="customer-progress">
          {progress.steps.map(([key, label], i) => (
            <li
              key={key}
              aria-current={i === progress.current ? "step" : undefined}
              data-complete={i <= progress.current}
            >
              {label}
            </li>
          ))}
        </ol>
      )}
      {qr && (
        <Image
          unoptimized
          src={qr}
          width={240}
          height={240}
          alt="QR de acceso a este pedido"
        />
      )}
      <p className="caption">
        Este enlace es privado. Compartilo solo con quien recibirá tu pedido.
      </p>
    </main>
  );
}
