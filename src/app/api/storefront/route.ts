import { storefrontState } from '@/lib/deipo/repositories/storefront';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store','Netlify-CDN-Cache-Control':'no-store'};
export async function GET(){try{return Response.json(await storefrontState(),{headers});}catch{return Response.json({error:'No pudimos actualizar el inventario.'},{status:503,headers});}}
