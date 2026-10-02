// ─── AuditX AI Provider — Lovable AI Gateway ──────────────────────────────────
// Server-only. Uses LOVABLE_API_KEY via the OpenAI Responses API.

import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

export const AI_MODEL = "openai/gpt-6-astra";
const GATEWAY = "https://ai.gateway.lovable.dev/v1";

/** Must be passed to every streamText call that uses the resolved model. */
export const AI_PROVIDER_OPTIONS = {
  openai: {
    forceReasoning: true,
    reasoningEffort: "low",
    reasoningSummary: "auto",
    store: false,
    include: ["reasoning.encrypted_content"],
  },
} as const;

export interface ResolvedModel {
  provider: "lovable";
  modelId: string;
  model: LanguageModel;
  cascade: Array<{ id: string; model: LanguageModel }>;
}

function readKey(env?: Record<string, unknown>): string | undefined {
  const fromProcess = typeof process !== "undefined" ? process.env?.["LOVABLE_API_KEY"] : undefined;
  const globalEnv = (globalThis as { __VERCEL_ENV__?: Record<string, unknown> }).__VERCEL_ENV__;
  const candidate = fromProcess ?? env?.["LOVABLE_API_KEY"] ?? globalEnv?.["LOVABLE_API_KEY"];
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : undefined;
}

export async function resolveAgentModel(env?: Record<string, unknown>): Promise<ResolvedModel | null> {
  const apiKey = readKey(env);
  if (!apiKey) {
    console.warn("[AuditX] LOVABLE_API_KEY is not available to the server runtime.");
    return null;
  }
  const provider = createOpenAI({
    baseURL: GATEWAY,
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
  });
  const model = provider.responses(AI_MODEL) as LanguageModel;
  return { provider: "lovable", modelId: AI_MODEL, model, cascade: [{ id: AI_MODEL, model }] };
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
