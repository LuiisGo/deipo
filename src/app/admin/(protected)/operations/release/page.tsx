import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/supabase/auth';
import { runtimeReadiness } from '@/lib/commerce/readiness';
import { ReleaseControls } from '@/components/ops/release-controls';
import './release.css';
type Report = {drop:{number:number;name:string;currency:string};as_of:string;sold_units:number;sold_out_percent:number;totals:Record<string,number|null>;issues:Record<string,number>;production:Record<string,number>;payment_methods:Record<string,string|number>[];sales_channels:Record<string,string|number>[];slots:Record<string,string|number|null>[];timing_note:string};
type Readiness = {retention_days:number|null;bank_grace_seconds:number|null;checks:Record<string,boolean>;closed_report:{closed_at:string;report:Report}|null};
function Breakdown({title,rows}:{title:string;rows:Record<string,string|number|null>[]}) {
 const columns:Record<string,string>={method:'Método',orders:'Pedidos',verified_paid_minor:'Pago verificado (centavos)',sales_channel:'Canal',units:'Unidades',gross_minor:'Bruto (centavos)',starts_at:'Inicio',ends_at:'Fin',max_orders:'Cupo pedidos',max_units:'Cupo unidades'};
 const values:Record<string,string>={payment:'Tarjeta',bank_transfer:'Transferencia',unconfirmed:'Sin confirmar',web:'Web',whatsapp_manual:'WhatsApp asistido',admin_assisted:'Admin asistido'};
 const keys=rows.length?Object.keys(rows[0]):[];
 return <section><h3>{title}</h3>{rows.length?<div className="release-table" tabIndex={0} role="region" aria-label={title}><table><thead><tr>{keys.map(key=><th key={key}>{columns[key]??key}</th>)}</tr></thead><tbody>{rows.map((row,n)=><tr key={n}>{keys.map(key=><td key={key}>{row[key]===null?'Sin configurar':values[String(row[key])]??String(row[key])}</td>)}</tr>)}</tbody></table></div>:<p>Sin datos.</p>}</section>;
}
const labels:Record<string,string>={current_drop:'CURRENT asignado',published:'Publicado',capacity:'Capacidad',quantity_policy:'Máximo por pedido (o confirmar sin límite)',price:'Precio mayor que cero',product_content:'Contenido y componentes comerciales',orders_open_at:'Inicio de venta',orders_close_at:'Fin de venta',fulfillment_date:'Fecha de entrega',cancellation_cutoff:'Corte de cancelación',pickup_delivery:'Pickup y delivery',three_slots:'Tres horarios',slot_capacities:'Capacidad por horario',zones_fees:'Zonas y tarifas',packing:'Plan de packing',lead_times:'Lead times (o confirmar que no se usan)',tracker_duration:'Duración de tracker',draft_retention:'Retención de borradores',staff_roles:'Kitchen, Fulfillment y Driver activos',supabase:'Conexión y servicio de datos',staff_invite_origin:'Origen de invitaciones',customer_commerce_origin:'Origen de comercio',encryption_key:'Clave de acceso cliente',whatsapp:'Número WhatsApp',payment_methods:'Métodos explícitos',provider_acceptance:'Aceptación del proveedor registrada',sandbox_config:'Pagos Sandbox configurados',bank_grace:'Gracia de transferencia'};
function ReportView({report,title}:{report:Report;title:string}) {
 const names:Record<string,string>={orders:'Pedidos',units:'Unidades solicitadas',gross_order_value_minor:'Valor bruto (centavos)',verified_paid_amount_minor:'Pago verificado (centavos; incluye revisión)',committed_paid_amount_minor:'Pago comprometido (centavos)',completed:'Completados',operational_cancelled:'Cancelados operativos',commercial_cancelled:'Cancelados comerciales',review_required:'Revisión requerida',paid_without_fulfillment:'Pagados sin ficha',operational_unresolved:'Operativos no terminales',pickup:'Pickup',delivery:'Delivery',completed_late:'Completados después del horario',timing_sample_count:'Pedidos con tiempos',avg_prep_seconds:'Preparación promedio (s)',avg_packing_to_ready_seconds:'Packing a listo promedio (s)',avg_ready_to_completion_seconds:'Listo a completado promedio (s)',open:'Abiertas',resolved:'Resueltas',pickup_no_show:'Pickup no-show',delivery_failure:'Entrega fallida',produced:'Producidas',waste:'Desperdicio',damaged:'Dañadas',replacement:'Reposiciones'};
 return <section><h2>{title}</h2><p>DROP {report.drop.number} · {report.drop.name} · {report.drop.currency}</p><p>Snapshot: {report.as_of} · Vendidas: {report.sold_units} · {report.sold_out_percent}% del cupo.</p>
 {[['Totales',report.totals],['Incidencias',report.issues],['Producción',report.production]].map(([title,values])=><section key={String(title)}><h3>{String(title)}</h3><dl className="admin-inventory">{Object.entries(values).map(([key,value])=><div key={key}><dt>{names[key]??key}</dt><dd>{value===null?'Sin datos':String(value)}</dd></div>)}</dl></section>)}
 <Breakdown title="Métodos de pago" rows={report.payment_methods}/><Breakdown title="Canales de venta" rows={report.sales_channels}/><Breakdown title="Horarios" rows={report.slots}/>
 <p>Tiempos registrados, sin SLA inventado. El ensayo sintético no valida puntualidad real.</p></section>;
}
export default async function Release({searchParams}:{searchParams:Promise<{drop?:string}>}) {
 const {client,role}=await requireAdmin();if(role!=='founder')notFound();
 const requested=(await searchParams).drop;
 const config=await client.from('storefront_config').select('current_drop_id').single();
 const drop=requested??config.data?.current_drop_id;
 if(!drop)return <main className="admin-workspace"><h1>Release readiness</h1><p>NO-GO: falta CURRENT. Selecciona el drop en Administración.</p></main>;
 const [r,s]=await Promise.all([client.rpc('ops_release_readiness',{p_drop:drop}),client.rpc('ops_drop_report',{p_drop:drop})]);
 if(r.error||s.error)throw Error('No se pudo cargar el reporte.');
 const ready=r.data as unknown as Readiness, report=s.data as unknown as Report;
 const checks={...ready.checks,...runtimeReadiness(),bank_grace:process.env.NEXT_PUBLIC_PAYMENT_METHODS!=='CARD_AND_BANK_TRANSFER'||ready.bank_grace_seconds!==null};
 return <main className="admin-workspace release-report"><h1>Release readiness</h1><p>{Object.values(checks).every(Boolean)?'CONFIGURACIÓN COMPLETA · falta aceptación final del founder':'NO-GO · configuración pendiente'}</p>
 <p>Este reporte no habilita pedidos ni pagos LIVE. Confirma datos reales, horarios 18–19 / 19–20 / 20–21, zonas 10/14/15, emails, iPhone y prueba física antes de lanzar. Los fixtures no acreditan un lanzamiento.</p>
 <ul>{Object.entries(checks).map(([key,pass])=><li key={key}>{pass?'LISTO':'PENDIENTE'} · {labels[key]??key}</li>)}</ul>
 <ReleaseControls dropId={drop} days={ready.retention_days} closed={Boolean(ready.closed_report)}/>
 {ready.closed_report&&<ReportView title="Cierre guardado" report={ready.closed_report.report}/>}
 <ReportView title="Reporte actual" report={report}/></main>;
}
