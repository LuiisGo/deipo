import { createHash, randomBytes } from 'node:crypto';
export const checkoutCookieName='deipo_checkout_session';
export function newCheckoutToken(){return randomBytes(32).toString('hex');}
export function validCheckoutToken(token:string|undefined):token is string{return !!token&&/^[a-f0-9]{64}$/.test(token);}
export function checkoutHash(token:string){if(!validCheckoutToken(token))throw Error('INVALID_SESSION');return createHash('sha256').update(token).digest('hex');}
export function checkoutCookieOptions(host:string|null){const local=!!host&&/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host);return {httpOnly:true,secure:!local,sameSite:'lax' as const,path:'/'};}
