import { NextRequest, NextResponse } from 'next/server';
import { checkoutClient,loadCheckout } from '@/lib/deipo/repositories/checkout';
import { checkoutCookieName,checkoutCookieOptions,checkoutHash,newCheckoutToken,validCheckoutToken } from '@/lib/deipo/checkout-session';
import { checkoutDetails,checkoutError,mapCheckout } from '@/lib/deipo/checkout';
import { getSiteMode } from '@/lib/site-mode';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','Vary':'Cookie','Netlify-CDN-Cache-Control':'no-store'};
export async function GET(){try{return NextResponse.json({state:await loadCheckout()},{headers});}catch{return NextResponse.json({error:'No pudimos actualizar tu reserva.'},{status:503,headers});}}
export async function POST(request:NextRequest){
 // SameSite is defense in depth; mutation requests must originate at this host.
 const origin=request.headers.get('origin');const host=request.headers.get('host');
 let originHost:string|null=null;try{originHost=origin?new URL(origin).host:null;}catch{}
 if(!originHost||originHost!==host||request.headers.get('sec-fetch-site')==='cross-site')return NextResponse.json({error:'Solicitud no autorizada.'},{status:403,headers});
 let token=request.cookies.get(checkoutCookieName)?.value;
 try{
  if(getSiteMode({})!=='production')throw Error('ONLINE_ORDERING_DISABLED');
  const form=await request.formData();const operation=String(form.get('operation')??'');
  if(!validCheckoutToken(token)){if(operation!=='hold')throw Error('HOLD_NOT_FOUND');token=newCheckoutToken();}
  const p_checkout_session_hash=checkoutHash(token);const client=checkoutClient();
  let result;
  if(operation==='hold'){
   const raw=String(form.get('quantity')??'');const quantity=Number(raw);if(!/^\d+$/.test(raw)||!Number.isSafeInteger(quantity)||quantity<1||quantity>2147483647)throw Error('INVALID_QUANTITY');
   const id=String(form.get('drop_id')??'');if(!/^[0-9a-f-]{36}$/.test(id))throw Error('DROP_NOT_CURRENT');
   result=await client.rpc('create_inventory_hold',{p_drop_id:id,p_quantity:quantity,p_checkout_session_hash});
  }else if(operation==='order')result=await client.rpc('create_pending_order_from_hold',{p_checkout_session_hash,p_details:checkoutDetails(form)});
  else if(operation==='cancel')result=await client.rpc('cancel_pending_order',{p_checkout_session_hash});
  else if(operation==='release')result=await client.rpc('release_inventory_hold',{p_checkout_session_hash});
  else throw Error('INVALID_INPUT');
  if(result.error)throw result.error;
  const response=NextResponse.json({state:mapCheckout(result.data)},{headers});
  response.cookies.set(checkoutCookieName,token,checkoutCookieOptions(host));return response;
 }catch(error){const response=NextResponse.json({error:checkoutError(error)},{status:400,headers});
  // Persist newly minted identity on an uncertain mutation result so retry can reuse it.
  if(validCheckoutToken(token))response.cookies.set(checkoutCookieName,token,checkoutCookieOptions(host));return response;}
}
