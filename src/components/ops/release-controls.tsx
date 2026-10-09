'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
export function ReleaseControls({dropId,days,closed}:{dropId:string;days:number|null;closed:boolean}) {
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false); const router=useRouter();
 async function send(form:FormData) {
  setBusy(true);setMessage('');form.set('drop_id',dropId);
  try {const response=await fetch('/api/ops/release',{method:'POST',body:form});const data=await response.json();
   if(!response.ok)throw Error(data.error);
   setMessage(form.get('action')==='redact'?`Borradores redactados: ${data.result.drafts}. Sobres retirados: ${data.result.envelopes}.`:'Guardado.');router.refresh();
  } catch(e){setMessage(e instanceof Error?e.message:'No se pudo completar.');}finally{setBusy(false);}
 }
 return <section className="release-controls"><h2>Retención y cierre</h2>
  <form action={send}><input type="hidden" name="action" value="retention"/><label>Días después de expirar un borrador no reclamado<input name="days" type="number" min="0" max="3650" defaultValue={days??''}/></label><button disabled={busy}>GUARDAR POLÍTICA</button></form>
  <p>Sin duración configurada no se redactan borradores. La limpieza elimina contacto y logística de borradores elegibles; conserva el hecho auditado. No cambia pedidos reales.</p>
  <form action={send}><input type="hidden" name="action" value="redact"/><button disabled={busy||days===null}>REDACTAR EXPIRADOS</button></form>
  <p>Cerrar conserva el primer reporte como snapshot. Las correcciones posteriores siguen visibles en el reporte actual. No bloquea la operación ni modifica pagos, reservas o pedidos.</p>
  <form action={send}><input type="hidden" name="action" value="close"/><button disabled={busy||closed}>{closed?'REPORTE FINALIZADO':'CLOSE OPERATIONS'}</button></form>
  <button type="button" onClick={()=>window.print()}>IMPRIMIR / GUARDAR PDF</button><p role="status">{message}</p>
 </section>;
}
