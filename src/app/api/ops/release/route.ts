import { NextRequest, NextResponse } from 'next/server';
import { opsIdentity } from '@/lib/ops/auth';
import { opsHeaders, sameOrigin } from '@/lib/ops/http';
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({error:'Solicitud no autorizada.'},{status:403,headers:opsHeaders});
  try {
    const {client,role} = await opsIdentity();
    if (role!=='founder') throw Error('NOT_AUTHORIZED');
    const form=await request.formData(), p_drop=String(form.get('drop_id')??'');
    const action=form.get('action');
    let result;
    if (action==='retention') {
      const raw=String(form.get('days')??'').trim(), days=raw===''?null:Number(raw);
      if (days!==null && (!Number.isSafeInteger(days)||days<0||days>3650)) throw Error('INVALID_INPUT');
      result=await client.rpc('ops_retention_configure',{p_drop,p_days:days});
    } else if (action==='redact') result=await client.rpc('ops_redact_expired',{p_drop});
    else if (action==='close') result=await client.rpc('ops_close_report',{p_drop});
    else throw Error('INVALID_INPUT');
    if(result.error) throw result.error;
    return NextResponse.json({ok:true,result:result.data},{headers:opsHeaders});
  } catch {
    return NextResponse.json({error:'No se pudo completar. Verifica permisos y la política de retención configurada.'},{status:400,headers:opsHeaders});
  }
}
