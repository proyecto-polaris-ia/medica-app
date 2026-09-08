import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { defineAgent } from "eve";

const apiKey = process.env.WHATSAPP_AGENT_LLM_API_KEY;
const baseURL = process.env.WHATSAPP_AGENT_LLM_BASE_URL;

if (!apiKey || !baseURL) {
  throw new Error("WHATSAPP_AGENT_LLM_API_KEY and WHATSAPP_AGENT_LLM_BASE_URL are required");
}

const openaiProvider = createOpenAICompatible({
  apiKey,
  baseURL,
  name: "openai-compatible",
});

export default defineAgent({
  model: openaiProvider(process.env.WHATSAPP_AGENT_LLM_MODEL ?? "opencode-go/deepseek-v4-flash"),
  limits: { sessionTimeoutMs: 1800000 },
});
