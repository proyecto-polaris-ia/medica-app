// @vitest-environment node
/**
 * Pruebas de la tool `get-follow-up-rules` (issue #161, Fase 4).
 *
 * Guardrails (spec `clara-follow-up-tools` → "Tool de reglas de segmentación"):
 *   - Los umbrales coinciden exactamente con `src/lib/admin/follow-up/config.ts`
 *     (la tool no repite valores literales).
 *   - `reasonPriority` respeta el orden de `FOLLOW_UP_REASON_PRIORITY`.
 *   - Las etiquetas coinciden con `followUpReasonLabel`.
 *   - La definición de la ronda es la de `currentRoundDate`.
 *   - Sin autorización no responde con reglas.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { applyEnv, discordCtx, resetClaraEnv, STAFF_DISCORD_ID } from "./support";

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdmin: () => {
    throw new Error("get-follow-up-rules no debe tocar la base");
  },
}));

const { default: tool } = await import(
  "../../../../agents/clara/agent/tools/get-follow-up-rules"
);
const { CLARA_ACCESS_REFUSAL } = await import(
  "../../../../agents/clara/agent/access"
);
const { currentRoundDate } = await import("@/lib/admin/follow-up/follow-up");
const { followUpReasonLabel } = await import("@/lib/admin/follow-up/rules");
const config = await import("@/lib/admin/follow-up/config");

const execute = tool.execute as (input: unknown, ctx?: unknown) => Promise<unknown>;

type RulesResult = {
  success: boolean;
  roundDate?: string;
  thresholds?: Record<string, number>;
  reasonPriority?: string[];
  reasonLabels?: Record<string, string>;
  roundDefinition?: string;
  error?: string;
};

describe("get-follow-up-rules", () => {
  beforeEach(() => {
    resetClaraEnv();
    applyEnv({ CLARA_DISCORD_STAFF_IDS: STAFF_DISCORD_ID });
  });

  it("devuelve los umbrales vigentes importados del módulo", async () => {
    const result = (await execute({}, discordCtx())) as RulesResult;

    expect(result.success).toBe(true);
    expect(result.thresholds).toEqual({
      noShowWindowDays: config.NO_SHOW_WINDOW_DAYS,
      stalledTreatmentDays: config.STALLED_TREATMENT_DAYS,
      inactivePatientMonths: config.INACTIVE_PATIENT_MONTHS,
      inactivePatientDays: config.INACTIVE_PATIENT_DAYS,
      unansweredQuoteDays: config.UNANSWERED_QUOTE_DAYS,
    });
    expect(config.NO_SHOW_WINDOW_DAYS).toBe(90);
    expect(config.STALLED_TREATMENT_DAYS).toBe(45);
    expect(config.INACTIVE_PATIENT_MONTHS).toBe(6);
    expect(config.INACTIVE_PATIENT_DAYS).toBe(180);
    expect(config.UNANSWERED_QUOTE_DAYS).toBe(21);
  });

  it("respeta el orden de prioridad de motivos", async () => {
    const result = (await execute({}, discordCtx())) as RulesResult;

    expect(result.reasonPriority).toEqual([...config.FOLLOW_UP_REASON_PRIORITY]);
    expect(result.reasonPriority).toEqual([
      "no_show",
      "treatment_in_progress",
      "quote_no_response",
      "inactive",
    ]);
  });

  it("usa las etiquetas del módulo de reglas", async () => {
    const result = (await execute({}, discordCtx())) as RulesResult;

    expect(result.reasonLabels).toEqual({
      no_show: followUpReasonLabel("no_show"),
      treatment_in_progress: followUpReasonLabel("treatment_in_progress"),
      quote_no_response: followUpReasonLabel("quote_no_response"),
      inactive: followUpReasonLabel("inactive"),
    });
  });

  it("reporta la ronda actual con currentRoundDate", async () => {
    const result = (await execute({}, discordCtx())) as RulesResult;

    expect(result.roundDate).toBe(currentRoundDate(new Date()));
    expect(result.roundDefinition).toContain("America/Mexico_City");
  });

  it("sin autorización falla cerrado sin devolver umbrales", async () => {
    const result = (await execute({}, discordCtx("000000000000000000"))) as RulesResult;

    expect(result).toMatchObject({ success: false, error: CLARA_ACCESS_REFUSAL });
    expect(result.thresholds).toBeUndefined();
    expect(result.reasonPriority).toBeUndefined();
  });

  it("falla cerrado con la allowlist vacía", async () => {
    resetClaraEnv();
    const result = (await execute({}, discordCtx())) as RulesResult;
    expect(result).toMatchObject({ success: false, error: CLARA_ACCESS_REFUSAL });
  });
});
