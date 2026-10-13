export type SalesDeskData = {
  drop: null | {
    id: string;
    number: number;
    name: string;
    price: number;
    pickup: boolean;
    delivery: boolean;
    grace_seconds: number | null;
    tracker_seconds: number | null;
    slots: { id: string; start: string; end: string }[];
    zones: { id: string; label: string; fee: number | null }[];
  };
  drafts: {
    id: string;
    created_at: string;
    expires_at: string;
    sales_channel: string;
    quantity: number;
    customer: string;
    order_id: string | null;
    status: string;
  }[];
  channels: {
    sales_channel: string;
    orders: number;
    units: number;
    gross_order_value_minor: number;
    paid_revenue_minor: number;
    card_paid: number;
    transfer_paid: number;
  }[];
};
export type PrintData = {
  order_code: string;
  first_name: string;
  quantity: number;
  product: string;
  method: string;
  slot_start: string | null;
  slot_end: string | null;
  date: string;
  packing: { label: string; required: number; checked: number }[];
  access: null | { envelope: string; hash: string };
  logistics?: {
    name: string;
    phone: string;
    address: string;
    zone: string;
    notes: string | null;
  };
};
