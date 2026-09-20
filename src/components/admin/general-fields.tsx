import type { Tables } from '@/types/database.types';
import { Field, Area } from './fields';
import { fromMinorUnits } from '@/lib/deipo/validation';
export function GeneralFields({drop}: {drop?:Tables<'drops'>}) {
 return <div className="admin-fields">{!drop && <Field label="Número de drop" name="number" type="number" min="1" required />}<Field label="Nombre" name="name" required defaultValue={drop?.name} /><Field label="Slug" name="slug" pattern="[a-z0-9]+(-[a-z0-9]+)*" required defaultValue={drop?.slug} /><Field label="Tagline" name="tagline" defaultValue={drop?.tagline ?? ''} /><Area label="Descripción" name="description" value={drop?.description} /><Field label="Precio (GTQ)" name="price" required={!!drop} inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" defaultValue={drop ? fromMinorUnits(drop.price_minor) : ''} /><Field label="Capacidad" name="capacity" type="number" min="1" required defaultValue={drop?.capacity} /><Field label="Umbral de stock bajo" name="low_stock_threshold" type="number" min="0" required defaultValue={drop?.low_stock_threshold ?? 8} /></div>;
}
