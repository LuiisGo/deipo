import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import {
  createTrackerToken,
  trackerHash,
  validTrackerToken,
} from "@/lib/deipo/customer-access";
export function commerceOrigin(
  env: Record<string, string | undefined> = process.env,
) {
  const value = env.CUSTOMER_COMMERCE_ORIGIN;
  if (!value) throw Error("COMMERCE_NOT_CONFIGURED");
  const url = new URL(value);
  if (
    url.origin !== value ||
    url.protocol !== "https:" ||
    url.username ||
    url.password
  )
    throw Error("COMMERCE_NOT_CONFIGURED");
  return value;
}
function encryptionKey(env: Record<string, string | undefined> = process.env) {
  const value = env.CUSTOMER_ACCESS_ENCRYPTION_KEY;
  if (!value || !/^[a-f0-9]{64}$/.test(value))
    throw Error("TRACKER_NOT_CONFIGURED");
  return Buffer.from(value, "hex");
}
export function sealAccess(
  env: Record<string, string | undefined> = process.env,
) {
  const token = createTrackerToken(),
    iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", encryptionKey(env), iv);
  cipher.setAAD(Buffer.from("deipo.customer-access.v1"));
  const ciphertext = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  return {
    token,
    hash: trackerHash(token),
    envelope: [
      "v1",
      iv.toString("base64url"),
      cipher.getAuthTag().toString("base64url"),
      ciphertext.toString("base64url"),
    ].join("."),
  };
}
export function openAccess(
  envelope: string,
  hash: string,
  env: Record<string, string | undefined> = process.env,
) {
  const [v, iv, tag, body, ...extra] = envelope.split(".");
  if (v !== "v1" || extra.length || !iv || !tag || !body)
    throw Error("TRACKER_ACCESS_UNAVAILABLE");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(env),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAAD(Buffer.from("deipo.customer-access.v1"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  const token = Buffer.concat([
    decipher.update(Buffer.from(body, "base64url")),
    decipher.final(),
  ]).toString("utf8");
  if (!validTrackerToken(token) || trackerHash(token) !== hash)
    throw Error("TRACKER_ACCESS_UNAVAILABLE");
  return token;
}
export function trackerUrl(token: string) {
  if (!validTrackerToken(token)) throw Error("TRACKER_ACCESS_UNAVAILABLE");
  return `${commerceOrigin()}/order/${token}`;
}
