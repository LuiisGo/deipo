import { browserClient } from '@/lib/supabase/browser';
export const allowedMedia = ['image/jpeg','image/png','image/webp','image/avif'];
export function validateMedia(file: Pick<File,'size'|'type'>) {
  if (!allowedMedia.includes(file.type)) throw new Error('INVALID_FILE_TYPE');
  if (!file.size || file.size > 15 * 1024 * 1024) throw new Error('FILE_TOO_LARGE');
}
export async function uploadMedia(dropId: string, number: number, file: File, kind: 'hero'|'packaging_frame'|'gallery', alt: string, label: string, order: number) {
  validateMedia(file);
  const client = browserClient();
  const extension = { 'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/avif':'avif' }[file.type];
  const path = `drop-${number}/${kind === 'packaging_frame' ? 'packaging' : kind}/${crypto.randomUUID()}.${extension}`;
  const upload = await client.storage.from('drop-assets').upload(path,file,{contentType:file.type,upsert:false});
  if (upload.error) throw upload.error;
  // Hero has a stable metadata slot. Its trigger updates the canonical path atomically.
  const metadata = {drop_id:dropId,kind,path,alt_text:alt,label,sort_order:kind === 'hero' ? 0 : order,is_enabled:true};
  const result = kind === 'hero' ? await client.from('drop_media').upsert(metadata,{onConflict:'drop_id,kind,sort_order'}) : await client.from('drop_media').insert(metadata);
  if (result.error) {
    const persisted = await client.from('drop_media').select('id').eq('drop_id',dropId).eq('path',path);
    if (persisted.error) throw new Error(`UPLOAD_ORPHAN:${path}`);
    if (persisted.data.length) return;
    const cleanup = await client.storage.from('drop-assets').remove([path]);
    if (cleanup.error) throw new Error(`UPLOAD_ORPHAN:${path}`);
    throw result.error;
  }
}
