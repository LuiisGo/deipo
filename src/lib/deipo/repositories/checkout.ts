import 'server-only';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import { supabaseConfig } from '@/lib/supabase/config';
import { checkoutCookieName, checkoutHash, validCheckoutToken } from '../checkout-session';
import { mapCheckout } from '../checkout';
export function checkoutClient(){const {url,key}=supabaseConfig();return createClient<Database>(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,cache:'no-store'})}});}
export async function loadCheckout(){const token=(await cookies()).get(checkoutCookieName)?.value;if(!validCheckoutToken(token))return null;const {data,error}=await checkoutClient().rpc('get_checkout_state',{p_checkout_session_hash:checkoutHash(token)});if(error)throw error;return mapCheckout(data);}
