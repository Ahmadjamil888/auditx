import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export const LOVABLE_MODEL = "google/gemini-2.5-flash";
export const OPENROUTER_MODEL = "google/gemini-2.5-flash";

export function createAuditAgentProvider(apiKey: string) {
  return createOpenAICompatible({
    name: "lovable",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    headers: {
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
  });
}

export function createOpenRouterProvider(apiKey: string) {
  return createOpenAICompatible({
    name: "openrouter",
    baseURL: "https://openrouter.ai/api/v1",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://auditx.app",
      "X-Title": "AuditX",
    },
  });
}

/**
 * Lovable Cloud AI is the primary brain. If its credits are exhausted, the key is
 * blocked, or the gateway is unavailable, we transparently fall back to OpenRouter.
 */
export async function resolveAgentModel() {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const openRouterKey = process.env["OPENROUTER_API_KEY"];

  if (lovableKey) {
    let healthy = true;
    try {
      const probe = await fetch("https://ai.gateway.lovable.dev/v1/models", {
        headers: { "Lovable-API-Key": lovableKey, Authorization: `Bearer ${lovableKey}` },
      });
      // 402 = out of credits, 401/403 = key blocked → fall back when possible.
      if ([401, 402, 403, 429].includes(probe.status)) healthy = false;
    } catch {
      healthy = false;
    }

    if (healthy || !openRouterKey) {
      return {
        provider: "lovable" as const,
        model: createAuditAgentProvider(lovableKey)(LOVABLE_MODEL),
      };
    }
  }

  if (openRouterKey) {
    return {
      provider: "openrouter" as const,
      model: createOpenRouterProvider(openRouterKey)(OPENROUTER_MODEL),
    };
  }

  return null;
}
