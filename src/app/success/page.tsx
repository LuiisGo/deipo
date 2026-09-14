import type { Metadata } from 'next';
import { ReceiptPrinter } from '@/components/receipt/receipt-printer';
export const metadata: Metadata = { title: 'Tu recibo', robots: { index: false, follow: false }, alternates: { canonical: null } };
export default function SuccessPage() { return <ReceiptPrinter />; }
