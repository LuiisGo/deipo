import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/types/database.types';
import { supabaseConfig } from '@/lib/supabase/config';
import { mapStorefrontDrop } from '../storefront-mapper';
import { dropDetail } from './admin';
export async function storefrontState() {
  const {url,key}=supabaseConfig();
  const client=createClient<Database>(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,cache:'no-store'})}});
  const {data,error}=await client.rpc('get_storefront_state');
  if(error)throw error;
  if(!data || typeof data!=='object' || Array.isArray(data) || !('current' in data) || !('next' in data))throw new Error('INVALID_STOREFRONT');
  const current=data.current ? mapStorefrontDrop(data.current,url):null;
  const next=data.next ? mapStorefrontDrop(data.next,url):null;
  if(current && next) { current.nextDropOpening={ordersOpenAt:next.ordersOpenAt,openingReference:null}; current.nextDrop={number:next.number,name:next.name}; }
  return {current,next};
}
export async function previewDrop(id:string) {
  const data=await dropDetail(id); const d=data.drop;
  const payload:Json={...d,...data.inventory,availability:'upcoming',items:data.items.filter(i=>i.is_enabled).map(i=>({...i,type:i.item_type})),slots:data.slots.filter(s=>s.is_enabled),delivery_zones:data.zones.filter(z=>z.is_enabled),packaging_frames:data.media.filter(m=>m.kind==='packaging_frame' && m.is_enabled).map(m=>({src:m.path,alt:m.alt_text,label:m.label})),hero_alt:data.media.find(m=>m.kind==='hero' && m.is_enabled)?.alt_text ?? d.name};
  const drop=mapStorefrontDrop(payload,supabaseConfig().url,true);
  if(drop.sold===drop.capacity)drop.status='sold_out';
  return drop;
}
