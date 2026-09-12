// ─── AuditX agent service ─────────────────────────────────────────────────────
// UI-agnostic orchestration layer:
//   ChatComposer → AgentRequest → (extraction + streaming AI) → AgentActivity / AIMessage
// Model cascade: nvidia/nemotron-3-ultra-550b-a55b:free → inclusionai/ling-3.0-flash-fin:free → openrouter/free

// @ts-nocheck
import { parseDocument, parseTextDocument, type ExtractedField } from "@/lib/ai-service";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AgentAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  /** base64 payload for binary docs (pdf / image / xlsx) */
  base64?: string;
  /** plain text payload for csv / txt / sample slips */
  text?: string;
  /** fields extracted by the parser, once available */
  fields?: ExtractedField[];
}

export type StepStatus = "pending" | "active" | "done" | "error";

export interface AgentStep {
  id: string;
  label: string;
  status: StepStatus;
  detail?: string;
}

export interface AgentTurn {
  role: "user" | "assistant";
  text: string;
}

export interface AgentRequest {
  prompt: string;
  attachments: AgentAttachment[];
  history: AgentTurn[];
  jurisdiction?: string;
  onStep: (steps: AgentStep[]) => void;
  onDelta: (fullText: string) => void;
  onFields?: (attachmentId: string, fields: ExtractedField[]) => void;
  signal?: AbortSignal;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function isTextFile(file: File): boolean {
  return (
    file.type.includes("text") ||
    file.type.includes("csv") ||
    file.name.endsWith(".csv") ||
    file.name.endsWith(".txt")
  );
}

export function isXlsxFile(file: File): boolean {
  return (
    file.type.includes("spreadsheet") ||
    file.type.includes("excel") ||
    file.name.endsWith(".xlsx") ||
    file.name.endsWith(".xls")
  );
}

export async function fileToAttachment(file: File): Promise<AgentAttachment> {
  const base: Omit<AgentAttachment, "base64" | "text"> = {
    id: `${file.name}-${file.size}-${Date.now()}`,
    name: file.name,
    mimeType: isXlsxFile(file)
      ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      : file.type || "application/pdf",
    size: file.size,
  };
  if (isTextFile(file)) return { ...base, mimeType: "text/plain", text: await file.text() };
  return { ...base, base64: await fileToBase64(file) };
}

export function textToAttachment(name: string, text: string): AgentAttachment {
  return {
    id: `${name}-${Date.now()}`,
    name,
    mimeType: "text/plain",
    size: text.length,
    text,
  };
}

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

function getApiKey(): string {
  const key = (import.meta.env["VITE_OPENROUTER_API_KEY"] as string | undefined) ?? "";
  if (!key || key.length < 10) {
    throw new Error(
      "AuditX Intelligence: AI API key not configured. Add VITE_OPENROUTER_API_KEY to your .env file.",
    );
  }
  return key;
}


// ── Streaming cascade: primary → fallback ─────────────────────────────────────

const STREAM_MODELS = [
  "deepseek/deepseek-r1-0528:free",
  "deepseek/deepseek-chat-v3-0324:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "mistralai/mistral-7b-instruct:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "inclusionai/ling-3.0-flash-fin:free",
  "openrouter/free",
] as const;

async function streamWithCascade(
  contents: Array<{ role: string; parts: Array<{ text?: string }> }>,
  config: { systemInstruction?: string; temperature?: number; maxOutputTokens?: number },
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const key = getApiKey();

  // Build OpenAI-compatible messages array
  const messages: Array<{ role: string; content: string }> = [];
  if (config.systemInstruction) {
    messages.push({ role: "system", content: config.systemInstruction });
  }
  for (const turn of contents) {
    const text = turn.parts.map((p) => p.text ?? "").join("\n");
    messages.push({ role: turn.role === "model" ? "assistant" : turn.role, content: text });
  }

  for (let i = 0; i < STREAM_MODELS.length; i++) {
    const model = STREAM_MODELS[i]!;
    try {
      const resp = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://auditx.app",
          "X-Title": "AuditX",
        },
        body: JSON.stringify({
          model,
          messages,
          stream: true,
          temperature: config.temperature ?? 0.35,
          max_tokens: config.maxOutputTokens ?? 2048,
        }),
        signal,
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => resp.statusText);
        const err = new Error(`OpenRouter ${resp.status}: ${errText}`);
        if ((resp.status === 429 || resp.status === 502 || resp.status === 503) && i < STREAM_MODELS.length - 1) {
          console.warn(`[AuditX agent] Provider error ${resp.status} on ${model}, trying ${STREAM_MODELS[i + 1]}…`);
          continue;
        }
        throw err;
      }

      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let full = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          const trimmed = line.replace(/^data: /, "").trim();
          if (!trimmed || trimmed === "[DONE]") continue;
          try {
            const parsed = JSON.parse(trimmed);
            const delta = parsed.choices?.[0]?.delta?.content ?? "";
            if (delta) {
              full += delta;
              onDelta(full);
            }
          } catch {
            // skip malformed SSE lines
          }
        }
      }

      return full;
    } catch (e) {
      const msg = String((e as Error)?.message ?? "").toLowerCase();
      const isQuota = msg.includes("429") || msg.includes("502") || msg.includes("503") || msg.includes("quota") || msg.includes("rate limit") || msg.includes("rate-limit") || msg.includes("overloaded") || msg.includes("upstream error") || msg.includes("provider_unavailable");
      if (isQuota && i < STREAM_MODELS.length - 1) {
        console.warn(`[AuditX agent] Quota on ${model}, trying ${STREAM_MODELS[i + 1]}…`);
        continue;
      }
      throw e;
    }
  }
  throw new Error("All AI models quota-exhausted. Please wait a minute and try again.");
}

// ── Analyst system prompt ─────────────────────────────────────────────────────

const ANALYST_SYSTEM = `You are AuditX, a financial audit and compliance analyst for retail investors in PSX (Pakistan) and NSE (India) markets.

You receive the user's own uploaded financial documents (or structured fields extracted from them) plus an instruction. Apply the instruction to their data.

Response rules:
- Write as a professional financial/tax assistant, never as a generic chatbot.
- Use concise markdown: ## / ### headings, short paragraphs, bullet lists, and markdown tables for figures.
- Structure: findings → figures table → status → recommended actions (numbered).
- Only state numbers you can support from the provided data. Say clearly when information is missing rather than guessing.
- Never reveal internal chain-of-thought; state conclusions and actions only.
- Close with a one-line note that computations are indicative and should be verified before filing.

DUMMY DATA GENERATION:
- If the user explicitly asks for dummy/random/sample data with no specific parameters, you are permitted to generate plausible synthetic values yourself.
- When generating dummy data, create realistic values: reasonable tickers (e.g., OGDC, TCS, TRG for PSX; RELIANCE, TCS, INFY for NSE), realistic actions (BUY/SELL/DIV), reasonable quantities (10-1000 shares), realistic prices based on the market, and recent dates.
- Clearly label any synthetic/dummy data as "SAMPLE DATA" or "DEMO DATA" in your response.
- Propose dummy transactions the same way you would propose real transactions - with clear field values and confidence levels.
- Do not refuse to generate dummy data when explicitly requested - this is a demo/testing feature.`;

function fieldsSummary(a: AgentAttachment): string {
  if (!a.fields?.length) return "";
  const rows = a.fields
    .filter((f) => f.value && f.value !== "null")
    .map((f) => `- ${f.field}: ${f.value} (confidence ${f.confidence.toFixed(2)})`)
    .join("\n");
  return rows ? `Structured fields extracted from ${a.name}:\n${rows}` : "";
}

// ── Main orchestration ────────────────────────────────────────────────────────

export async function runAgent(req: AgentRequest): Promise<string> {
  const hasNew = req.attachments.some((a) => !a.fields);
  const steps: AgentStep[] = [];

  if (hasNew) {
    steps.push({ id: "read",    label: "Reading uploaded document",          status: "pending" });
    steps.push({ id: "extract", label: "Extracting financial records",        status: "pending" });
  }
  steps.push({ id: "context", label: "Applying your instruction to the data", status: "pending" });
  steps.push({ id: "analyze", label: "Analysing transactions and tax exposure", status: "pending" });
  steps.push({ id: "compose", label: "Preparing recommended actions",          status: "pending" });

  const emit = () => req.onStep(steps.map((s) => ({ ...s })));
  const set = (id: string, status: StepStatus, detail?: string) => {
    const s = steps.find((x) => x.id === id);
    if (s) { s.status = status; if (detail !== undefined) s.detail = detail; }
    emit();
  };
  emit();

  // ── Step 1: extract fields from any new attachments ───────────────────────
  if (hasNew) {
    set("read", "active");
    try {
      for (const a of req.attachments) {
        if (a.fields) continue;
        set("read", "done", req.attachments.map((x) => x.name).join(", "));
        set("extract", "active", a.name);
        const parsed = a.text
          ? await parseTextDocument(a.text, a.name)
          : await parseDocument(a.base64 ?? "", a.mimeType, a.name);
        a.fields = parsed.fields;
        req.onFields?.(a.id, parsed.fields);
      }
      set("read", "done");
      set("extract", "done");
    } catch (e) {
      set("read", "done");
      set("extract", "error", (e as Error).message);
      // Non-fatal — raw document still sent to model below
    }
  }

  // ── Step 2: build model context ───────────────────────────────────────────
  set("context", "active");

  const parts: Array<Record<string, unknown>> = [];
  for (const a of req.attachments) {
    if (a.base64) parts.push({ inlineData: { data: a.base64, mimeType: a.mimeType } });
    else if (a.text) parts.push({ text: `Document "${a.name}":\n${a.text.slice(0, 12000)}` });
    const summary = fieldsSummary(a);
    if (summary) parts.push({ text: summary });
  }
  parts.push({ text: `Jurisdiction: ${req.jurisdiction ?? "PSX"}.\n\nUser instruction:\n${req.prompt}` });

  const contents = [
    ...req.history.map((t) => ({
      role: t.role === "user" ? "user" : "model",
      parts: [{ text: t.text }],
    })),
    { role: "user", parts },
  ];

  set("context", "done");
  set("analyze", "active");

  // ── Step 3: stream with model cascade ─────────────────────────────────────
  let full = "";
  let composing = false;

  full = await streamWithCascade(
    contents as Array<{ role: string; parts: Array<{ text?: string }> }>,
    {
      systemInstruction: ANALYST_SYSTEM,
      temperature: 0.35,
      maxOutputTokens: 2048,
    },
    (text) => {
      if (!composing && text.length > 40) {
        composing = true;
        set("analyze", "done");
        set("compose", "active");
      }
      req.onDelta(text);
    },
    req.signal,
  );

  set("analyze", "done");
  set("compose", "done");
  return full;
}
