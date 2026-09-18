// ─── Groq AI Provider Implementation ─────────────────────────────────────────────
//
// Groq provides fast inference with open-source models.
// API: https://console.groq.com/docs
// Base URL: https://api.groq.com/openai/v1
//
// Supported models (as of 2024):
// - llama-3.3-70b-versatile: Fast, general purpose
// - llama-3.1-70b-versatile: Strong reasoning
// - mixtral-8x7b-32768: Good for tool calling
// - gemma2-9b-it: Lightweight, fast

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel as LanguageModelV1 } from "ai";
import type { AIProvider, AIProviderConfig, ResolvedAIModel } from "./provider";

const GROQ_BASE = "https://api.groq.com/openai/v1";

// Groq model cascade - ordered by preference
// Models that support tool calling and are fast for financial analysis
export const GROQ_MODELS = [
  "llama-3.3-70b-versatile",      // Primary: Fast, strong reasoning
  "llama-3.1-70b-versatile",      // Secondary: Good for complex tasks
  "mixtral-8x7b-32768",           // Tertiary: Excellent tool calling
  "gemma2-9b-it",                 // Fallback: Lightweight, very fast
] as const;

export type GroqModel = (typeof GROQ_MODELS)[number];

export class GroqProvider implements AIProvider {
  name = "groq";

  resolveModel(config: AIProviderConfig): ResolvedAIModel {
    const provider = createOpenAICompatible({
      name: "groq",
      baseURL: config.baseURL || GROQ_BASE,
      headers: {
        "Authorization": `Bearer ${config.apiKey}`,
        ...(config.headers || {}),
      },
    });

    const primaryModel = config.model || GROQ_MODELS[0];
    const cascade = GROQ_MODELS.map((id) => ({
      id,
      model: provider(id) as LanguageModelV1,
    }));

    return {
      provider: "groq",
      modelId: primaryModel,
      model: cascade[0]!.model,
      cascade,
    };
  }

  isProviderError(error: unknown): boolean {
    const msg = String((error as Error)?.message ?? "").toLowerCase();
    const code = (error as { code?: number | string })?.code;
    const status = (error as { status?: number })?.status;

    return (
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
      code === 429 ||
      code === 502 ||
      code === 503 ||
      status === 429 ||
      status === 502 ||
      status === 503
    );
  }
}

// Helper to resolve Groq API key from environment
export function resolveGroqApiKey(env?: Record<string, unknown>): string | undefined {
  // Check passed env object (for serverless/Vercel)
  if (env) {
    const fromEnv = env["GROQ_API_KEY"] as string | undefined;
    if (fromEnv && fromEnv.length >= 10) {
      return fromEnv;
    }
  }

  // Check process.env
  const fromProcess = process.env["GROQ_API_KEY"];
  if (fromProcess && fromProcess.length >= 10) {
    return fromProcess;
  }

  // Check import.meta.env (Vite)
  try {
    const fromVite = (import.meta.env as Record<string, string | undefined>)[
      "VITE_GROQ_API_KEY"
    ];
    if (fromVite && fromVite.length >= 10) {
      return fromVite;
    }
  } catch {
    // import.meta.env may not exist in all runtimes
  }

  return undefined;
}

// Helper to resolve Groq model from environment
export function resolveGroqModel(): string {
  return (
    process.env["GROQ_MODEL"] ||
    (import.meta.env as Record<string, string | undefined>)["VITE_GROQ_MODEL"] ||
    GROQ_MODELS[0]
  );
}
