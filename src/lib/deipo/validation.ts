import type { Tables } from '@/types/database.types';
export function toMinorUnits(value: string): number {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) throw new Error('INVALID_PRICE');
  const [whole, decimals = ''] = value.split('.');
  const minor = Number(whole) * 100 + Number(decimals.padEnd(2, '0'));
  if (!Number.isSafeInteger(minor)) throw new Error('INVALID_PRICE');
  return minor;
}
export function fromMinorUnits(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('INVALID_PRICE');
  return `${Math.floor(value / 100)}.${String(value % 100).padStart(2, '0')}`;
}
export function guatemalaToUTC(value: string): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('INVALID_SCHEDULE');
  const date = new Date(`${value}:00-06:00`);
  if (!Number.isFinite(date.getTime()) || utcToGuatemala(date.toISOString()) !== value) throw new Error('INVALID_SCHEDULE');
  return date.toISOString();
}
export function utcToGuatemala(value: string | null) {
  return value ? new Date(new Date(value).getTime() - 6 * 3600000).toISOString().slice(0,16) : '';
}
export function textField(form: FormData, key: string) { return String(form.get(key) ?? '').trim(); }
export function integerField(form: FormData, key: string, min = 0) {
  const raw = textField(form,key);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) < min) throw new Error('INVALID_INPUT');
  return Number(raw);
}
export function readiness(d: Tables<'drops'>) {
  return [
    ['Nombre', !!d.name.trim()], ['Slug', /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(d.slug)],
    ['Precio confirmado mayor a cero', Number.isSafeInteger(d.price_minor) && d.price_minor > 0],
    ['Capacidad', d.capacity > 0 && d.low_stock_threshold <= d.capacity],
    ['Apertura y cierre', !!d.orders_open_at && !!d.orders_close_at && d.orders_close_at > d.orders_open_at],
    ['Fecha de entrega', !!d.fulfillment_date], ['Entrega o pickup', d.delivery_enabled || d.pickup_enabled],
    ['Hero en Storage', !!d.hero_image_path],
  ] as const;
}
export function friendlyError(error: unknown): string {
  const e = error as { code?: string; message?: string }; const message = e?.message ?? '';
  if (e?.code === '23505') return /number/.test(message) ? 'Ese número de drop ya existe.' : /slug/.test(message) ? 'Ese slug ya existe.' : 'Ya existe un registro con ese código, horario u orden.';
  if (/capacity|exceed|sold units/i.test(message)) return 'La operación excede el inventario disponible o reduce capacidad bajo las ventas confirmadas.';
  if (/authorized|permission|row-level/i.test(message)) return 'No tenés autorización para esta operación.';
  if (/schedule|opening|closing|timestamp/i.test(message)) return 'Revisá apertura y cierre. El cierre debe ser posterior a la apertura.';
  if (/PRICE|price/i.test(message)) return 'Ingresá un precio válido con hasta dos decimales.';
  if (/FILE_TOO_LARGE/.test(message)) return 'El archivo supera 15 MB.';
  if (/INVALID_FILE_TYPE/.test(message)) return 'Usá JPEG, PNG, WebP o AVIF.';
  if (/UPLOAD_ORPHAN/.test(message)) return 'No pudimos confirmar la referencia o limpiar el archivo. Revisá el drop y esta ruta en Storage antes de reintentar.';
  if (/hero|fulfillment|publish|scheduled/i.test(message)) return 'Completá los requisitos de publicación: precio, fechas, entrega y hero.';
  if (e?.code === '23514' || /INVALID_|required/i.test(message)) return 'Revisá los campos obligatorios y sus límites.';
  return 'No pudimos confirmar la operación. Actualizá los datos antes de reintentar.';
}
