import Link from 'next/link';
import { overview } from '@/lib/deipo/repositories/admin';
import { Inventory, Audit } from '@/components/admin/summary';
export default async function Overview() {
  const data = await overview();
  return <main id="main" className="admin-workspace"><div className="admin-title"><h1>Overview</h1><Link className="admin-button" href="/admin/drops/new">Nuevo drop</Link></div>
  <div className="admin-columns">{(['current','next'] as const).map(slot => { const d = data.drops.find(d => d.id === data.config[`${slot}_drop_id`]); const inv = data.inventory.find(i => i.drop_id === d?.id); return <section key={slot}><h2>{slot.toUpperCase()} DROP</h2>{d ? <><p className="eyebrow">DROP {String(d.number).padStart(3,'0')} / {d.lifecycle_status}</p><h3>{d.name}</h3>{inv && <Inventory value={inv} />}<Link href={`/admin/drops/${d.id}`}>Abrir drop</Link></> : <p>Sin drop asignado.</p>}</section>; })}</div>
  <section><h2>Actividad reciente</h2><Audit rows={data.audit} /></section><Link href="/admin/drops">Administrar drops</Link></main>;
}
