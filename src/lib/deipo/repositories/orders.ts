import 'server-only';
import {notFound} from 'next/navigation';
import {requireAdmin} from '@/lib/supabase/auth';
export const orderStatuses=['all','pending_payment','paid','expired','cancelled','refunded'] as const;
export async function ordersList(status:string,page=0){const {client}=await requireAdmin();let query=client.from('admin_order_state').select('*',{count:'exact'}).order('created_at',{ascending:false}).range(page*50,page*50+49);if(status!=='all')query=query.eq('effective_status',status);const r=await query;if(r.error)throw r.error;return {rows:r.data??[],count:r.count??0};}
export async function orderDetail(id:string){if(!/^[0-9a-f-]{36}$/i.test(id))notFound();const {client,role}=await requireAdmin();const [order,items,events]=await Promise.all([client.from('admin_order_state').select('*').eq('id',id).maybeSingle(),client.from('order_items').select('*').eq('order_id',id),client.from('order_events').select('*').eq('order_id',id).order('created_at').order('id')]);for(const r of [order,items,events])if(r.error)throw r.error;if(!order.data)notFound();return {order:order.data,items:items.data??[],events:events.data??[],role};}
