'use client';
import { useActionState, useRef, type ReactNode } from 'react';
import type { ActionState } from '@/app/admin/actions';
export function AdminForm({ action, children, label = 'Guardar', confirm, disabled = false }: { action: (state: ActionState, form: FormData) => Promise<ActionState>; children?: ReactNode; label?: string; confirm?: string; disabled?: boolean }) {
  const [state, submit, pending] = useActionState(action, {});
  const dialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const approved = useRef(false);
  return <form ref={form} action={submit} onSubmit={event => {
    if (confirm && !approved.current) { event.preventDefault(); dialog.current?.showModal(); }
    approved.current = false;
  }} className="admin-form">
    <fieldset disabled={pending || disabled}>{children}<button type="submit" className="admin-button">{pending ? 'Guardando…' : label}</button></fieldset>
    {state.error && <p role="alert" className="admin-message">{state.error}</p>}
    {state.success && <p role="status" className="admin-message">{state.success}</p>}
    {confirm && <dialog ref={dialog} className="admin-dialog" aria-label="Confirmar operación"><h2>Confirmar</h2><p>{confirm}</p><div className="admin-actions"><button type="button" onClick={() => dialog.current?.close()}>Cancelar</button><button type="button" className="admin-button" onClick={() => { approved.current = true; dialog.current?.close(); form.current?.requestSubmit(); }}>Confirmar</button></div></dialog>}
  </form>;
}
