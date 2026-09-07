import { createWhatsAppAdapter } from "@chat-adapter/whatsapp";
import { createMemoryState } from "@chat-adapter/state-memory";
import type { Message, Thread } from "chat";
import { chatSdkChannel } from "eve/channels/chat-sdk";

const WHATSAPP_CREDENTIAL_KEYS = [
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_APP_SECRET",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_VERIFY_TOKEN",
] as const;

/**
 * The WhatsApp adapter throws at construction time if any required credential
 * is missing, which breaks `eve build` in credential-less environments (e.g.
 * Vercel preview builds). Following the project's "external integrations MUST
 * degrade gracefully when keys are missing" rule, the adapter is only
 * registered when all four WHATSAPP_* variables are present; otherwise the
 * channel mounts with no adapters and no webhook route until credentials exist.
 */
const hasWhatsAppCredentials = WHATSAPP_CREDENTIAL_KEYS.every(
  (key) => typeof process.env[key] === "string" && process.env[key]!.length > 0
);

/**
 * WhatsApp channel connecting the Eve agent to Meta WhatsApp Cloud API.
 *
 * The WhatsApp adapter auto-detects credentials from the environment variables
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
  adapters: hasWhatsAppCredentials
    ? { whatsapp: createWhatsAppAdapter() }
    : {},
  state: createMemoryState(),
  streaming: false,
});

// Handler for new threads (first message).
bot.onNewMention(async (thread: Thread, message: Message) => {
  await thread.subscribe();
  await send(message.text, { thread });
});

// Handler for messages in already-subscribed threads.
bot.onSubscribedMessage(async (thread: Thread, message: Message) => {
  await send(message.text, { thread });
});

/**
 * Eve resolves an authored channel module by its default export. The
 * `chatSdkChannel` bridge exposes the `defineChannel(...)` result on `channel`,
 * so we re-export it as the module default while keeping `bot`/`send` named for
 * the inbound handlers above.
 */
export default channel;
