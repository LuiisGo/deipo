import type { Database, Tables } from '@/types/database.types';
export function Inventory({ value }: { value: Database['public']['Views']['drop_inventory']['Row'] }) {
  return <dl className="admin-inventory">{[['Capacidad',value.capacity],['Preventa confirmada',value.prelaunch_sold_units],['Online',value.online_sold_units],['Held',value.held_units],['SOLD',value.total_sold],['Disponibles',value.available],['Fracción vendida',value.sold_fraction]].map(([label,n]) => <div key={label}><dt>{label}</dt><dd>{n ?? '—'}</dd></div>)}</dl>;
}
export function Audit({ rows }: { rows: Tables<'audit_log'>[] }) { return <ul className="admin-list">{rows.map(row => <li key={row.id}><strong>{row.action}</strong><time>{new Intl.DateTimeFormat('es-GT',{dateStyle:'short',timeStyle:'short',hour12:false,timeZone:'America/Guatemala'}).format(new Date(row.created_at))}</time></li>)}{!rows.length && <li>Sin actividad registrada.</li>}</ul>; }
