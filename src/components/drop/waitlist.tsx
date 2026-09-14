'use client';
import { useState } from 'react';
import { useDrop } from './drop-context';
import { track } from '@/lib/analytics';
import { validateContact } from '@/lib/demo-services';
export function Waitlist({ early = false }: { early?: boolean }) {
  const { status, drop } = useDrop();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closed = status === 'sold_out' || status === 'sales_closed' || status === 'upcoming';
  if (early !== closed) return null;
  return <section id="next-drop" className={`waitlist-section page-grid ${status === 'sold_out' || status === 'sales_closed' ? 'waitlist-prominent' : ''}`}>
    <div><p className="eyebrow">THERE’S ALWAYS A NEXT CHAPTER</p><h2>SEE YOU<br />NEXT DROP<span className="brand-dot">.</span></h2><p className="body-copy">El próximo drop empieza con vos.</p><p className="caption">Formulario de prueba. Tus datos no se guardan ni se envían. Las notificaciones todavía no están activas.</p></div>
    {done ? <div className="waitlist-result" role="status"><span className="eyebrow">PRUEBA COMPLETA</span><p>Aquí empieza<br />el próximo capítulo.</p><span className="caption">Tus datos se validaron y descartaron. No quedaste suscrito a ninguna lista.</span><button className="text-button" onClick={() => setDone(false)}>VOLVER A PROBAR ↗</button></div> :
      <form className="waitlist-form" onSubmit={event => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const invalid = validateContact({ name: String(data.get('name')), phone: String(data.get('phone')), email: String(data.get('email')), address: '' });
        if (invalid) { setError(invalid); return; }
        // Future waitlist API boundary. V0 validates then discards, without persistence.
        event.currentTarget.reset(); setError(null); setDone(true); track('waitlist_submit', { drop_id: drop.id });
      }}>
        <label>Nombre<input name="name" autoComplete="name" required minLength={2} maxLength={100} placeholder="Tu nombre" /></label>
        <label>WhatsApp / teléfono<input name="phone" autoComplete="tel" type="tel" pattern="[+0-9() .\-]{8,20}" required maxLength={20} placeholder="+502" /></label>
        <label>Correo electrónico<input name="email" autoComplete="email" type="email" required maxLength={254} placeholder="you@example.com" /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button button-dark" type="submit">AVISAME DEL PRÓXIMO DROP <span aria-hidden="true">↗</span></button>
      </form>}
  </section>;
}
