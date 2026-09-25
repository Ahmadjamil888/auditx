// ─── AuditX AI Provider — Groq (primary) ───────────────────────────────────────
//
// Groq provides fast inference with open-source models.
// API: https://console.groq.com/docs
// Base URL: https://api.groq.com/openai/v1
//
// MODEL STRATEGY
// resolveAgentModel() no longer probes models at cold-start — probing wastes
// quota and fails on Vercel edge/serverless where outbound requests during
// module initialisation behave differently. Instead it returns the first model
// in the cascade immediately. If that model is overloaded the streaming call
// in api/chat.ts will throw an isProviderError and the delegate_agent loop
// will cascade through the remaining models automatically.
//
// API KEY RESOLUTION:
//   GROQ_API_KEY from environment variables (server-side only)

import { createGroq } from "@ai-sdk/groq";
import type { LanguageModel as LanguageModelV1 } from "ai";

// ── Groq base URL ───────────────────────────────────────────────────────

const GROQ_BASE = "https://api.groq.com/openai/v1";

// ── Resolve the API key from environment ──────────────────────────────

// Global state for API key rotation
let currentKeyIndex = 0;
const API_KEY_NAMES = ["GROQ_API_KEY", "GROQ_API_KEY_TWO"] as const;

function resolveApiKey(env?: Record<string, unknown>, requestedIndex?: number): string | undefined {
  const keyIndex = requestedIndex ?? currentKeyIndex;
  const keyName = API_KEY_NAMES[keyIndex % API_KEY_NAMES.length];

  // First check the passed env object (for serverless/Vercel)
  if (env && keyName) {
    const fromEnv = env[keyName] as string | undefined;
    console.log(`[AuditX] env.${keyName}:`, fromEnv ? `exists (length: ${fromEnv.length})` : "undefined");
    if (fromEnv && fromEnv.length >= 10) {
      return fromEnv;
    }
  }

  // process.env works on Node/Vercel/Cloudflare Workers
  if (keyName) {
    const fromProcess = process.env[keyName];
    console.log(`[AuditX] process.env.${keyName}:`, fromProcess ? `exists (length: ${fromProcess.length})` : "undefined");
    if (fromProcess && fromProcess.length >= 10) {
      return fromProcess;
    }
  }

  // Try fallback key if primary is missing
  if (keyIndex === 0) {
    const fallbackKey = resolveApiKey(env, 1);
    if (fallbackKey) {
      currentKeyIndex = 1;
      return fallbackKey;
    }
  }

  console.log("[AuditX] No valid GROQ_API_KEY found");
  return undefined;
}

// Rotate to the next API key
export function rotateApiKey(): void {
  currentKeyIndex = (currentKeyIndex + 1) % API_KEY_NAMES.length;
  const keyName = API_KEY_NAMES[currentKeyIndex];
  console.log(`[AuditX] Rotating to ${keyName}`);
}

// Get current API key name for logging
export function getCurrentKeyName(): string {
  return API_KEY_NAMES[currentKeyIndex] ?? "unknown";
}

// ── Resolve the model from environment ──────────────────────────────

function resolveModel(): string {
  return (
    process.env["GROQ_MODEL"] ||
    (import.meta.env as Record<string, string | undefined>)["VITE_GROQ_MODEL"] ||
    "openai/gpt-oss-20b"
  );
}

// ── Groq model cascade (reasoning-capable models) ───────────────────────────
// Listed best-first. delegate_agent tries each in order on quota/provider errors.
// Verify availability at https://console.groq.com/docs/models
//
// Note: Only reasoning-capable models support reasoning_content property.
// Non-reasoning models will reject requests with reasoning_content.
//
//  1. openai/gpt-oss-20b — Reasoning-capable, cost-effective
//  2. openai/gpt-oss-120b — Reasoning-capable, larger model
//  3. qwen/qwen3-32b — Reasoning-capable, good for complex tasks
//  4. llama-3.3-70b-versatile — Fallback (non-reasoning, but capable)

export const GROQ_MODELS = [
  "openai/gpt-oss-20b",
  "openai/gpt-oss-120b",
  "qwen/qwen3-32b",
  "llama-3.3-70b-versatile",
] as const;

export type GroqModel = (typeof GROQ_MODELS)[number];

// ── Provider factory ──────────────────────────────────────────────────────────

export function createGroqProvider(apiKey: string) {
  return createGroq({
    apiKey,
  });
}

// ── Resolved model result ─────────────────────────────────────────────────────

export interface ResolvedModel {
  provider: "groq";
  modelId:  GroqModel;
  model:    LanguageModelV1;
  /** Full ordered cascade — the POST handler should try these in order */
  cascade:  Array<{ id: GroqModel; model: LanguageModelV1 }>;
}

// ── resolveAgentModel ─────────────────────────────────────────────────────────
// Returns the primary model immediately — no cold-start probing.
// Returns null only when the API key is genuinely absent/invalid so the
// caller can return a clear 500 to the client.

export async function resolveAgentModel(env?: Record<string, unknown>): Promise<ResolvedModel | null> {
  const apiKey = resolveApiKey(env);

  if (!apiKey) {
    console.warn(
      "[AuditX] GROQ_API_KEY is not set. " +
      "AI features will be disabled. Add it to your .env file for local dev or Vercel environment variables for production.",
    );
    return null;
  }

  const provider = createGroqProvider(apiKey);
  const primaryModel = resolveModel() as GroqModel;
  const cascade = GROQ_MODELS.map((id) => ({ id, model: provider(id) as LanguageModelV1 }));

  return {
    provider: "groq",
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
    msg.includes("credit") ||
    msg.includes("resource_exhausted") ||
    msg.includes("rate limit") ||
    msg.includes("rate-limit") ||
    msg.includes("overloaded") ||
    msg.includes("temporarily unavailable") ||
    msg.includes("upstream error") ||
    msg.includes("provider_unavailable") ||
    msg.includes("requires more credits") ||
    msg.includes("insufficient credits") ||
    msg.includes("credit limit") ||
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
  modelId: GroqModel = GROQ_MODELS[0],
): LanguageModelV1 {
  return createGroqProvider(apiKey)(modelId) as LanguageModelV1;
}

// ── getModelCascade ───────────────────────────────────────────────────────────
// Returns all models as an ordered list for the delegate_agent retry loop.

export function getModelCascade(
  apiKey: string,
): Array<{ id: GroqModel; model: LanguageModelV1 }> {
  const provider = createGroqProvider(apiKey);
  return GROQ_MODELS.map((id) => ({ id, model: provider(id) as LanguageModelV1 }));
}
