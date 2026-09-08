import { createOpenAI } from "@ai-sdk/openai";
import { defineAgent } from "eve";

const openaiProvider = createOpenAI({
  apiKey: process.env.WHATSAPP_AGENT_LLM_API_KEY,
  baseURL: process.env.WHATSAPP_AGENT_LLM_BASE_URL,
});

export default defineAgent({
  model: openaiProvider(process.env.WHATSAPP_AGENT_LLM_MODEL ?? "gpt-4o"),
  limits: { sessionTimeoutMs: 1800000 },
});
