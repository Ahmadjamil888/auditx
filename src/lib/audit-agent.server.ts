// ─── AuditX AI Provider — OpenRouter (primary) ───────────────────────────────
//
// OpenRouter exposes an OpenAI-compatible endpoint at https://openrouter.ai/api/v1.
//
// MODEL STRATEGY
// resolveAgentModel() no longer probes models at cold-start — probing wastes
// quota and fails on Vercel edge/serverless where outbound requests during
// module initialisation behave differently. Instead it returns the first model
// in the cascade immediately. If that model is overloaded the streaming call
// in api/chat.ts will throw an isProviderError and the delegate_agent loop
// will cascade through the remaining models automatically.
//
// API KEY RESOLUTION (in priority order):
//   1. process.env.OPENROUTER_API_KEY       ← set in Vercel env vars
//   2. import.meta.env.VITE_OPENROUTER_API_KEY ← Vite-injected fallback
//
// Both names are accepted so the same code works in dev (Vite) and production
// (Vercel / Cloudflare Workers) without any extra configuration.

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel as LanguageModelV1 } from "ai";

// ── OpenRouter base URL ───────────────────────────────────────────────────────

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

// ── Resolve the API key from either env var name ──────────────────────────────

function resolveApiKey(env?: Record<string, unknown>): string | undefined {
  // First check the passed env object (for serverless/Vercel)
  if (env) {
    const fromEnv = env["OPENROUTER_API_KEY"] as string | undefined;
    console.log("[AuditX] env.OPENROUTER_API_KEY:", fromEnv ? `exists (length: ${fromEnv.length})` : "undefined");
    if (fromEnv && fromEnv.length >= 10) {
      return fromEnv;
    }

    const fromEnvVite = env["VITE_OPENROUTER_API_KEY"] as string | undefined;
    console.log("[AuditX] env.VITE_OPENROUTER_API_KEY:", fromEnvVite ? `exists (length: ${fromEnvVite.length})` : "undefined");
    if (fromEnvVite && fromEnvVite.length >= 10) {
      return fromEnvVite;
    }
  }

  // process.env works on Node/Vercel/Cloudflare Workers
  const fromProcess = process.env["OPENROUTER_API_KEY"];
  console.log("[AuditX] process.env.OPENROUTER_API_KEY:", fromProcess ? `exists (length: ${fromProcess.length})` : "undefined");
  if (fromProcess && fromProcess.length >= 10) {
    return fromProcess;
  }

  // Try VITE_ prefixed version (for Vite builds)
  const fromProcessVite = process.env["VITE_OPENROUTER_API_KEY"];
  console.log("[AuditX] process.env.VITE_OPENROUTER_API_KEY:", fromProcessVite ? `exists (length: ${fromProcessVite.length})` : "undefined");
  if (fromProcessVite && fromProcessVite.length >= 10) {
    return fromProcessVite;
  }

  // import.meta.env is injected by Vite for VITE_* variables — useful in dev
  // and in SSR builds where Vite bundles the value in.
  try {
    const fromVite = (import.meta.env as Record<string, string | undefined>)[
      "VITE_OPENROUTER_API_KEY"
    ];
    console.log("[AuditX] import.meta.env.VITE_OPENROUTER_API_KEY:", fromVite ? `exists (length: ${fromVite.length})` : "undefined");
    if (fromVite && fromVite.length >= 10) {
      return fromVite;
    }
  } catch {
    // import.meta.env may not exist in all runtimes — safe to ignore
    console.log("[AuditX] import.meta.env not available");
  }

  console.log("[AuditX] No valid API key found");
  return undefined;
}

// ── Free models cascade (all support tool calling) ───────────────────────────
// Listed best-first. delegate_agent tries each in order on quota/provider errors.
// IMPORTANT: only ":free" suffix models are truly zero-cost on OpenRouter.
// Verify availability at https://openrouter.ai/models?q=:free
//
//  1. meta-llama/llama-3.3-70b-instruct:free — reliable, broadly available
//  2. mistralai/mistral-7b-instruct:free     — lightweight, very available
//  3. google/gemma-3-27b-it:free             — capable, free tier
//  4. deepseek/deepseek-chat-v3-0324:free    — fast, good tool use
//  5. nvidia/nemotron-3-ultra-550b-a55b:free — strong but sometimes overloaded
//  6. inclusionai/ling-3.0-flash-fin:free    — finance-focused fallback

export const FREE_MODELS = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "mistralai/mistral-7b-instruct:free",
  "google/gemma-3-27b-it:free",
  "deepseek/deepseek-chat-v3-0324:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "inclusionai/ling-3.0-flash-fin:free",
] as const;

export type FreeModel = (typeof FREE_MODELS)[number];

// ── Provider factory ──────────────────────────────────────────────────────────

export function createOpenRouterProvider(apiKey: string) {
  return createOpenAICompatible({
    name: "openrouter",
    baseURL: OPENROUTER_BASE,
    headers: {
      "Authorization":               `Bearer ${apiKey}`,
      "HTTP-Referer":                "https://auditx-beta.vercel.app",
      "X-Title":                     "AuditX - AI Financial Audit",
      "X-OpenRouter-Allow-Fallback": "1",
    },
  });
}

// ── Resolved model result ─────────────────────────────────────────────────────

export interface ResolvedModel {
  provider: "openrouter";
  modelId:  FreeModel;
  model:    LanguageModelV1;
  /** Full ordered cascade — the POST handler should try these in order */
  cascade:  Array<{ id: FreeModel; model: LanguageModelV1 }>;
}

// ── resolveAgentModel ─────────────────────────────────────────────────────────
// Returns the primary model immediately — no cold-start probing.
// Returns null only when the API key is genuinely absent/invalid so the
// caller can return a clear 500 to the client.

export async function resolveAgentModel(env?: Record<string, unknown>): Promise<ResolvedModel | null> {
  const apiKey = resolveApiKey(env);

  if (!apiKey) {
    console.warn(
      "[AuditX] OPENROUTER_API_KEY is not set. " +
      "AI features will be disabled. Add it to your .env file for local dev or Vercel environment variables for production.",
    );
    return null;
  }

  const provider = createOpenRouterProvider(apiKey);
  const primaryModel = FREE_MODELS[0];
  const cascade = FREE_MODELS.map((id) => ({ id, model: provider(id) as LanguageModelV1 }));

  return {
    provider: "openrouter",
    modelId:  primaryModel,
    model:    cascade[0]!.model,
    cascade,
  };
}

// ── isProviderError ───────────────────────────────────────────────────────────
// Returns true for any transient error worth retrying on the next model.

export function isProviderError(e: unknown): boolean {
  const msg  = String((e as Error)?.message ?? "").toLowerCase();
  const code = (e as { code?: number | string })?.code;
  // status field is set by the AI SDK on API errors
  const status = (e as { status?: number })?.status;
  return (
    msg.includes("402") ||
    msg.includes("429") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("quota") ||
    msg.includes("credits") ||
    msg.includes("resource_exhausted") ||
    msg.includes("rate limit") ||
    msg.includes("rate-limit") ||
    msg.includes("overloaded") ||
    msg.includes("temporarily unavailable") ||
    msg.includes("upstream error") ||
    msg.includes("provider_unavailable") ||
    msg.includes("requires more credits") ||
    code === 402 ||
    code === 429 ||
    code === 502 ||
    code === 503 ||
    status === 402 ||
    status === 429 ||
    status === 502 ||
    status === 503
  );
}

// Keep old name as alias — api/chat.ts imports isQuotaError
export const isQuotaError = isProviderError;

// ── resolveModelFromKey ───────────────────────────────────────────────────────
// Synchronous helper for callers that already have the key.

export function resolveModelFromKey(
  apiKey: string,
  modelId: FreeModel = FREE_MODELS[0],
): LanguageModelV1 {
  return createOpenRouterProvider(apiKey)(modelId) as LanguageModelV1;
}

// ── getModelCascade ───────────────────────────────────────────────────────────
// Returns all models as an ordered list for the delegate_agent retry loop.

export function getModelCascade(
  apiKey: string,
): Array<{ id: FreeModel; model: LanguageModelV1 }> {
  const provider = createOpenRouterProvider(apiKey);
  return FREE_MODELS.map((id) => ({ id, model: provider(id) as LanguageModelV1 }));
}
