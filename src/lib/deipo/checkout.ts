import type { Json } from '@/types/database.types';
export type CheckoutState = {
  state: 'none'|'active'|'released'|'expired'|'converted'; serverTime:string; expiresAt:string|null; quantity:number;
  drop:null|{number:number;name:string;currency:string;unitPriceMinor:number;fulfillmentDate:string;pickupEnabled:boolean;deliveryEnabled:boolean;pickupLabel:string|null;onlineOrderingEnabled:boolean;slots:{id:string;start:string;end:string}[];zones:{id:string;label:string;feeMinor:number|null}[]};
  order:null|{code:string;status:string;subtotalMinor:number;deliveryFeeMinor:number;totalMinor:number;method:string;fulfillmentDate:string;pickupLabel:string|null;zoneLabel:string|null;slotStart:string|null;slotEnd:string|null};
};
export const checkoutErrors:Record<string,string>={
 ONLINE_ORDERING_DISABLED:'Los pedidos online todavía no están habilitados.', DROP_NOT_CURRENT:'Este drop ya no recibe reservas.', DROP_NOT_PUBLISHED:'Este drop no recibe reservas.', SALES_NOT_OPEN:'Los pedidos aún no abren.', SALES_CLOSED:'Los pedidos de este drop cerraron.', INVALID_QUANTITY:'Revisá la cantidad.', MAX_QUANTITY_EXCEEDED:'La cantidad supera el máximo de este drop.', INSUFFICIENT_INVENTORY:'Esa cantidad ya no está disponible. Ajustala para continuar.', HOLD_EXPIRED:'Tu reserva venció. Volvé al drop para reservar de nuevo.', HOLD_NOT_FOUND:'No hay una reserva activa.', ORDER_ALREADY_EXISTS:'Ya hay un pedido para esta reserva. Cancelalo antes de cambiar la cantidad.', ORDER_DETAILS_CONFLICT:'El pedido ya fue creado con otros datos. Revisalo antes de continuar.', INVALID_CONTACT:'Revisá tu nombre, teléfono con código de país y correo.', INVALID_FULFILLMENT_METHOD:'Seleccioná una forma de entrega disponible.', INVALID_SLOT:'Elegí un horario disponible.', INVALID_DELIVERY_ZONE:'Elegí una zona disponible.', DELIVERY_FEE_NOT_CONFIGURED:'Esta zona todavía no tiene una tarifa confirmada.', INVALID_ADDRESS:'Ingresá la dirección de entrega.', ORDER_NOT_CANCELLABLE:'El pedido ya no se puede cancelar porque venció o su inventario fue comprometido.', NOT_AUTHORIZED:'No tenés autorización para esta acción.', CANCEL_REASON_REQUIRED:'Ingresá el motivo de cancelación.', INVALID_INPUT:'Revisá los datos para continuar.'
};
export function checkoutError(error:unknown) { const message=(error as {message?:string})?.message??'';return checkoutErrors[message.split(':')[0]]??'No pudimos confirmar la operación. Actualizá antes de reintentar.'; }
export function normalizePhone(raw:string) {const value=raw.trim().replace(/[\s().-]/g,'');const phone=value.startsWith('00')?`+${value.slice(2)}`:value;if(!/^\+[1-9]\d{7,14}$/.test(phone))throw Error('INVALID_CONTACT');return phone;}
export function checkoutDetails(form:FormData) {
 const text=(key:string)=>String(form.get(key)??'').trim();
 const method=text('method');
 return {name:text('name'),phone:normalizePhone(text('phone')),email:text('email'),method,slot_id:text('slot_id'),zone_id:method==='delivery'?text('zone_id'):'',address:method==='delivery'?text('address'):'',notes:method==='delivery'?text('notes'):''};
}
export function minorMoney(n:number) {if(!Number.isSafeInteger(n)||n<0)throw Error('INVALID_PRICE');return `Q${Math.floor(n/100)}.${String(n%100).padStart(2,'0')}`;}
// Explicit whitelist: database internals and contact data never enter customer DTOs.
export function mapCheckout(value:Json):CheckoutState {
 const obj=(v:Json|undefined):Record<string,Json|undefined>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('INVALID_PAYLOAD');return v;};
 const str=(v:Json|undefined)=>{if(typeof v!=='string')throw Error('INVALID_PAYLOAD');return v;};
 const num=(v:Json|undefined)=>{if(typeof v!=='number'||!Number.isSafeInteger(v)||v<0)throw Error('INVALID_PAYLOAD');return v;};
 const bool=(v:Json|undefined)=>{if(typeof v!=='boolean')throw Error('INVALID_PAYLOAD');return v;};
 const opt=(v:Json|undefined)=>v==null?null:str(v);
 const list=(v:Json|undefined)=>{if(!Array.isArray(v))throw Error('INVALID_PAYLOAD');return v.map(obj);};
 const v=obj(value);const state=str(v.state);if(!['none','active','released','expired','converted'].includes(state))throw Error('INVALID_PAYLOAD');
 const serverTime=str(v.server_time);if(!Number.isFinite(Date.parse(serverTime)))throw Error('INVALID_PAYLOAD');
 const d=v.drop?obj(v.drop):null,o=v.order?obj(v.order):null;
 const expiresAt=opt(v.expires_at);if(expiresAt&&!Number.isFinite(Date.parse(expiresAt)))throw Error('INVALID_PAYLOAD');
 if(state!=='none'&&(!d||!expiresAt))throw Error('INVALID_PAYLOAD');
 if(d&&!Number.isSafeInteger(num(d.unit_price_minor)*num(v.quantity)))throw Error('INVALID_PRICE');
 return {state:state as CheckoutState['state'],serverTime,expiresAt,quantity:v.quantity==null?0:num(v.quantity),
  drop:d?{number:num(d.number),name:str(d.name),currency:str(d.currency),unitPriceMinor:num(d.unit_price_minor),fulfillmentDate:str(d.fulfillment_date),pickupEnabled:bool(d.pickup_enabled),deliveryEnabled:bool(d.delivery_enabled),pickupLabel:opt(d.pickup_label),onlineOrderingEnabled:bool(d.online_ordering_enabled),slots:list(d.slots).map(s=>({id:str(s.id),start:str(s.start),end:str(s.end)})),zones:list(d.zones).map(z=>({id:str(z.id),label:str(z.label),feeMinor:z.fee_minor==null?null:num(z.fee_minor)}))}:null,
  order:o?{code:str(o.code),status:str(o.status),subtotalMinor:num(o.subtotal_minor),deliveryFeeMinor:num(o.delivery_fee_minor),totalMinor:num(o.total_minor),method:str(o.fulfillment_method),fulfillmentDate:str(o.fulfillment_date),pickupLabel:opt(o.pickup_label),zoneLabel:opt(o.zone_label),slotStart:opt(o.slot_start),slotEnd:opt(o.slot_end)}:null};
}
