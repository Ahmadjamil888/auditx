// ─── OpenRouter client-side helper ───────────────────────────────────────────
// Used by browser-side components (CommandBar, AskWhy, Intelligence, Tax AI).
// Server-side agent uses audit-agent.server.ts instead.
//
// The env var exposed to the browser is VITE_OPENROUTER_API_KEY.
// Free models with strong reasoning and streaming support:
//   Primary  : nvidia/nemotron-3-ultra-550b-a55b:free  (1M context, top free)
//   Fallback : inclusionai/ling-3.0-flash-fin:free     (finance-focused free)
//   Auto     : openrouter/free                         (always works)

const BASE = "https://openrouter.ai/api/v1";

// Free model cascade for client-side streaming
const CLIENT_MODELS = [
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "inclusionai/ling-3.0-flash-fin:free",
  "openrouter/free",
] as const;

type ClientModel = (typeof CLIENT_MODELS)[number];

function getKey(): string {
  return (
    (import.meta.env["VITE_OPENROUTER_API_KEY"] as string | undefined) ?? ""
  );
}

function isKeyMissing(): boolean {
  const k = getKey();
  return !k || k.length < 10;
}

function isQuota(status: number): boolean {
  return status === 429 || status === 503;
}

/** Stream a completion from OpenRouter, yielding text deltas. */
export async function* streamCompletion(opts: {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  model?: ClientModel;
}): AsyncGenerator<string> {
  if (isKeyMissing()) {
    yield "AI is not configured. Add VITE_OPENROUTER_API_KEY to your environment variables.";
    return;
  }

  const key    = getKey();
  const models = opts.model ? [opts.model, ...CLIENT_MODELS.filter(m => m !== opts.model)] : [...CLIENT_MODELS];

  for (const model of models) {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization":  `Bearer ${key}`,
        "Content-Type":   "application/json",
        "HTTP-Referer":   "https://auditx.app",
        "X-Title":        "AuditX",
      },
      body: JSON.stringify({
        model,
        stream: true,
        temperature: opts.temperature ?? 0.3,
        max_tokens:  opts.maxTokens  ?? 1024,
        messages: [
          { role: "system", content: opts.systemPrompt },
          { role: "user",   content: opts.userPrompt   },
        ],
      }),
    });

    if (isQuota(res.status)) {
      console.warn(`[OpenRouter client] Quota on ${model}, trying next…`);
      continue;
    }

    if (!res.ok) {
      const msg = await res.text().catch(() => res.statusText);
      throw new Error(`OpenRouter error ${res.status}: ${msg}`);
    }

    if (!res.body) {
      throw new Error("OpenRouter returned no response body.");
    }

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === "data: [DONE]") continue;
        if (!trimmed.startsWith("data:")) continue;

        try {
          const json    = JSON.parse(trimmed.slice(5).trim());
          const content = json?.choices?.[0]?.delta?.content;
          if (typeof content === "string" && content) yield content;
        } catch {
          // Skip malformed SSE lines
        }
      }
    }
    return; // success — don't try next model
  }

  yield "All free AI models are currently busy. Please try again in a moment.";
}

/** Non-streaming: collect full text. */
export async function complete(opts: {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  model?: ClientModel;
}): Promise<string> {
  let full = "";
  for await (const chunk of streamCompletion(opts)) {
    full += chunk;
  }
  return full;
}

export { isKeyMissing };
