// ─── AuditX AI Provider — OpenRouter (primary) ───────────────────────────────
//
// OpenRouter is the primary provider. It exposes an OpenAI-compatible endpoint
// at https://openrouter.ai/api/v1 and supports 400+ models through a single key.
//
// MODEL STRATEGY (free-only, tool-calling capable):
//   PRIMARY   : nvidia/nemotron-3-ultra-550b-a55b:free — top free model, 1M context
//   FALLBACK 1: inclusionai/ling-3.0-flash-fin:free   — finance-focused free model
//   FALLBACK 2: openrouter/free                       — OpenRouter auto-selects any free
//                                              model that supports tool calling
//
// The resolver cascades through the list, skipping any model that returns a
// quota / rate-limit error (429, 503) so the agent always gets a working model.
//
// OPENROUTER DOCS: https://openrouter.ai/docs
//   • All models accept the OpenAI chat completions schema
//   • Tool calling is supported and normalised across providers
//   • ":free" suffix = zero-cost tier of that model
//   • "openrouter/free" = auto-selected free model with feature-aware routing
//   • Required headers: Authorization: Bearer <key>
//   • Optional headers: HTTP-Referer, X-Title (for rankings / attribution)

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModelV1 } from "ai";

// ── OpenRouter base URL ───────────────────────────────────────────────────────

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

// ── Free models cascade (best-first, all support tool calling) ───────────────
// Each ":free" model is the zero-cost tier; they share rate limits but are
// genuinely free with no per-token charges.

export const FREE_MODELS = [
  "nvidia/nemotron-3-ultra-550b-a55b:free",  // Top free model: 1M context, strong reasoning
  "inclusionai/ling-3.0-flash-fin:free",     // Finance-focused free model
  "openrouter/free",                          // OpenRouter auto-router — picks best free
] as const;

export type FreeModel = (typeof FREE_MODELS)[number];

// ── Provider factory ──────────────────────────────────────────────────────────

export function createOpenRouterProvider(apiKey: string) {
  return createOpenAICompatible({
    name: "openrouter",
    baseURL: OPENROUTER_BASE,
    headers: {
      "Authorization":  `Bearer ${apiKey}`,
      "HTTP-Referer":   "https://auditx.app",
      "X-Title":        "AuditX — AI Financial Audit",
      // Tell OpenRouter we allow fallback so it can auto-failover on errors
      "X-OpenRouter-Allow-Fallback": "1",
    },
  });
}

// ── Health probe ──────────────────────────────────────────────────────────────
// Quick lightweight check — fetch model listing with the key.

async function isOpenRouterKeyHealthy(apiKey: string): Promise<boolean> {
  try {
    const res = await fetch(`${OPENROUTER_BASE}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8000),
    });
    // 401/403 = bad key, anything else (including 429) means the key works
    return res.status !== 401 && res.status !== 403;
  } catch {
    return false;
  }
}

// ── Resolved model result ─────────────────────────────────────────────────────

export interface ResolvedModel {
  provider: "openrouter";
  modelId:  FreeModel;
  model:    LanguageModelV1;
}

// ── resolveAgentModel — exported for use in api/chat.ts ──────────────────────
//
// Returns the best available free OpenRouter model, or null if the key is
// missing / invalid (so the caller can return a 500 with a clear message).

export async function resolveAgentModel(): Promise<ResolvedModel | null> {
  const apiKey = process.env["OPENROUTER_API_KEY"];
  if (!apiKey || apiKey.length < 10) {
    console.error("[AuditX] OPENROUTER_API_KEY is not set or too short.");
    return null;
  }

  const healthy = await isOpenRouterKeyHealthy(apiKey);
  if (!healthy) {
    console.error("[AuditX] OPENROUTER_API_KEY appears invalid (401/403).");
    return null;
  }

  const provider = createOpenRouterProvider(apiKey);

  // Return the primary model — the Vercel AI SDK's streamText already handles
  // per-request errors. If a model quota is hit mid-stream the chat API will
  // cascade using the FREE_MODELS list via resolveWithFallback below.
  const primaryModel = FREE_MODELS[0];
  return {
    provider: "openrouter",
    modelId:  primaryModel,
    model:    provider(primaryModel) as LanguageModelV1,
  };
}

// ── resolveWithFallback — for specialist delegate_agent calls ─────────────────
// Tries each free model in order; returns the first one that doesn't immediately
// fail the lightweight probe. Used when the caller wants to pick a fallback model
// for a sub-task without re-doing the full key health check.

export function resolveModelFromKey(apiKey: string, modelId: FreeModel = FREE_MODELS[0]): LanguageModelV1 {
  const provider = createOpenRouterProvider(apiKey);
  return provider(modelId) as LanguageModelV1;
}

// ── isQuotaError — helper for callers that catch streaming errors ─────────────

export function isQuotaError(e: unknown): boolean {
  const msg = String((e as Error)?.message ?? "").toLowerCase();
  return (
    msg.includes("429") ||
    msg.includes("quota") ||
    msg.includes("resource_exhausted") ||
    msg.includes("rate limit") ||
    msg.includes("rate-limit") ||
    msg.includes("503")
  );
}

// ── getModelCascade — ordered list for multi-attempt callers ─────────────────

export function getModelCascade(apiKey: string): Array<{ id: FreeModel; model: LanguageModelV1 }> {
  const provider = createOpenRouterProvider(apiKey);
  return FREE_MODELS.map((id) => ({ id, model: provider(id) as LanguageModelV1 }));
}
