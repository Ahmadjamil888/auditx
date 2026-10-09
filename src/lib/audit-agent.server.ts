// ─── AuditX AI Provider ────────────────────────────────────────────────────────
// Server-only. Provider priority: OpenRouter → Lovable AI → Groq.
// Set OPENROUTER_API_KEY (and optionally OPENROUTER_MODEL) in your .env.

import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

export const AI_MODEL = "openai/gpt-6-astra";
const GATEWAY = "https://ai.gateway.lovable.dev/v1";

/** Must be passed to every streamText call that uses the resolved model. */
export const AI_PROVIDER_OPTIONS = {} as const;

export interface ResolvedModel {
  provider: "lovable" | "openrouter" | "groq";
  modelId: string;
  model: LanguageModel;
  cascade: Array<{ id: string; model: LanguageModel }>;
}

function readEnv(name: string, env?: Record<string, unknown>): string | undefined {
  const fromProcess = typeof process !== "undefined" ? process.env?.[name] : undefined;
  const globalEnv = (globalThis as { __VERCEL_ENV__?: Record<string, unknown> }).__VERCEL_ENV__;
  const candidate = fromProcess ?? env?.[name] ?? globalEnv?.[name];
  if (typeof candidate !== "string") return undefined;
  const trimmed = candidate.trim();
  // Reject empty strings and obvious placeholder values
  if (!trimmed || trimmed.startsWith("your-") || trimmed === "changeme" || trimmed === "placeholder") return undefined;
  return trimmed;
}

/**
 * OpenRouter is primary. Falls back to LOVABLE_API_KEY (Lovable Cloud hosting),
 * then GROQ_API_KEY. Set OPENROUTER_API_KEY in your .env to use OpenRouter.
 */
export async function resolveAgentModel(env?: Record<string, unknown>): Promise<ResolvedModel | null> {
  const openRouterKey = readEnv("OPENROUTER_API_KEY", env);
  if (openRouterKey) {
    const modelId = readEnv("OPENROUTER_MODEL", env) ?? "openai/gpt-4o-mini";
    const provider = createOpenAICompatible({
      name: "openrouter",
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: openRouterKey,
      headers: { "HTTP-Referer": readEnv("VITE_APP_URL", env) ?? "https://auditx.app", "X-Title": "AuditX" },
    });
    const model = provider.chatModel(modelId) as LanguageModel;
    return { provider: "openrouter", modelId, model, cascade: [{ id: modelId, model }] };
  }

  const lovableKey = readEnv("LOVABLE_API_KEY", env);
  if (lovableKey) {
    const provider = createOpenAI({
      baseURL: GATEWAY,
      apiKey: lovableKey,
      headers: { "Lovable-API-Key": lovableKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    });
    const model = provider.responses(AI_MODEL) as LanguageModel;
    return { provider: "lovable", modelId: AI_MODEL, model, cascade: [{ id: AI_MODEL, model }] };
  }

  const groqKey = readEnv("GROQ_API_KEY", env);
  if (groqKey) {
    const modelId = readEnv("GROQ_MODEL", env) ?? "llama-3.3-70b-versatile";
    const provider = createOpenAICompatible({
      name: "groq",
      baseURL: "https://api.groq.com/openai/v1",
      apiKey: groqKey,
    });
    const model = provider.chatModel(modelId) as LanguageModel;
    return { provider: "groq", modelId, model, cascade: [{ id: modelId, model }] };
  }

  console.warn("[AuditX] No AI key available: set LOVABLE_API_KEY, OPENROUTER_API_KEY or GROQ_API_KEY.");
  return null;
}

/** Friendly message for gateway failures (credits, rate limit, etc). */
export function describeAiError(e: unknown): { status: number; message: string } {
  const status = (e as { statusCode?: number; status?: number })?.statusCode ?? (e as { status?: number })?.status ?? 500;
  if (status === 402) return { status, message: "AI credits are used up. Add credits in your workspace settings to continue." };
  if (status === 429) return { status, message: "AuditX AI is busy right now. Please try again in a moment." };
  if (status === 403) return { status, message: "AI access is blocked for this workspace." };
  return { status, message: "AuditX AI is temporarily unavailable. Your data was not changed." };
}

export function isProviderError(e: unknown): boolean {
  const s = (e as { statusCode?: number; status?: number })?.statusCode ?? (e as { status?: number })?.status;
  return s === 429 || (typeof s === "number" && s >= 500);
}
export const isQuotaError = isProviderError;
