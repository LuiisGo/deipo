'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { PreviewOnly } from '@/components/ui/site-presentation';
import { previewStates } from '@/content/current-drop';
export function PreviewControls() {
  const params = useSearchParams();
  const router = useRouter();
  return <PreviewOnly><details className="preview-controls"><summary>EXPLORAR ESTADOS V0.1 <span aria-hidden="true">+</span></summary><div>
    <p className="caption">Vista de diseño. Stock y pedidos de prueba; precio estimado.</p>
    <label>Estado del drop<select value={params.get('state') || 'active'} onChange={event => { const query = new URLSearchParams(params); query.set('state', event.target.value); router.push(`/?${query}`, { scroll: false }); }}>{previewStates.map(state => <option value={state} key={state}>{state.replaceAll('_', ' ').toUpperCase()}</option>)}</select></label>
    <label className="check-row"><input type="checkbox" checked={params.get('clock') === 'demo'} onChange={event => { const query = new URLSearchParams(params); if (event.target.checked) query.set('clock', 'demo'); else query.delete('clock'); router.push(`/?${query}`, { scroll: false }); }} />Mostrar contador con fecha de prueba fija (18 sep. 2026)</label>
  </div></details></PreviewOnly>;
}
