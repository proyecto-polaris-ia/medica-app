import { defineAgent } from "eve";

export default defineAgent({
  model: "openai/gpt-4o",
  limits: { sessionTimeoutMs: 1800000 },
});
