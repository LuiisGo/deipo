import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { CustomerTracker } from "./operations";

export const validTrackerToken = (token: string) =>
  /^[A-Za-z0-9_-]{43}$/.test(token);
export function trackerHash(token: string) {
  if (!validTrackerToken(token)) throw new Error("Acceso no válido.");
  return createHash("sha256").update(token).digest("hex");
}
export function createTrackerToken() {
  return randomBytes(32).toString("base64url");
}
export async function issueCustomerAccess(
  fulfillmentId: string,
  expiresAt: string,
) {
  const { mutateOperation } = await import("./repositories/operations");
  const token = createTrackerToken();
  await mutateOperation("ops_rotate_access", {
    p_id: fulfillmentId,
    p_hash: trackerHash(token),
    p_expires_at: expiresAt,
  });
  // Deliver once via a future authorized flow. Never persist or log this plaintext.
  return token;
}
export async function readCustomerTracker(
  token: string,
): Promise<CustomerTracker | null> {
  if (!validTrackerToken(token)) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Seguimiento no disponible.");
  const client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          cache: "no-store",
          signal: AbortSignal.timeout(10000),
        }),
    },
  });
  const { data, error } = await client.rpc("ops_customer_tracker", {
    p_hash: trackerHash(token),
  });
  if (error) throw new Error("Seguimiento no disponible.");
  return data as unknown as CustomerTracker | null;
}
