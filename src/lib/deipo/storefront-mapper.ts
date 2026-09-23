import type { Json } from '@/types/database.types';
import type { Drop, DropStatus } from '@/types/drop';
import { timestamp } from '@/lib/time';
import { getInventory } from '@/lib/inventory';
// Explicit customer DTO whitelist. No raw admin row crosses a public boundary.
function object(value: Json | undefined): Record<string, Json | undefined> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_PAYLOAD');
  return value;
}
function string(value: Json | undefined): string { if (typeof value !== 'string') throw new Error('INVALID_PAYLOAD'); return value; }
function number(value: Json | undefined): number { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('INVALID_PAYLOAD'); return value; }
function optional(value: Json | undefined) { return value == null ? null : string(value); }
function array(value: Json | undefined) { if (!Array.isArray(value)) throw new Error('INVALID_PAYLOAD'); return value.map(object); }
function boolean(value: Json | undefined) { if (typeof value !== 'boolean') throw new Error('INVALID_PAYLOAD'); return value; }
export function assetUrl(path: string | null, url: string) {
  if (!path) return '';
  if (!/^drop-\d+\/(hero|packaging|gallery)\/[a-zA-Z0-9._/-]+$/.test(path) || path.includes('..')) throw new Error('INVALID_ASSET_PATH');
  return `${url}/storage/v1/object/public/drop-assets/${path.split('/').map(encodeURIComponent).join('/')}`;
}
export function mapStorefrontDrop(value: Json, url: string, preview = false): Drop {
  const d = object(value);
  const status = string(d.availability);
  if (!['upcoming','active','low_stock','sales_closed','sold_out','temporarily_unavailable'].includes(status) || d.currency !== 'GTQ') throw new Error('INVALID_PAYLOAD');
  const closes = optional(d.orders_close_at);
  const opens = optional(d.orders_open_at);
  if (closes) timestamp(closes);
  if (opens) timestamp(opens);
  if (closes && opens && timestamp(closes) <= timestamp(opens)) throw new Error('INVALID_SCHEDULE');
  if (number(d.low_stock_threshold) > number(d.capacity)) throw new Error('INVALID_INVENTORY');
  const closingLocal = closes ? new Date(new Date(closes).getTime() - 21600000) : null;
  const drop: Drop = {
    id:string(d.id),number:String(number(d.number)).padStart(3,'0'),slug:string(d.slug),name:string(d.name),tagline:optional(d.tagline) ?? '',description:optional(d.description) ?? '',
    status:status as DropStatus,price:number(d.price_minor)/100,currency:'GTQ',capacity:number(d.capacity),prelaunchSoldUnits:number(d.prelaunch_sold_units),sold:number(d.total_sold),heldUnits:number(d.held_units),lowStockThreshold:number(d.low_stock_threshold),
    salesCloseAt:closes,ordersOpenAt:optional(d.orders_open_at),openingReference:null,closingReference:{weekday:closingLocal?.getUTCDay() ?? 0,time:closingLocal?.toISOString().slice(11,16) ?? '00:00'},nextDropOpening:null,
    fulfillmentDate:optional(d.fulfillment_date),fulfillmentDay:optional(d.fulfillment_day_label) ?? '',maxQuantityPerOrder:d.max_quantity_per_order==null?null:number(d.max_quantity_per_order),onlineOrderingEnabled:d.online_ordering_enabled===true,heroImage:assetUrl(optional(d.hero_image_path),url),heroAlt:optional(d.hero_alt) ?? string(d.name),source:preview?'admin-preview':'production',
    includes:array(d.items).filter(i=>i.type==='included').map(i=>({name:string(i.name),description:optional(i.description) ?? ''})),extras:[],
    packagingFrames:array(d.packaging_frames).map(f=>({src:assetUrl(string(f.src),url),alt:optional(f.alt) ?? 'Empaque deipo.',label:optional(f.label) ?? ''})),
    fulfillment:{deliveryEnabled:boolean(d.delivery_enabled),pickupEnabled:boolean(d.pickup_enabled),pickupLabel:optional(d.pickup_label) ?? '',zones:array(d.delivery_zones).map(z=>({id:string(z.id),label:string(z.label),fee:z.fee_minor==null?null:number(z.fee_minor)/100})),slots:array(d.slots).map(s=>({id:string(s.id),startsAt:string(s.starts_at).slice(0,5),endsAt:string(s.ends_at).slice(0,5),available:true}))},
  };
  const inventory=getInventory(drop);
  if (number(d.available)!==inventory.available || number(d.online_sold_units)!==inventory.confirmedOnlineSoldUnits) throw new Error('INVALID_INVENTORY');
  return drop;
}
