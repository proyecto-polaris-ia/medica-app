import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { defineDynamic } from "eve";

// DeepSeek V4 Flash has a 64K token context window
const CONTEXT_WINDOW_TOKENS = 64000;

export type ModelConfig = {
  apiKey: string;
  baseURL: string;
  modelName: string;
};

/**
 * Derives the provider configuration from the given environment. Exported for
 * testability (review finding R3-004): environment variables are read when the
 * resolver runs, never at module load, so tests and runtime can vary them.
 */
export function resolveModelConfig(
  env: Record<string, string | undefined>,
): ModelConfig {
  const modelId = env.WHATSAPP_AGENT_LLM_MODEL ?? "deepseek-v4-flash";

  // Extract just the model name if it includes a provider prefix (e.g., "opencode-go/deepseek-v4-flash" -> "deepseek-v4-flash")
  const modelName = modelId.includes("/") ? modelId.split("/")[1] : modelId;

  return {
    apiKey: env.WHATSAPP_AGENT_LLM_API_KEY ?? "",
    baseURL: env.WHATSAPP_AGENT_LLM_BASE_URL ?? "",
    modelName,
  };
}

/**
 * OpenAI-compatible provider shared by the root agent (Eva) and every declared
 * subagent. The session id travels as `x-opencode-session` so a subagent's child
 * session keeps its own traceable provider session.
 */
const createOpenCodeProvider = (config: ModelConfig, sessionId: string) =>
  createOpenAICompatible({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    name: "openai-compatible",
    headers: {
      "User-Agent": "medica-app-eve/0.1",
      "x-opencode-session": sessionId,
    },
  });

/**
 * Dynamic step-level model resolver reused by every `agent.ts` in this repo.
 * Returns a fresh sentinel per call so each agent owns its own dynamic model
 * definition instead of sharing one mutable runtime object.
 */
export function createDynamicModel() {
  return defineDynamic({
    events: {
      "step.started": (_event: unknown, ctx: { session: { id: string } }) => {
        const config = resolveModelConfig(process.env);
        return {
          model: createOpenCodeProvider(config, ctx.session.id)(config.modelName),
          modelContextWindowTokens: CONTEXT_WINDOW_TOKENS,
        };
      },
    },
  });
}