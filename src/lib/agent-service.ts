// ─── AuditX agent service ─────────────────────────────────────────────────────
// UI-agnostic orchestration layer:
//   ChatComposer → AgentRequest → (extraction + streaming AI) → AgentActivity / AIMessage
// Reuses the existing Gemini integration in `ai-service.ts` — no duplicate AI system.

import { GoogleGenAI } from "@google/genai";
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

function getClient(): GoogleGenAI {
  const key = (import.meta.env['VITE_GOOGLE_AI_API_KEY'] as string | undefined) ?? "";
  if (!key || key.length < 10) {
    throw new Error(
      "Google AI API key not configured. Add VITE_GOOGLE_AI_API_KEY to your .env file.",
    );
  }
  return new GoogleGenAI({ apiKey: key });
}

const ANALYST_SYSTEM = `You are AuditX, a financial audit and compliance analyst for retail investors in emerging markets (PSX Pakistan, NSE India).

You are given the user's own uploaded financial documents (or the structured fields extracted from them) plus an instruction. Treat the document as the user's data and apply the instruction to it.

Response rules:
- Write as a professional financial/tax assistant, never as a generic chatbot.
- Use concise markdown: ## / ### headings, short paragraphs, bullet lists, and markdown tables for figures.
- Prefer a structure of: findings → figures table → status → recommended actions (numbered).
- Only state numbers you can support from the provided data; say clearly when information is missing rather than inventing it.
- Never reveal internal deliberation or chain-of-thought; state conclusions and actions only.
- Close with a one-line note that computations are indicative and should be verified before filing.`;

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
    steps.push({ id: "read", label: "Reading uploaded document", status: "pending" });
    steps.push({ id: "extract", label: "Extracting financial records", status: "pending" });
  }
  steps.push({ id: "context", label: "Applying your instruction to the data", status: "pending" });
  steps.push({ id: "analyze", label: "Analysing transactions and tax exposure", status: "pending" });
  steps.push({ id: "compose", label: "Preparing recommended actions", status: "pending" });

  const emit = () => req.onStep(steps.map((s) => ({ ...s })));
  const set = (id: string, status: StepStatus, detail?: string) => {
    const s = steps.find((x) => x.id === id);
    if (s) {
      s.status = status;
      if (detail !== undefined) s.detail = detail;
    }
    emit();
  };

  emit();

  // 1 ─ Real extraction pass over any newly attached documents
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
      // Extraction failure is non-fatal — the raw document still goes to the model.
    }
  }

  // 2 ─ Build the model request
  set("context", "active");

  const parts: Array<Record<string, unknown>> = [];
  for (const a of req.attachments) {
    if (a.base64) parts.push({ inlineData: { data: a.base64, mimeType: a.mimeType } });
    else if (a.text) parts.push({ text: `Document "${a.name}":\n${a.text.slice(0, 12000)}` });
    const summary = fieldsSummary(a);
    if (summary) parts.push({ text: summary });
  }
  parts.push({
    text: `Jurisdiction: ${req.jurisdiction ?? "PSX"}.\n\nUser instruction:\n${req.prompt}`,
  });

  const contents = [
    ...req.history.map((t) => ({
      role: t.role === "user" ? "user" : "model",
      parts: [{ text: t.text }],
    })),
    { role: "user", parts },
  ];

  set("context", "done");
  set("analyze", "active");

  // 3 ─ Stream the analysis
  const ai = getClient();
  const stream = await ai.models.generateContentStream({
    model: "gemini-2.0-flash",
    contents: contents as never,
    config: {
      systemInstruction: ANALYST_SYSTEM,
      temperature: 0.35,
      maxOutputTokens: 2048,
    },
  });

  let full = "";
  let switched = false;
  for await (const chunk of stream) {
    if (req.signal?.aborted) break;
    const t = chunk.text ?? "";
    if (!t) continue;
    full += t;
    if (!switched && full.length > 40) {
      switched = true;
      set("analyze", "done");
      set("compose", "active");
    }
    req.onDelta(full);
  }

  set("analyze", "done");
  set("compose", "done");
  return full;
}
