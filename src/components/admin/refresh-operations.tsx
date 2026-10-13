"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
export function RefreshOperations() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      className="admin-button"
      disabled={pending}
      onClick={() => startTransition(() => router.refresh())}
    >
      {pending ? "Actualizando…" : "Actualizar"}
    </button>
  );
}
