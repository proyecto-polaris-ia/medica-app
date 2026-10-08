import { createWhatsAppAdapter } from "@chat-adapter/whatsapp";
import { createMemoryState } from "@chat-adapter/state-memory";
import type { Message, Thread } from "chat";
import { chatSdkChannel } from "eve/channels/chat-sdk";

import { buildTrustedContactAuth, buildTrustedContactSendPayload } from "../trusted-contact-context";

const WHATSAPP_CREDENTIAL_KEYS = [
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_APP_SECRET",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_VERIFY_TOKEN",
] as const;

/**
 * Resolve a credential from the environment, falling back to a non-empty
 * placeholder when it is absent. `eve` derives the channel's webhook route from
 * the adapter keys of `chatSdkChannel`, so the WhatsApp adapter MUST always be
 * constructed — a channel with zero routes fails eve's build-time validation
 * ("compiled binding ... is not referenced by its node manifest"). The
 * WhatsApp adapter factory throws when any credential is missing, so we feed it
 * placeholders in credential-less builds (e.g. Vercel preview) to keep the
 * route registered while still degrading gracefully at runtime.
 */
const credential = (key: (typeof WHATSAPP_CREDENTIAL_KEYS)[number]): string =>
  process.env[key] || "unconfigured";

/**
 * WhatsApp channel connecting the Eve agent to Meta WhatsApp Cloud API.
 *
 * The WhatsApp adapter reads credentials from the environment variables
 * WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_VERIFY_TOKEN, and
 * WHATSAPP_APP_SECRET. Streaming is disabled because WhatsApp delivers single
 * messages rather than streamed deltas.
 *
 * State uses an in-memory adapter for the channel's subscription/lock
 * bookkeeping; conversation/session durability is owned by Eve Workflows, in
 * line with the Stage 1 "no KV/Redis" decision.
 */
export const { bot, channel, send } = chatSdkChannel({
  userName: "Consultorio Dental",
  adapters: {
    whatsapp: createWhatsAppAdapter({
      accessToken: credential("WHATSAPP_ACCESS_TOKEN"),
      appSecret: credential("WHATSAPP_APP_SECRET"),
      phoneNumberId: credential("WHATSAPP_PHONE_NUMBER_ID"),
      verifyToken: credential("WHATSAPP_VERIFY_TOKEN"),
    }),
  },
  state: createMemoryState(),
  streaming: false,
});

// Handler for new threads (first message).
bot.onNewMention(async (thread: Thread, message: Message) => {
  await thread.subscribe();
  await send(buildTrustedContactSendPayload(message), {
    auth: buildTrustedContactAuth(message),
    thread,
  });
});

// Handler for messages in already-subscribed threads.
bot.onSubscribedMessage(async (thread: Thread, message: Message) => {
  await send(buildTrustedContactSendPayload(message), {
    auth: buildTrustedContactAuth(message),
    thread,
  });
});

/**
 * Eve resolves an authored channel module by its default export. The
 * `chatSdkChannel` bridge exposes the `defineChannel(...)` result on `channel`,
 * so we re-export it as the module default while keeping `bot`/`send` named for
 * the inbound handlers above.
 */
export default channel;
