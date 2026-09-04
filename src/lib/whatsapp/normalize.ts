type MetaObject = Record<string, unknown>;

export type NormalizedWhatsAppInboundEvent = {
  providerMessageId: string;
  fromPhone: string;
  profileName?: string;
  businessPhoneNumberId?: string;
  messageType: string;
  body?: string;
  occurredAt: string;
  rawMessage: MetaObject;
  rawValue: MetaObject;
};

export type WhatsAppDeliveryStatus = "sent" | "delivered" | "read" | "failed";

export type NormalizedWhatsAppStatusEvent = {
  providerMessageId: string;
  status: WhatsAppDeliveryStatus;
  recipientPhone?: string;
  businessPhoneNumberId?: string;
  occurredAt: string;
  conversationId?: string;
  pricing?: MetaObject;
  errors: MetaObject[];
  rawStatus: MetaObject;
  rawValue: MetaObject;
};

export type NormalizedWhatsAppWebhookPayloadBundle = {
  inboundEvents: NormalizedWhatsAppInboundEvent[];
  statusEvents: NormalizedWhatsAppStatusEvent[];
};

function isObject(value: unknown): value is MetaObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asObjectArray(value: unknown): MetaObject[] {
  return Array.isArray(value) ? value.filter(isObject) : [];
}

function getTextBody(message: MetaObject) {
  if (message.type !== "text" || !isObject(message.text)) return undefined;
  return asString(message.text.body);
}

function getContactProfileName(contacts: MetaObject[], fromPhone: string) {
  const contact = contacts.find((candidate) => candidate.wa_id === fromPhone) ?? contacts[0];
  if (!contact || !isObject(contact.profile)) return undefined;
  return asString(contact.profile.name);
}

function getOccurredAt(timestamp: string | undefined) {
  const seconds = timestamp ? Number(timestamp) : NaN;
  if (Number.isFinite(seconds) && seconds > 0) {
    return new Date(seconds * 1000).toISOString();
  }
  return new Date().toISOString();
}

export function normalizeWhatsAppWebhookPayload(payload: unknown): NormalizedWhatsAppInboundEvent[] {
  if (!isObject(payload)) return [];

  const events: NormalizedWhatsAppInboundEvent[] = [];
  for (const entry of asObjectArray(payload.entry)) {
    for (const change of asObjectArray(entry.changes)) {
      if (!isObject(change.value)) continue;

      const rawValue = change.value;
      const metadata = isObject(rawValue.metadata) ? rawValue.metadata : {};
      const businessPhoneNumberId = asString(metadata.phone_number_id);
      const contacts = asObjectArray(rawValue.contacts);

      for (const message of asObjectArray(rawValue.messages)) {
        const providerMessageId = asString(message.id);
        const fromPhone = asString(message.from);
        const messageType = asString(message.type);
        if (!providerMessageId || !fromPhone || !messageType) continue;

        events.push({
          providerMessageId,
          fromPhone,
          profileName: getContactProfileName(contacts, fromPhone),
          businessPhoneNumberId,
          messageType,
          body: getTextBody(message),
          occurredAt: getOccurredAt(asString(message.timestamp)),
          rawMessage: message,
          rawValue,
        });
      }
    }
  }

  return events;
}


function isDeliveryStatus(status: string | undefined): status is WhatsAppDeliveryStatus {
  return status === "sent" || status === "delivered" || status === "read" || status === "failed";
}

export function normalizeWhatsAppWebhookStatusPayload(payload: unknown): NormalizedWhatsAppStatusEvent[] {
  if (!isObject(payload)) return [];

  const events: NormalizedWhatsAppStatusEvent[] = [];
  for (const entry of asObjectArray(payload.entry)) {
    for (const change of asObjectArray(entry.changes)) {
      if (!isObject(change.value)) continue;

      const rawValue = change.value;
      const metadata = isObject(rawValue.metadata) ? rawValue.metadata : {};
      const businessPhoneNumberId = asString(metadata.phone_number_id);

      for (const statusEvent of asObjectArray(rawValue.statuses)) {
        const providerMessageId = asString(statusEvent.id);
        const status = asString(statusEvent.status);
        if (!providerMessageId || !isDeliveryStatus(status)) continue;

        const conversation = isObject(statusEvent.conversation) ? statusEvent.conversation : undefined;
        events.push({
          providerMessageId,
          status,
          recipientPhone: asString(statusEvent.recipient_id),
          businessPhoneNumberId,
          occurredAt: getOccurredAt(asString(statusEvent.timestamp)),
          conversationId: conversation ? asString(conversation.id) : undefined,
          pricing: isObject(statusEvent.pricing) ? statusEvent.pricing : undefined,
          errors: asObjectArray(statusEvent.errors),
          rawStatus: statusEvent,
          rawValue,
        });
      }
    }
  }

  return events;
}

export function normalizeWhatsAppWebhookPayloadBundle(payload: unknown): NormalizedWhatsAppWebhookPayloadBundle {
  return {
    inboundEvents: normalizeWhatsAppWebhookPayload(payload),
    statusEvents: normalizeWhatsAppWebhookStatusPayload(payload),
  };
}
