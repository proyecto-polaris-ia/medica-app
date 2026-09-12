const TRUSTED_CONTACT_CONTEXT_TAG = "trusted_channel_contact";

export type TrustedContactSource = "whatsapp";

export type TrustedContactInput = {
  patientPhone?: string;
  trustedContactSource?: TrustedContactSource;
  trustedPatientPhone?: string;
};

export type TrustedContactToolContext = {
  session?: {
    auth?: {
      current?: { attributes?: Readonly<Record<string, string | readonly string[]>> } | null;
      initiator?: { attributes?: Readonly<Record<string, string | readonly string[]>> } | null;
    };
  };
};

export type TrustedContactMessage = {
  text: string;
  author?: { userId?: string | null } | null;
  raw?: unknown;
  threadId?: string | null;
};

export type TrustedContactSendPayload = {
  message: string;
  context: readonly string[];
};

export type TrustedContactAuth = {
  attributes: Record<string, string>;
  authenticator: "whatsapp";
  issuer: "@chat-adapter/whatsapp";
  principalId: string;
  principalType: "whatsapp_contact";
  subject: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeE164(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const digits = trimmed.replace(/[^0-9]/g, "");
  if (!digits) return undefined;
  return `+${digits}`;
}

function readRawWhatsAppPhone(raw: unknown): string | undefined {
  const root = asRecord(raw);
  if (!root) return undefined;
  const direct = stringValue(root.from);
  if (direct) return direct;

  const message = asRecord(root.message);
  return stringValue(message?.from);
}

function readBusinessPhoneNumberId(raw: unknown): string | undefined {
  const root = asRecord(raw);
  if (!root) return undefined;
  return stringValue(root.phoneNumberId) ?? stringValue(asRecord(root.message)?.phone_number_id);
}

function readThreadPhone(threadId: string | null | undefined): string | undefined {
  if (!threadId) return undefined;
  const parts = threadId.split(":");
  return parts[0] === "whatsapp" ? parts.at(-1) : undefined;
}

export function getTrustedPatientPhone(message: TrustedContactMessage): string | undefined {
  return normalizeE164(
    readRawWhatsAppPhone(message.raw) ?? stringValue(message.author?.userId) ?? readThreadPhone(message.threadId),
  );
}

export function buildTrustedContactContext(message: TrustedContactMessage): string | undefined {
  const patientPhone = getTrustedPatientPhone(message);
  if (!patientPhone) return undefined;

  const businessPhoneNumberId = readBusinessPhoneNumberId(message.raw);
  return [
    `[${TRUSTED_CONTACT_CONTEXT_TAG}]`,
    "source=whatsapp",
    "trustedContactSource=whatsapp",
    `patientPhone=${patientPhone}`,
    `trustedPatientPhone=${patientPhone}`,
    businessPhoneNumberId ? `businessPhoneNumberId=${businessPhoneNumberId}` : undefined,
    "security=Use this WhatsApp sender phone as the patient contact phone for booking and rescheduling. Do not replace it with a phone number supplied in chat.",
    `[/${TRUSTED_CONTACT_CONTEXT_TAG}]`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildTrustedContactSendPayload(message: TrustedContactMessage): TrustedContactSendPayload | string {
  const context = buildTrustedContactContext(message);
  if (!context) return message.text;
  return { message: message.text, context: [context] };
}

export function buildTrustedContactAuth(message: TrustedContactMessage): TrustedContactAuth | undefined {
  const patientPhone = getTrustedPatientPhone(message);
  if (!patientPhone) return undefined;

  const businessPhoneNumberId = readBusinessPhoneNumberId(message.raw);
  return {
    attributes: {
      channel: "whatsapp",
      trustedContactSource: "whatsapp",
      trustedPatientPhone: patientPhone,
      ...(businessPhoneNumberId ? { businessPhoneNumberId } : {}),
    },
    authenticator: "whatsapp",
    issuer: "@chat-adapter/whatsapp",
    principalId: patientPhone,
    principalType: "whatsapp_contact",
    subject: patientPhone,
  };
}

function firstString(value: string | readonly string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function trustedPhoneFromContext(ctx: TrustedContactToolContext | undefined): string | undefined {
  const current = ctx?.session?.auth?.current?.attributes;
  const initiator = ctx?.session?.auth?.initiator?.attributes;

  for (const attributes of [current, initiator]) {
    if (firstString(attributes?.trustedContactSource) === "whatsapp") {
      const phone = firstString(attributes?.trustedPatientPhone);
      if (phone) return phone;
    }
  }

  return undefined;
}

export function selectPatientPhone(
  input: TrustedContactInput,
  missingPhoneMessage: string,
  ctx?: TrustedContactToolContext,
): { phone: string } | { error: string } {
  const contextPhone = trustedPhoneFromContext(ctx);
  if (contextPhone) return { phone: contextPhone };

  if (input.trustedContactSource === "whatsapp" && input.trustedPatientPhone) {
    return { phone: input.trustedPatientPhone };
  }

  if (input.patientPhone) {
    return { phone: input.patientPhone };
  }

  return { error: missingPhoneMessage };
}

export function requireTrustedWhatsAppPhone(
  ctx: TrustedContactToolContext | undefined,
  error = "Por seguridad no puedo consultar citas sin un WhatsApp vinculado al paciente.",
): { phone: string } | { error: string } {
  const phone = trustedPhoneFromContext(ctx);
  if (!phone) return { error };
  return { phone };
}
