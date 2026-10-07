import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { defineDynamic } from "eve";

const apiKey = process.env.WHATSAPP_AGENT_LLM_API_KEY ?? "";
const baseURL = process.env.WHATSAPP_AGENT_LLM_BASE_URL ?? "";
const modelId = process.env.WHATSAPP_AGENT_LLM_MODEL ?? "deepseek-v4-flash";

// Extract just the model name if it includes a provider prefix (e.g., "opencode-go/deepseek-v4-flash" -> "deepseek-v4-flash")
const modelName = modelId.includes("/") ? modelId.split("/")[1] : modelId;

/**
 * OpenAI-compatible provider shared by the root agent (Eva) and every declared
 * subagent. The session id travels as `x-opencode-session` so a subagent's child
 * session keeps its own traceable provider session.
 */
const createOpenCodeProvider = (sessionId: string) =>
  createOpenAICompatible({
    apiKey,
    baseURL,
    name: "openai-compatible",
    headers: {
      "User-Agent": "medica-app-eve/0.1",
      "x-opencode-session": sessionId,
    },
  });

// DeepSeek V4 Flash has a 64K token context window
const CONTEXT_WINDOW_TOKENS = 64000;

/**
 * Dynamic step-level model resolver reused by every `agent.ts` in this repo.
 * Returns a fresh sentinel per call so each agent owns its own dynamic model
 * definition instead of sharing one mutable runtime object.
 */
export function createDynamicModel() {
  return defineDynamic({
    events: {
      "step.started": (_event: unknown, ctx: { session: { id: string } }) => ({
        model: createOpenCodeProvider(ctx.session.id)(modelName),
        modelContextWindowTokens: CONTEXT_WINDOW_TOKENS,
      }),
    },
  });
}
