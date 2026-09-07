import { createWhatsAppAdapter } from "@chat-adapter/whatsapp";
import { createMemoryState } from "@chat-adapter/state-memory";
import type { Message, Thread } from "chat";
import { chatSdkChannel } from "eve/channels/chat-sdk";

/**
 * WhatsApp channel connecting the Eve agent to Meta WhatsApp Cloud API.
 *
 * The WhatsApp adapter auto-detects credentials from the existing environment
 * variables: WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID,
 * WHATSAPP_VERIFY_TOKEN, and WHATSAPP_APP_SECRET. Streaming is disabled because
 * WhatsApp delivers single messages rather than streamed deltas.
 *
 * State uses an in-memory adapter for the channel's subscription/lock
 * bookkeeping; conversation/session durability is owned by Eve Workflows, in
 * line with the Stage 1 "no KV/Redis" decision.
 */
export const { bot, channel, send } = chatSdkChannel({
  userName: "Consultorio Dental",
  adapters: {
    whatsapp: createWhatsAppAdapter(),
  },
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
