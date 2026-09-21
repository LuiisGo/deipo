import 'server-only';
import { requireWriter } from '@/lib/supabase/auth';
import { textField as text, integerField as integer, toMinorUnits, guatemalaToUTC } from '../validation';
export async function mutateDrop(id: string, operation: string, form: FormData) {
  const { client } = await requireWriter();
  const rowId = text(form,'id');
  const common = { sort_order: Number(text(form,'sort_order') || 0), is_enabled: form.get('is_enabled') === 'on' };
  let result: { error: unknown };
  switch (operation) {
    case 'general': result = await client.from('drops').update({ name:text(form,'name'), slug:text(form,'slug'), tagline:text(form,'tagline'), description:text(form,'description'), price_minor:toMinorUnits(text(form,'price')), capacity:integer(form,'capacity',1), low_stock_threshold:integer(form,'low_stock_threshold') }).eq('id',id).select('id').single(); break;
    case 'schedule': result = await client.from('drops').update({ orders_open_at:guatemalaToUTC(text(form,'orders_open_at')), orders_close_at:guatemalaToUTC(text(form,'orders_close_at')), fulfillment_date:text(form,'fulfillment_date') || null, fulfillment_day_label:text(form,'fulfillment_day_label') || null }).eq('id',id).select('id').single(); break;
    case 'fulfillment': result = await client.from('drops').update({ delivery_enabled:form.get('delivery_enabled') === 'on', pickup_enabled:form.get('pickup_enabled') === 'on', pickup_label:text(form,'pickup_label') }).eq('id',id).select('id').single(); break;
    case 'sale': result = await client.rpc('record_prelaunch_sale', { p_drop_id:id, p_quantity:integer(form,'quantity',1), p_source:text(form,'source'), p_note:text(form,'note'), ...(text(form,'confirmed_at') ? { p_confirmed_at:guatemalaToUTC(text(form,'confirmed_at'))! } : {}) }); break;
    case 'void': result = await client.rpc('void_prelaunch_sale', { p_sale_id:rowId, p_reason:text(form,'reason') }); break;
    case 'publish': result = await client.rpc('publish_drop', { p_drop_id:id }); break;
    case 'current': case 'next': result = await client.rpc('set_storefront_drop', { p_slot:operation, p_drop_id:id }); break;
    case 'clear-current': case 'clear-next': {
      // RPC accepts SQL NULL although the generator emits a required string for this argument.
      const { error } = await client.rpc('set_storefront_drop', { p_slot:operation.slice(6), p_drop_id:null as unknown as string }); result = {error}; break;
    }
    case 'scheduled': case 'archived': case 'cancelled': result = await client.from('drops').update({ lifecycle_status:operation }).eq('id',id).select('id').single(); break;
    case 'slot': {
      const data = { starts_at:text(form,'starts_at'), ends_at:text(form,'ends_at'), capacity:text(form,'capacity') ? integer(form,'capacity',1) : null, ...common };
      result = rowId ? await client.from('drop_slots').update(data).eq('id',rowId).eq('drop_id',id).select('id').single() : await client.from('drop_slots').insert({drop_id:id,...data}); break;
    }
    case 'zone': {
      const data = { code:text(form,'code'), label:text(form,'label'), fee_minor:text(form,'fee') ? toMinorUnits(text(form,'fee')) : null, ...common };
      result = rowId ? await client.from('drop_delivery_zones').update(data).eq('id',rowId).eq('drop_id',id).select('id').single() : await client.from('drop_delivery_zones').insert({drop_id:id,...data}); break;
    }
    case 'item': {
      const data = { name:text(form,'name'), description:text(form,'description'), ...common };
      result = rowId ? await client.from('drop_items').update(data).eq('id',rowId).eq('drop_id',id).eq('item_type','included').select('id').single() : await client.from('drop_items').insert({drop_id:id,item_type:'included',...data}); break;
    }
    case 'media': result = await client.from('drop_media').update({ alt_text:text(form,'alt_text'), label:text(form,'label'), ...common }).eq('id',rowId).eq('drop_id',id).select('id').single(); break;
    default: throw new Error('INVALID_OPERATION');
  }
  if (result.error) throw result.error;
}
