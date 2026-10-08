import { defineAgent } from "eve";

import { createDynamicModel } from "./model";

export default defineAgent({
  model: createDynamicModel(),
  limits: { sessionTimeoutMs: 1800000 },
});
