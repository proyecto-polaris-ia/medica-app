import { createHmac, timingSafeEqual } from "node:crypto";

export type WhatsAppSignatureVerificationResult =
  | { ok: true }
  | { ok: false; reason: "missing_secret" | "missing_signature" | "malformed_signature" | "invalid_signature" };

export type VerifyWhatsAppWebhookSignatureInput = {
  rawBody: string;
  signatureHeader: string | null;
  appSecret?: string;
};

const META_SIGNATURE_PREFIX = "sha256=";
const SHA256_HEX_DIGEST_PATTERN = /^[a-f0-9]{64}$/i;

function computeSignature(rawBody: string, appSecret: string) {
  return createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
}

export function verifyWhatsAppWebhookSignature({
  rawBody,
  signatureHeader,
  appSecret = process.env.WHATSAPP_APP_SECRET,
}: VerifyWhatsAppWebhookSignatureInput): WhatsAppSignatureVerificationResult {
  if (!appSecret?.trim()) return { ok: false, reason: "missing_secret" };
  if (!signatureHeader) return { ok: false, reason: "missing_signature" };
  if (!signatureHeader.startsWith(META_SIGNATURE_PREFIX)) return { ok: false, reason: "malformed_signature" };

  const receivedDigest = signatureHeader.slice(META_SIGNATURE_PREFIX.length);
  if (!SHA256_HEX_DIGEST_PATTERN.test(receivedDigest)) return { ok: false, reason: "malformed_signature" };

  const expected = Buffer.from(computeSignature(rawBody, appSecret), "hex");
  const received = Buffer.from(receivedDigest, "hex");
  if (received.length !== expected.length) return { ok: false, reason: "malformed_signature" };

  return timingSafeEqual(received, expected) ? { ok: true } : { ok: false, reason: "invalid_signature" };
}
