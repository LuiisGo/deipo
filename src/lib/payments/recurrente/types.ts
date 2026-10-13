export type PaymentPreparation = {
  action: 'create' | 'reuse';
  attempt: {
    id: string;
    internal_status: string;
    checkout_url: string | null;
    expires_at: string;
    amount_minor: number;
    currency: string;
    resolution_status: string;
  };
  sales_channel?: string;
  order_code?: string;
  item?: { name: string; quantity: number; unit_price_minor: number };
  delivery_fee_minor?: number;
};
export type CheckoutResult = {
  id: string;
  checkout_url: string;
  provider_status: string;
  created_at: string | null;
  status: 'checkout_ready';
  payment_method_types: string[];
  bank_transfer_memo: string | null;
};
export type PaymentReceipt = {
  code: string;
  drop_number: number;
  drop_name: string;
  quantity: number;
  unit_price_minor: number;
  subtotal_minor: number;
  delivery_fee_minor: number;
  total_minor: number;
  currency: 'GTQ';
  fulfillment_method: string;
  fulfillment_date: string;
  pickup_label: string | null;
  zone_label: string | null;
  slot_start: string | null;
  slot_end: string | null;
  payment_method: string;
  paid_at: string;
  environment: 'sandbox' | 'live';
};
export type PaymentState = {
  status:
    | 'none'
    | 'confirming'
    | 'paid'
    | 'bank_transfer_pending'
    | 'failed'
    | 'canceled'
    | 'expired'
    | 'review_required'
    | 'creation_unknown';
  sales_channel?: string;
  order_code?: string;
  reservation_until?: string | null;
  receipt?: PaymentReceipt;
};
