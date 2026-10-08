// ─── AuditX Model Routing ─────────────────────────────────────────────────────
// Wraps audit-agent.server.ts without modifying it.
// Only the `model` string (and fallback list) changes per task type.
// Keys, endpoints, auth, and provider options are untouched.

import { resolveAgentModel, type ResolvedModel } from "./audit-agent.server";

// ── Task types ────────────────────────────────────────────────────────────────

export type TaskType =
  | "extraction"    // Parse unstructured docs → JSON  (fast, cheap)
  | "classification" // Classify action type / category (fast, cheap)
  | "dedup"          // Detect duplicate rows            (fast, cheap)
  | "reasoning"      // Ambiguous multi-doc reasoning    (strong model)
  | "explanation";   // User-facing plain-English text   (mid-tier)

export interface ModelRoute {
  primary: string;
  fallbacks: string[];
}

// ── Routing table ─────────────────────────────────────────────────────────────
// Override `reasoning` primary via OPENROUTER_MODEL env var (already supported
// by resolveAgentModel).  All other models are sane free-tier defaults.

function buildRoutingTable(): Record<TaskType, ModelRoute> {
  const reasoningModel =
    (typeof process !== "undefined" ? process.env["OPENROUTER_MODEL"] : undefined) ??
    "openai/gpt-4o";

  return {
    extraction: {
      primary:   "openai/gpt-4o-mini",
      fallbacks: [
        "meta-llama/llama-3.3-70b-instruct:free",
        "mistralai/mistral-7b-instruct:free",
      ],
    },
    classification: {
      primary:   "openai/gpt-4o-mini",
      fallbacks: [
        "meta-llama/llama-3.3-70b-instruct:free",
        "mistralai/mistral-7b-instruct:free",
      ],
    },
    dedup: {
      primary:   "openai/gpt-4o-mini",
      fallbacks: [
        "mistralai/mistral-7b-instruct:free",
        "meta-llama/llama-3.1-8b-instruct:free",
      ],
    },
    reasoning: {
      primary:   reasoningModel,
      fallbacks: [
        "openai/gpt-4o-mini",
        "anthropic/claude-3-haiku",
        "meta-llama/llama-3.3-70b-instruct:free",
      ],
    },
    explanation: {
      primary:   "openai/gpt-4o-mini",
      fallbacks: [
        "meta-llama/llama-3.3-70b-instruct:free",
        "mistralai/mistral-7b-instruct:free",
      ],
    },
  };
}

// Cache at module level — built once on first access
let _table: Record<TaskType, ModelRoute> | null = null;

export function getModelRoutingTable(): Record<TaskType, ModelRoute> {
  if (!_table) _table = buildRoutingTable();
  return _table;
}

// ── Resolve model for a task ──────────────────────────────────────────────────
// Returns the same ResolvedModel shape from audit-agent.server.ts.
// Falls back through the task's fallback list before giving up.

export async function resolveTaskModel(
  task: TaskType,
  env?: Record<string, unknown>,
): Promise<ResolvedModel | null> {
  const table = getModelRoutingTable();
  const route = table[task];

  // Try primary first, then each fallback, by temporarily injecting the model
  // into the env so resolveAgentModel picks it up via OPENROUTER_MODEL.
  const candidates = [route.primary, ...route.fallbacks];

  for (const modelId of candidates) {
    const patchedEnv: Record<string, unknown> = {
      ...(env ?? {}),
      OPENROUTER_MODEL: modelId,
    };
    const resolved = await resolveAgentModel(patchedEnv);
    if (resolved) {
      // Override the modelId label to reflect the actual task model
      return { ...resolved, modelId };
    }
  }

  return null;
}
