'use client';
import { useRef, useState } from 'react';
import { allowedMedia, uploadMedia } from '@/lib/deipo/media';
import { friendlyError } from '@/lib/deipo/validation';
import { refreshMedia } from '@/app/admin/actions';
export function MediaUpload({id,number,disabled}: {id:string;number:number;disabled:boolean}) {
  const [pending,setPending]=useState(false); const busy=useRef(false); const [message,setMessage]=useState(''); const [failed,setFailed]=useState(false);
  return <form className="admin-form" onSubmit={async e=>{
    e.preventDefault(); if(busy.current)return; busy.current=true; const form=e.currentTarget; const data=new FormData(form);setPending(true);setMessage('');setFailed(false);
    try { await uploadMedia(id,number,data.get('file') as File,data.get('kind') as 'hero'|'packaging_frame'|'gallery',String(data.get('alt')),String(data.get('label')),Number(data.get('sort_order'))); await refreshMedia(id); setMessage('Asset guardado.');form.reset(); }
    catch(error){setFailed(true);setMessage(friendlyError(error)+(error instanceof Error && error.message.startsWith('UPLOAD_ORPHAN:') ? ` Ruta: ${error.message.slice(14)}` : ''));}
    finally{setPending(false);busy.current=false;}
  }}><fieldset disabled={disabled || pending}><div className="admin-fields"><label className="admin-field">Tipo<select name="kind"><option value="hero">Hero (reemplazar activo)</option><option value="packaging_frame">Packaging frame</option><option value="gallery">Galería</option></select></label><label className="admin-field">Archivo · máximo 15 MB<input name="file" type="file" accept={allowedMedia.join(',')} required /></label><label className="admin-field">Texto alternativo<input name="alt" required /></label><label className="admin-field">Label<input name="label" /></label><label className="admin-field">Orden (hero siempre 0)<input name="sort_order" type="number" min="0" defaultValue="0" required /></label></div><button className="admin-button">{pending?'Subiendo…':'Subir asset'}</button></fieldset>{message && <p role={failed?'alert':'status'}>{message}</p>}</form>;
}
