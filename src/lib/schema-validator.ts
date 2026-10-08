// ─── AuditX Schema Validator ──────────────────────────────────────────────────
// Validates LLM outputs against Zod schemas before they touch any data.
// Throws SchemaValidationError — never silently accepts malformed output.

import { z } from "zod";
import { SchemaValidationError } from "./policy-engine";

export { SchemaValidationError };

// ── Generic validator ─────────────────────────────────────────────────────────

export function validateAgentOutput<T>(
  raw: unknown,
  schema: z.ZodSchema<T>,
  context?: string,
): T {
  // Strip markdown code fences the model may accidentally add
  let cleaned = raw;
  if (typeof raw === "string") {
    cleaned = raw
      .replace(/^```(?:json)?\s*/im, "")
      .replace(/\s*```\s*$/im, "")
      .trim();
    try {
      cleaned = JSON.parse(cleaned as string);
    } catch {
      throw new SchemaValidationError(
        `${context ?? "LLM output"} is not valid JSON: ${String(raw).slice(0, 200)}`,
        raw,
      );
    }
  }

  const result = schema.safeParse(cleaned);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join(", ");
    throw new SchemaValidationError(
      `${context ?? "LLM output"} failed schema validation: ${issues}`,
      cleaned,
    );
  }
  return result.data;
}

// ── Extraction output schema ───────────────────────────────────────────────────

export const ExtractionOutputSchema = z.object({
  transaction_date: z.string().nullable(),
  ticker:           z.string().nullable(),
  action:           z.enum(["BUY", "SELL", "DIV"]).nullable(),
  quantity:         z.number().nullable(),
  price:            z.number().nullable(),
  fees:             z.number().nullable(),
  wht:              z.number().nullable(),
  ref_id:           z.string().nullable(),
  broker:           z.string().nullable(),
  exchange:         z.string().nullable(),
  field_confidences: z.record(z.string(), z.number()).optional(),
});

export type ExtractionOutput = z.infer<typeof ExtractionOutputSchema>;

// ── Agent plan schema (returned by fast model before execution) ───────────────

export const AgentPlanSchema = z.object({
  steps: z.array(z.object({
    tool:       z.string(),
    args:       z.record(z.string(), z.unknown()),
    confidence: z.number().min(0).max(1),
    rationale:  z.string().optional(),
  })),
  summary: z.string().optional(),
});

export type AgentPlan = z.infer<typeof AgentPlanSchema>;

// ── Reconciliation result schema ──────────────────────────────────────────────

export const ReconciliationResultSchema = z.object({
  matched:   z.array(z.object({ ref_id: z.string(), transaction_id: z.string() })),
  unmatched: z.array(z.object({
    ref_id:      z.string(),
    reason:      z.string(),
    ticker:      z.string().optional(),
    trade_date:  z.string().optional(),
  })),
  flags:     z.array(z.object({
    flag_type:   z.string(),
    severity:    z.enum(["ok", "warn", "bad"]),
    ticker:      z.string(),
    ref_id:      z.string().optional(),
    description: z.string(),
    expected:    z.unknown().optional(),
    actual:      z.unknown().optional(),
  })),
});

export type ReconciliationResult = z.infer<typeof ReconciliationResultSchema>;
