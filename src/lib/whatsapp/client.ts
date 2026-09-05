export type WhatsAppSendTextInput = {
  to: string;
  body: string;
  phoneNumberId?: string;
};

export type WhatsAppSendResult = {
  ok: boolean;
  skipped?: boolean;
  providerMessageId?: string;
  status: number | null;
  error?: string;
  response?: unknown;
};

export type WhatsAppFetch = typeof fetch;

function resolveCredentials(inputPhoneNumberId?: string) {
  return {
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
    phoneNumberId: inputPhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID,
    graphVersion: process.env.WHATSAPP_GRAPH_VERSION || "v20.0",
  };
}

function extractProviderMessageId(response: unknown) {
  if (!response || typeof response !== "object") return undefined;
  const messages = (response as { messages?: unknown }).messages;
  if (!Array.isArray(messages)) return undefined;
  const first = messages[0];
  if (!first || typeof first !== "object") return undefined;
  const id = (first as { id?: unknown }).id;
  return typeof id === "string" ? id : undefined;
}

export async function sendWhatsAppTextMessage(
  input: WhatsAppSendTextInput,
  fetchImpl: WhatsAppFetch = fetch
): Promise<WhatsAppSendResult> {
  const { accessToken, phoneNumberId, graphVersion } = resolveCredentials(input.phoneNumberId);
  if (!accessToken || !phoneNumberId) {
    return {
      ok: false,
      skipped: true,
      status: null,
      error: "WhatsApp Cloud API credentials are not configured.",
    };
  }

  try {
    const response = await fetchImpl(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: input.to,
        type: "text",
        text: {
          preview_url: false,
          body: input.body,
        },
      }),
    });

    const contentType = response.headers.get("content-type") || "";
    const body = contentType.includes("application/json") ? await response.json() : await response.text();

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: `WhatsApp Cloud API request failed with status ${response.status}.`,
        response: body,
      };
    }

    return {
      ok: true,
      status: response.status,
      providerMessageId: extractProviderMessageId(body),
      response: body,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      error: error instanceof Error ? error.message : "WhatsApp Cloud API request failed.",
    };
  }
}
