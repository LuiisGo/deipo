import { DeipoLogo } from "@/components/brand/deipo-logo";
import { OpsLoginForm } from "@/components/ops/login";
export default async function OpsLogin({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const p = await searchParams;
  return (
    <main id="main" className="ops-login">
      <DeipoLogo />
      <p className="eyebrow">DROP CONTROL / STAFF</p>
      <h1>Entrar a operación.</h1>
      <p>Acceso únicamente por invitación.</p>
      {p.error && (
        <p role="alert">Tu cuenta no tiene una sesión operativa activa.</p>
      )}
      <OpsLoginForm />
    </main>
  );
}
