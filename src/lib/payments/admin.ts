import 'server-only';
import { requireAdmin } from '@/lib/supabase/auth';
export async function paymentsList() {
  const { client } = await requireAdmin();
  const [attempts, inbox, attention] = await Promise.all([
    client
      .from('payment_attempts')
      .select('*, orders(order_code,inventory_committed_at)')
      .order('created_at', { ascending: false })
      .limit(100),
    client
      .from('payment_webhook_events')
      .select(
        'id,event_id,event_type,provider_checkout_id,processing_status,processing_error,received_at',
      )
      .in('processing_status', [
        'received',
        'unmatched',
        'review_required',
        'environment_mismatch',
      ])
      .order('received_at', { ascending: false })
      .limit(100),
    client
      .from('payment_attempts')
      .select('*, orders(order_code,inventory_committed_at)', {
        count: 'exact',
      })
      .or(
        `review_reason.not.is.null,resolution_status.eq.review_required,internal_status.eq.creation_unknown,and(internal_status.eq.creating,created_at.lt.${new Date(Date.now() - 45000).toISOString()})`,
      )
      .order('created_at')
      .limit(100),
  ]);
  if (attempts.error || inbox.error || attention.error)
    throw Error('No pudimos consultar los pagos.');
  return {
    attempts: attempts.data ?? [],
    inbox: inbox.data ?? [],
    attention: attention.data ?? [],
    attentionCount: attention.count ?? 0,
  };
}
