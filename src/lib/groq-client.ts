// ─── Browser AI helper ─────────────────────────────────────────────────
// Streams text from the server-side Lovable AI endpoint (/api/intelligence).
// No API keys are ever exposed to the browser.

/** Stream a completion, yielding text deltas. */
export async function* streamCompletion(opts: {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  model?: string;
}): AsyncGenerator<string> {
  const res = await fetch("/api/intelligence", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ systemPrompt: opts.systemPrompt, userPrompt: opts.userPrompt }),
  });
  if (!res.ok || !res.body) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(`AI error ${res.status}: ${msg}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    if (chunk) yield chunk;
  }
}

/** Non-streaming: collect full text. */
export async function complete(opts: Parameters<typeof streamCompletion>[0]): Promise<string> {
  let full = "";
  for await (const chunk of streamCompletion(opts)) full += chunk;
  return full;
}

export function isKeyMissing(): boolean {
  return false;
}
