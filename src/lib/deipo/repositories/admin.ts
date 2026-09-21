import 'server-only';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/supabase/auth';
export async function overview() {
  const { client, role } = await requireAdmin();
  const [drops, inventory, config, audit] = await Promise.all([
    client.from('drops').select('*').order('number', { ascending: false }),
    client.from('drop_inventory').select('*'),
    client.from('storefront_config').select('*').single(),
    client.from('audit_log').select('*').order('created_at', { ascending: false }).limit(10),
  ]);
  for (const r of [drops, inventory, config, audit]) if (r.error) throw r.error;
  return { drops: drops.data!, inventory: inventory.data!, config: config.data!, audit: audit.data!, role };
}
export async function dropDetail(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { client, role } = await requireAdmin();
  const [drop, inventory, sales, slots, zones, items, media, config, audit] = await Promise.all([
    client.from('drops').select('*').eq('id', id).maybeSingle(),
    client.from('drop_inventory').select('*').eq('drop_id', id).single(),
    client.from('prelaunch_sales').select('*').eq('drop_id', id).order('confirmed_at', { ascending: false }),
    client.from('drop_slots').select('*').eq('drop_id', id).order('sort_order'),
    client.from('drop_delivery_zones').select('*').eq('drop_id', id).order('sort_order'),
    client.from('drop_items').select('*').eq('drop_id', id).eq('item_type','included').order('sort_order'),
    client.from('drop_media').select('*').eq('drop_id', id).order('sort_order'),
    client.from('storefront_config').select('*').single(),
    client.from('audit_log').select('*').or(`entity_id.eq.${id},metadata->>drop_id.eq.${id}`).order('created_at', { ascending: false }).limit(20),
  ]);
  if (drop.error) throw drop.error;
  if (!drop.data) notFound();
  for (const r of [inventory,sales,slots,zones,items,media,config,audit]) if(r.error) throw r.error;
  return { drop: drop.data, inventory: inventory.data!, sales: sales.data!, slots: slots.data!, zones: zones.data!, items: items.data!, media: media.data!, config: config.data!, audit: audit.data!, role };
}
export type DropDetail = Awaited<ReturnType<typeof dropDetail>>;
