// ─── AuditX AI Provider — OpenRouter (primary) ───────────────────────────────
//
// OpenRouter exposes an OpenAI-compatible endpoint at https://openrouter.ai/api/v1
// and supports 400+ models through a single API key.
//
// MODEL STRATEGY (free-only, tool-calling capable):
//   Cascade through FREE_MODELS in order. Skip any model that returns a
//   quota, rate-limit, or upstream provider error (429 / 502 / 503).
//   resolveAgentModel() probes each model with a minimal test call and
//   returns the first one that responds successfully — so a temporarily
//   overloaded provider (e.g. Nvidia 502) is automatically skipped.
//
// OPENROUTER DOCS: https://openrouter.ai/docs
//   • All models accept the OpenAI chat completions schema
//   • Tool calling is supported and normalised across providers
//   • ":free" suffix = zero-cost tier of that model
//   • Required headers: Authorization: Bearer <key>

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";
import type { LanguageModel as LanguageModelV1 } from "ai";

// ── OpenRouter base URL ───────────────────────────────────────────────────────

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

// ── Free models cascade (all support tool calling) ───────────────────────────
// Listed best-first. resolveAgentModel() will skip any that are overloaded.
//
//  1. deepseek/deepseek-r1-0528:free        — strong reasoning, large context
//  2. deepseek/deepseek-chat-v3-0324:free   — fast chat, good tool use
//  3. meta-llama/llama-3.3-70b-instruct:free — reliable, broadly available
//  4. mistralai/mistral-7b-instruct:free    — lightweight, rarely overloaded
//  5. nvidia/nemotron-3-ultra-550b-a55b:free — great but often overloaded
//  6. inclusionai/ling-3.0-flash-fin:free   — finance-focused fallback
//  7. openrouter/auto                       — OpenRouter picks best available

export const FREE_MODELS = [
  "deepseek/deepseek-r1-0528:free",
  "deepseek/deepseek-chat-v3-0324:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "mistralai/mistral-7b-instruct:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "inclusionai/ling-3.0-flash-fin:free",
  "openrouter/auto",
] as const;

export type FreeModel = (typeof FREE_MODELS)[number];

// ── Provider factory ──────────────────────────────────────────────────────────

export function createOpenRouterProvider(apiKey: string) {
  return createOpenAICompatible({
    name: "openrouter",
    baseURL: OPENROUTER_BASE,
    headers: {
      "Authorization":             `Bearer ${apiKey}`,
      "HTTP-Referer":              "https://auditx-beta.vercel.app",
      "X-Title":                   "AuditX - AI Financial Audit",
      "X-OpenRouter-Allow-Fallback": "1",
    },
  });
}

// ── isProviderError ───────────────────────────────────────────────────────────
// Returns true for any transient error that warrants trying the next model:
// quota exhaustion, rate limits, upstream provider overload (502), and
// temporary unavailability (503).

export function isProviderError(e: unknown): boolean {
  const msg = String((e as Error)?.message ?? "").toLowerCase();
  const code = (e as { code?: number | string })?.code;

  return (
    msg.includes("429") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("quota") ||
    msg.includes("resource_exhausted") ||
    msg.includes("rate limit") ||
    msg.includes("rate-limit") ||
    msg.includes("overloaded") ||
    msg.includes("temporarily unavailable") ||
    msg.includes("upstream error") ||
    msg.includes("provider_unavailable") ||
    code === 429 ||
    code === 502 ||
    code === 503
  );
}

// Keep the old name as an alias so existing callers in api/chat.ts don't break.
export const isQuotaError = isProviderError;

// ── Resolved model result ─────────────────────────────────────────────────────

export interface ResolvedModel {
  provider: "openrouter";
  modelId:  FreeModel;
  model:    LanguageModelV1;
}

// ── probeModel ───────────────────────────────────────────────────────────────
// Send a minimal 1-token test call to verify the model is accepting requests.
// Returns true if the model responded without a provider/quota error.

async function probeModel(model: LanguageModelV1): Promise<boolean> {
  try {
    await generateText({
      model,
      prompt: "hi",
      maxOutputTokens: 1,
    });
    return true;
  } catch (e) {
    if (isProviderError(e)) return false;
    // Non-provider errors (auth, bad request, etc.) mean the key is broken —
    // stop the cascade immediately by re-throwing.
    throw e;
  }
}

// ── resolveAgentModel ─────────────────────────────────────────────────────────
// Walks FREE_MODELS in order, probing each one, and returns the first that
// responds. Returns null only if the API key is missing/invalid.

export async function resolveAgentModel(): Promise<ResolvedModel | null> {
  const apiKey = process.env["OPENROUTER_API_KEY"];
  if (!apiKey || apiKey.length < 10) {
    console.error("[AuditX] OPENROUTER_API_KEY is not set or too short.");
    return null;
  }

  // Quick key validity check (does not consume quota).
  const keyOk = await isOpenRouterKeyHealthy(apiKey);
  if (!keyOk) {
    console.error("[AuditX] OPENROUTER_API_KEY appears invalid (401/403).");
    return null;
  }

  const provider = createOpenRouterProvider(apiKey);

  for (const modelId of FREE_MODELS) {
    const model = provider(modelId) as LanguageModelV1;
    console.log(`[AuditX] Probing model: ${modelId}`);
    try {
      const ok = await probeModel(model);
      if (ok) {
        console.log(`[AuditX] Using model: ${modelId}`);
        return { provider: "openrouter", modelId, model };
      }
      console.warn(`[AuditX] Model unavailable, trying next: ${modelId}`);
    } catch (e) {
      // Non-transient error — key is broken, abort.
      console.error("[AuditX] Fatal error during model probe:", e);
      return null;
    }
  }

  console.error("[AuditX] All models in cascade are unavailable.");
  return null;
}

// ── isOpenRouterKeyHealthy ────────────────────────────────────────────────────
// Fetch the model list endpoint — cheap, no quota consumed.
// 401/403 = bad key. Anything else (429, 502…) = key is fine, provider busy.

async function isOpenRouterKeyHealthy(apiKey: string): Promise<boolean> {
  try {
    const res = await fetch(`${OPENROUTER_BASE}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8000),
    });
    return res.status !== 401 && res.status !== 403;
  } catch {
    return false;
  }
}

// ── resolveModelFromKey ───────────────────────────────────────────────────────
// Synchronous helper: wraps a specific model ID without probing.
// Used by delegate_agent sub-tasks that already have a fallback loop.

export function resolveModelFromKey(
  apiKey: string,
  modelId: FreeModel = FREE_MODELS[0],
): LanguageModelV1 {
  const provider = createOpenRouterProvider(apiKey);
  return provider(modelId) as LanguageModelV1;
}

// ── getModelCascade ───────────────────────────────────────────────────────────
// Returns all models as an ordered list for callers that implement their own
// retry loop (e.g. delegate_agent in api/chat.ts).

export function getModelCascade(
  apiKey: string,
): Array<{ id: FreeModel; model: LanguageModelV1 }> {
  const provider = createOpenRouterProvider(apiKey);
  return FREE_MODELS.map((id) => ({ id, model: provider(id) as LanguageModelV1 }));
}
