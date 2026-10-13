import 'server-only';
import { enabledPaymentMethods } from './payment-methods';
export function runtimeReadiness(env: Record<string,string|undefined> = process.env) {
  const origin = (value: string|undefined) => {
    try { const u = new URL(value!); return u.protocol==='https:' && u.origin===value; } catch { return false; }
  };
  const methods = enabledPaymentMethods(env.NEXT_PUBLIC_PAYMENT_METHODS);
  return {
    supabase: Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY && env.SUPABASE_SECRET_KEY),
    staff_invite_origin: origin(env.STAFF_INVITE_ORIGIN),
    customer_commerce_origin: origin(env.CUSTOMER_COMMERCE_ORIGIN),
    encryption_key: /^[a-f0-9]{64}$/.test(env.CUSTOMER_ACCESS_ENCRYPTION_KEY ?? ''),
    whatsapp: /^[1-9][0-9]{7,14}$/.test(env.NEXT_PUBLIC_SALES_WHATSAPP_NUMBER ?? ''),
    payment_methods: methods.length > 0,
    provider_acceptance: env.PAYMENT_ACCEPTANCE_CONFIRMED === env.NEXT_PUBLIC_PAYMENT_METHODS && methods.length > 0,
    sandbox_config: env.RECURRENTE_MODE==='sandbox' && Boolean(env.RECURRENTE_SECRET_KEY?.startsWith('sk_test_') && env.RECURRENTE_SANDBOX_ID && env.RECURRENTE_WEBHOOK_SECRET) && origin(env.PAYMENT_ALLOWED_ORIGIN),
  };
}
