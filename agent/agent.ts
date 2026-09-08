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

export default defineAgent({
  model: openaiProvider(modelName),
  limits: { sessionTimeoutMs: 1800000 },
  compaction: false, // Disable compaction for custom models without AI Gateway metadata
});
