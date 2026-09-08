import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { defineAgent } from "eve";

const apiKey = process.env.WHATSAPP_AGENT_LLM_API_KEY ?? "";
const baseURL = process.env.WHATSAPP_AGENT_LLM_BASE_URL ?? "";
const modelId = process.env.WHATSAPP_AGENT_LLM_MODEL ?? "deepseek-v4-flash";

// Extract just the model name if it includes a provider prefix (e.g., "opencode-go/deepseek-v4-flash" -> "deepseek-v4-flash")
const modelName = modelId.includes("/") ? modelId.split("/")[1] : modelId;

const openaiProvider = createOpenAICompatible({
  apiKey,
  baseURL,
  name: "openai-compatible",
});

// DeepSeek V4 Flash has a 64K token context window
const CONTEXT_WINDOW_TOKENS = 64000;

export default defineAgent({
  model: {
    model: openaiProvider(modelName),
    modelContextWindowTokens: CONTEXT_WINDOW_TOKENS,
  },
  limits: { sessionTimeoutMs: 1800000 },
});
