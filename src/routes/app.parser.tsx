import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle, CheckCircle2, ChevronDown,
  Loader2, Paperclip, RefreshCw, Send, StopCircle, Upload, X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Panel, StatusPill } from "@/components/kit";
import { useAuth } from "@/lib/auth-context";
import { GoogleGenAI } from "@google/genai";
import { TOOL_DECLARATIONS, executeTool, type ToolContext, type ToolResult } from "@/lib/agent-tools";
import { parseDocument, parseTextDocument, type ExtractedField } from "@/lib/ai-service";

export const Route = createFileRoute("/app/parser")({
  component: Parser,
});

// ── Types ─────────────────────────────────────────────────────────────────────

interface Attachment {
  id: string; name: string; mimeType: string; base64?: string; text?: string;
}

interface ToolCall {
  id: string; name: string; args: Record<string, unknown>;
  status: "pending" | "confirmed" | "executed" | "rejected";
  result?: ToolResult;
}

interface ChatMessage {
  role: "user" | "ai";
  text: string;
  attachments?: Attachment[];
  streaming?: boolean;
  fields?: ExtractedField[];
  fileName?: string;
  toolCalls?: ToolCall[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function toAttachment(file: File): Promise<Attachment> {
  const isText = file.type.includes("text") || file.type.includes("csv")
    || file.name.endsWith(".csv") || file.name.endsWith(".txt");
  const id = `${file.name}-${Date.now()}`;
  if (isText) return { id, name: file.name, mimeType: "text/plain", text: await file.text() };
  const mimeType = (file.name.endsWith(".xlsx") || file.name.endsWith(".xls"))
    ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    : file.type || "application/pdf";
  return { id, name: file.name, mimeType, base64: await fileToBase64(file) };
}

function getAI(): GoogleGenAI {
  const key = (import.meta.env.VITE_GOOGLE_AI_API_KEY as string | undefined) ?? "";
  if (!key || key.length < 10) throw new Error("VITE_GOOGLE_AI_API_KEY not set in .env");
  return new GoogleGenAI({ apiKey: key });
}

// Strip markdown bold/italic markers from AI text output
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/^#{1,3}\s+/gm, "")
    .replace(/^[-•]\s/gm, "• ")
    .trim();
}

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM = `You are AuditX, a financial audit AI for PSX (Pakistan) and NSE (India) traders.

You have access to tools that let you READ and WRITE the user's actual ledger in Supabase.

RULES:
- Never use **bold** or *italic* markers. Write plain text only.
- Never use ## or ### headings. Just write naturally.
- When given a document, extract fields and call insert_transaction to save them — don't just describe them.
- Before inserting, briefly state what you found: ticker, action, qty, price, fees. Then call the tool.
- When asked about their trades, call get_transactions first, then answer from real data.
- When you spot a fee discrepancy or WHT mismatch, call flag_anomaly to record it.
- Always confirm what tool you called and what happened.
- Be concise. No numbered lists of questions. If you need a value, ask for one specific thing.
- After inserting a transaction, tell the user it's in the ledger and ask what they want to do next.`;

// ── Confidence badge ──────────────────────────────────────────────────────────

function ConfidenceBadge({ score }: { score: number }) {
  const tone = score >= 0.9 ? "ok" : score >= 0.75 ? "warn" : "bad";
  return <StatusPill tone={tone}>{score.toFixed(2)}</StatusPill>;
}

// ── Extracted fields card (collapsible, editable) ─────────────────────────────

function FieldsCard({
  fileName, fields, onPost,
}: { fileName: string; fields: ExtractedField[]; onPost: (edited: Record<string, string>) => void }) {
  const [open, setOpen] = useState(true);
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [posted, setPosted] = useState(false);
  const lowConf = fields.filter((f) => f.confidence < 0.75);

  return (
    <div className="overflow-hidden rounded-2xl bg-white mt-3" style={{ border: "1px solid var(--hairline)" }}>
      <button type="button" onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-4 py-3">
        <span className="truncate text-sm font-semibold">Extracted — {fileName}</span>
        <span className="ml-auto flex items-center gap-2">
          {lowConf.length > 0
            ? <StatusPill tone="warn">{lowConf.length} low confidence</StatusPill>
            : <StatusPill tone="ok">Verified</StatusPill>}
          <ChevronDown size={14} strokeWidth={2} style={{ color: "var(--ink-3)", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
        </span>
      </button>
      {open && (
        <div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr style={{ borderTop: "1px solid var(--hairline)", background: "var(--color-login-bg)" }}>
                  {["Field", "Value", "Confidence"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold" style={{ color: "var(--ink-2)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fields.map((f, i) => (
                  <motion.tr key={f.field} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(i * 0.03, 0.25) }}
                    style={{ borderTop: "1px solid var(--hairline)", background: f.confidence < 0.75 ? "rgba(214,69,69,0.04)" : "transparent" }}>
                    <td className="px-4 py-2.5 text-xs font-medium whitespace-nowrap" style={{ color: "var(--ink-2)" }}>{f.field}</td>
                    <td className="px-4 py-2">
                      <input type="text" value={edited[f.field] ?? f.value}
                        onChange={(e) => setEdited((p) => ({ ...p, [f.field]: e.target.value }))}
                        disabled={posted}
                        className="w-full rounded-lg border bg-transparent px-2 py-1 text-sm outline-none focus:bg-white focus:ring-2"
                        style={{ borderColor: "transparent", ["--tw-ring-color" as string]: "var(--color-accent)" }} />
                    </td>
                    <td className="px-4 py-2.5"><ConfidenceBadge score={f.confidence} /></td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-3 px-4 py-3" style={{ borderTop: "1px solid var(--hairline)" }}>
            {posted ? (
              <span className="inline-flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--ok)" }}>
                <CheckCircle2 size={16} strokeWidth={1.75} /> Posted to ledger
              </span>
            ) : (
              <button type="button" onClick={() => { onPost(edited); setPosted(true); }}
                className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold text-white"
                style={{ background: "var(--color-accent)", boxShadow: "0 4px 24px rgba(115,66,226,0.28)" }}>
                <CheckCircle2 size={14} strokeWidth={2} /> Post to Ledger
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tool confirmation card ────────────────────────────────────────────────────

function ToolCard({ tc, onConfirm, onReject }: {
  tc: ToolCall;
  onConfirm: () => void;
  onReject: () => void;
}) {
  const labels: Record<string, string> = {
    insert_transaction: "Add transaction to ledger",
    update_transaction: "Update transaction",
    flag_anomaly:       "Flag discrepancy",
    resolve_flag:       "Resolve flag",
    get_transactions:   "Read ledger",
    get_ledger_summary: "Read ledger summary",
  };

  const isRead = tc.name === "get_transactions" || tc.name === "get_ledger_summary";

  if (tc.status === "executed") {
    return (
      <div className="mt-2 flex items-center gap-2 rounded-xl px-3 py-2 text-xs"
        style={{ background: "rgba(31,157,99,0.08)", color: "var(--ok)" }}>
        <CheckCircle2 size={13} strokeWidth={2} />
        {labels[tc.name] ?? tc.name} — done
      </div>
    );
  }
  if (tc.status === "confirmed") {
    return (
      <div className="mt-2 flex items-center gap-2 rounded-xl px-3 py-2 text-xs"
        style={{ background: "rgba(115,66,226,0.08)", color: "var(--color-accent)" }}>
        <Loader2 size={13} strokeWidth={2} className="animate-spin" />
        Executing {labels[tc.name] ?? tc.name}...
      </div>
    );
  }
  if (tc.status === "rejected") {
    const error = tc.result?.error;
    return (
      <div className="mt-2 rounded-xl px-3 py-2 text-xs"
        style={{ background: "rgba(214,69,69,0.06)", color: "var(--bad)" }}>
        <div className="flex items-center gap-2">
          <X size={13} strokeWidth={2} />
          <span>Failed — {error || "Operation cancelled"}</span>
        </div>
      </div>
    );
  }
  if (tc.status === "pending" && isRead) {
    // Read tools auto-execute — no confirmation needed
    return null;
  }

  return (
    <div className="mt-2 overflow-hidden rounded-xl" style={{ border: "1px solid var(--hairline)", background: "#fff" }}>
      <div className="flex items-center justify-between px-4 py-2.5"
        style={{ background: "rgba(115,66,226,0.04)", borderBottom: "1px solid var(--hairline)" }}>
        <span className="text-xs font-semibold" style={{ color: "var(--color-accent)" }}>
          Proposed action: {labels[tc.name] ?? tc.name}
        </span>
      </div>
      <pre className="overflow-x-auto px-4 py-3 text-xs" style={{ color: "var(--ink-2)" }}>
        {JSON.stringify(tc.args, null, 2)}
      </pre>
      <div className="flex gap-2 px-4 py-3" style={{ borderTop: "1px solid var(--hairline)" }}>
        <button type="button" onClick={onConfirm}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white"
          style={{ background: "var(--color-accent)" }}>
          <CheckCircle2 size={12} strokeWidth={2} /> Apply
        </button>
        <button type="button" onClick={onReject}
          className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium"
          style={{ borderColor: "var(--hairline)", color: "var(--ink-2)" }}>
          <X size={12} strokeWidth={2} /> Cancel
        </button>
      </div>
    </div>
  );
}

// ── Streaming cursor ──────────────────────────────────────────────────────────

function Cursor() {
  return (
    <motion.span className="inline-block w-0.5 h-3.5 ml-0.5 rounded-full align-middle"
      style={{ background: "var(--color-accent)" }}
      animate={{ opacity: [1, 0, 1] }}
      transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }} />
  );
}

// ── Main Parser component ─────────────────────────────────────────────────────

function Parser() {
  const { profile, user } = useAuth();
  const queryClient = useQueryClient();
  const inputId = "parser-file-input";
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef  = useRef<AbortController | null>(null);
  const [dragging,     setDragging]     = useState(false);
  const [messages,     setMessages]     = useState<ChatMessage[]>([]);
  const [input,        setInput]        = useState("");
  const [attachments,  setAttachments]  = useState<Attachment[]>([]);
  const [busy,         setBusy]         = useState(false);
  const [parseStep,    setParseStep]    = useState<"idle"|"uploading"|"extracting"|"ready"|"error">("idle");
  const [parseFile,    setParseFile]    = useState("");
  const [parseFields,  setParseFields]  = useState<ExtractedField[]>([]);
  const [parseErr,     setParseErr]     = useState("");

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // ── Tool context ────────────────────────────────────────────────────────────
  const toolCtx: ToolContext | null = profile?.org_id ? {
    orgId: profile.org_id,
    userId: user?.id ?? "",
    userEmail: user?.email ?? "user",
    jurisdiction: profile.jurisdiction ?? "PSX",
    invalidate: (keys) => { for (const k of keys) queryClient.invalidateQueries({ queryKey: k }); },
  } : null;

  // ── File handling ───────────────────────────────────────────────────────────
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) await runExtract(file);
    e.target.value = "";
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) runExtract(file);
  }

  // ── Document extraction pipeline ────────────────────────────────────────────
  async function runExtract(file: File) {
    setParseStep("uploading"); setParseFile(file.name);
    setParseFields([]); setParseErr("");
    try {
      setParseStep("extracting");
      const att = await toAttachment(file);
      const result = att.text
        ? await parseTextDocument(att.text, file.name)
        : await parseDocument(att.base64 ?? "", att.mimeType, file.name);
      setParseFields(result.fields);
      setParseStep("ready");
      // Also add the file as an attachment to include in the next chat message
      setAttachments((p) => [...p, att]);
    } catch (err) {
      setParseErr((err as Error).message);
      setParseStep("error");
    }
  }

  // ── Post extracted fields manually ─────────────────────────────────────────
  async function handleManualPost(edited: Record<string, string>) {
    if (!toolCtx) return;
    const get = (name: string) => (edited[name] ?? parseFields.find((f) => f.field === name)?.value ?? "").trim();
    await executeTool("insert_transaction", {
      ticker: get("Ticker Symbol"), action: get("Action"),
      quantity: parseFloat(get("Quantity").replace(/,/g, "")),
      price:    parseFloat(get("Execution Price").replace(/[^\d.]/g, "")),
      fees:     parseFloat(get("Commission / Fees").replace(/[^\d.]/g, "")) || 0,
      wht:      parseFloat(get("WHT").replace(/[^\d.]/g, "")) || 0,
      trade_date: get("Transaction Date"), ref_id: get("Reference ID"),
      broker: get("Broker Name"), exchange: get("Exchange"),
    }, toolCtx);
    queryClient.invalidateQueries({ queryKey: ["transactions", profile?.org_id] });
  }

  // ── Chat submit with tool-calling ───────────────────────────────────────────
  async function submit() {
    if (busy) return;
    const text = input.trim();
    if (!text && attachments.length === 0) return;

    const userMsg: ChatMessage = { role: "user", text, attachments: [...attachments] };
    const history = [...messages];
    setMessages((p) => [...p, userMsg, { role: "ai", text: "", streaming: true }]);
    setInput(""); setAttachments([]); setBusy(true);
    const aiIdx = history.length + 1;
    abortRef.current = new AbortController();

    try {
      const ai = getAI();

      // Build Gemini contents from history + new user turn
      const contents: Array<{ role: "user" | "model"; parts: unknown[] }> = [];
      for (const m of history) {
        if (m.role === "user") {
          const parts: unknown[] = [];
          for (const a of m.attachments ?? []) {
            if (a.base64) parts.push({ inlineData: { data: a.base64, mimeType: a.mimeType } });
            else if (a.text) parts.push({ text: `[Document: ${a.name}]\n${a.text.slice(0, 8000)}` });
          }
          if (m.text) parts.push({ text: m.text });
          if (parts.length) contents.push({ role: "user", parts });
        } else if (m.text) {
          contents.push({ role: "model", parts: [{ text: m.text }] });
        }
      }
      const userParts: unknown[] = [];
      for (const a of userMsg.attachments ?? []) {
        if (a.base64) userParts.push({ inlineData: { data: a.base64, mimeType: a.mimeType } });
        else if (a.text) userParts.push({ text: `[Document: ${a.name}]\n${a.text.slice(0, 8000)}` });
      }
      if (text) userParts.push({ text });
      if (userParts.length) contents.push({ role: "user", parts: userParts });

      const models = ["gemini-2.5-flash", "gemini-2.5-pro"];
      let response: Awaited<ReturnType<typeof ai.models.generateContent>> | null = null;

      for (let mi = 0; mi < models.length; mi++) {
        try {
          response = await ai.models.generateContent({
            model: models[mi]!,
            contents: contents as never,
            config: {
              systemInstruction: SYSTEM,
              temperature: 0.35,
              maxOutputTokens: 2048,
              tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
            } as never,
          });
          break;
        } catch (e) {
          const msg = String((e as Error).message ?? "").toLowerCase();
          const isQ = msg.includes("429") || msg.includes("quota") || msg.includes("resource_exhausted") || msg.includes("not_found") || msg.includes("404");
          if (isQ && mi < models.length - 1) continue;
          throw e;
        }
      }
      if (!response) throw new Error("No AI response.");

      const candidate = response.candidates?.[0];
      const parts = candidate?.content?.parts ?? [];

      // Collect text and function calls from response
      let aiText = "";
      const toolCalls: ToolCall[] = [];

      for (const part of parts) {
        if ("text" in part && part.text) {
          aiText += stripMarkdown(part.text as string);
        }
        if ("functionCall" in part && part.functionCall) {
          const fc = part.functionCall as { name: string; args: Record<string, unknown> };
          toolCalls.push({
            id: `tc-${Date.now()}-${Math.random()}`,
            name: fc.name,
            args: fc.args ?? {},
            status: "pending",
          });
        }
      }

      // Update message with text + pending tool calls
      setMessages((p) => p.map((m, i) =>
        i === aiIdx ? { ...m, text: aiText, streaming: false, toolCalls } : m
      ));

      // Auto-execute read tools immediately; write tools need confirmation
      if (toolCtx) {
        const updated = [...toolCalls];
        for (let ti = 0; ti < updated.length; ti++) {
          const tc = updated[ti]!;
          const isRead = tc.name === "get_transactions" || tc.name === "get_ledger_summary";
          if (isRead) {
            const result = await executeTool(tc.name, tc.args, toolCtx);
            updated[ti] = { ...tc, status: "executed", result };
            // Feed result back into a follow-up AI call
            if (result.ok && result.data) {
              const followUp = await ai.models.generateContent({
                model: models[0]!,
                contents: [
                  ...contents,
                  { role: "model", parts: [{ text: aiText || "I queried the ledger." }] },
                  { role: "user", parts: [{ text: `Tool ${tc.name} returned: ${JSON.stringify(result.data, null, 2)}. Summarise what you found for the user in plain text, no bold or markdown.` }] },
                ] as never,
                config: { systemInstruction: SYSTEM, temperature: 0.3, maxOutputTokens: 1024 } as never,
              });
              const followText = stripMarkdown(followUp.candidates?.[0]?.content?.parts?.find((p: unknown) => "text" in (p as object))?.["text"] as string ?? "");
              if (followText) {
                setMessages((p) => p.map((m, i) =>
                  i === aiIdx ? { ...m, text: (m.text ? m.text + "\n\n" : "") + followText, toolCalls: updated } : m
                ));
              }
            }
          }
        }
        setMessages((p) => p.map((m, i) => i === aiIdx ? { ...m, toolCalls: updated } : m));
      }

    } catch (e) {
      const error = e as Error;
      const errMsg = error.message ?? "Something went wrong.";
      console.error("[AuditX Parser] Error:", error);
      setMessages((p) => p.map((m, i) => i === aiIdx ? { 
        ...m, 
        text: `⚠ Error: ${errMsg}${error.stack ? `\n\nDetails: ${error.stack.slice(0, 200)}` : ''}`, 
        streaming: false 
      } : m));
    } finally {
      setBusy(false); abortRef.current = null;
    }
  }

  // ── Tool confirm / reject ───────────────────────────────────────────────────
  async function confirmTool(msgIdx: number, tcIdx: number) {
    if (!toolCtx) {
      console.error("Tool context not available - user profile missing");
      return;
    }
    const msg = messages[msgIdx];
    if (!msg || msg.role !== "ai" || !msg.toolCalls) return;
    const tc = msg.toolCalls[tcIdx];
    if (!tc) return;

    // Set to executing state first
    setMessages((p) => p.map((m, i) => {
      if (i !== msgIdx || m.role !== "ai") return m;
      const tcs = (m.toolCalls ?? []).map((t, j) =>
        j === tcIdx ? { ...t, status: "confirmed" as const } : t
      );
      return { ...m, toolCalls: tcs };
    }));

    try {
      const result = await executeTool(tc.name, tc.args, toolCtx);
      
      if (!result.ok) {
        throw new Error(result.error || "Tool execution failed");
      }

      setMessages((p) => p.map((m, i) => {
        if (i !== msgIdx || m.role !== "ai") return m;
        const tcs = (m.toolCalls ?? []).map((t, j) =>
          j === tcIdx ? { ...t, status: "executed" as const, result } : t
        );
        return { ...m, toolCalls: tcs };
      }));

      // Invalidate relevant queries based on tool type
      if (tc.name === "insert_transaction" || tc.name === "update_transaction") {
        queryClient.invalidateQueries({ queryKey: ["transactions", profile?.org_id] });
      }
      if (tc.name === "flag_anomaly" || tc.name === "resolve_flag") {
        queryClient.invalidateQueries({ queryKey: ["reconciliation_flags", profile?.org_id] });
      }
    } catch (error) {
      console.error("Tool execution error:", error);
      setMessages((p) => p.map((m, i) => {
        if (i !== msgIdx || m.role !== "ai") return m;
        const tcs = (m.toolCalls ?? []).map((t, j) =>
          j === tcIdx ? { 
            ...t, 
            status: "rejected" as const, 
            result: { ok: false, error: (error as Error).message } 
          } : t
        );
        return { ...m, toolCalls: tcs };
      }));
    }
  }

  function rejectTool(msgIdx: number, tcIdx: number) {
    setMessages((p) => p.map((m, i) => {
      if (i !== msgIdx || m.role !== "ai") return m;
      const tcs = (m.toolCalls ?? []).map((t, j) =>
        j === tcIdx ? { ...t, status: "rejected" as const } : t
      );
      return { ...m, toolCalls: tcs };
    }));
  }

  function stop() {
    abortRef.current?.abort(); setBusy(false);
    setMessages((p) => p.map((m, i) => i === p.length - 1 && m.role === "ai" ? { ...m, streaming: false } : m));
  }
  function clearChat() {
    if (busy) stop();
    setMessages([]); setInput(""); setAttachments([]);
    setParseStep("idle"); setParseFields([]); setParseErr("");
  }

  const apiKeyMissing = !import.meta.env.VITE_GOOGLE_AI_API_KEY;
  const isEmpty = messages.length === 0;

  return (
    <div className="flex h-[calc(100dvh-56px)]" style={{ background: "var(--color-login-bg)" }}>

      {/* ── Left: upload + extraction ──────────────────────────────────────── */}
      <div className="hidden w-80 shrink-0 flex-col border-r lg:flex" style={{ borderColor: "var(--hairline)", background: "#fff" }}>
        <div className="border-b px-4 py-3" style={{ borderColor: "var(--hairline)" }}>
          <p className="text-sm font-semibold">Statement Parser</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--ink-3)" }}>Upload a document to extract fields</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {apiKeyMissing && (
            <div className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs"
              style={{ background: "rgba(201,138,26,0.08)", border: "1px solid rgba(201,138,26,0.2)", color: "var(--ink-2)" }}>
              <AlertCircle size={13} strokeWidth={1.75} style={{ color: "var(--warn)", flexShrink: 0, marginTop: 1 }} />
              VITE_GOOGLE_AI_API_KEY not set in .env
            </div>
          )}

          {/* Hidden input */}
          <input id={inputId} type="file" className="sr-only"
            accept=".pdf,.png,.jpg,.jpeg,.csv,.xlsx,.xls,.txt"
            disabled={parseStep === "uploading" || parseStep === "extracting"}
            onChange={handleFileChange} />

          {/* Drop zone */}
          <label htmlFor={inputId}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed p-6 text-center cursor-pointer transition-colors"
            style={{
              borderColor: dragging ? "var(--color-accent)" : "rgba(25,40,55,0.15)",
              background: dragging ? "rgba(115,66,226,0.04)" : "var(--color-login-bg)",
              opacity: (parseStep === "uploading" || parseStep === "extracting") ? 0.6 : 1,
              pointerEvents: (parseStep === "uploading" || parseStep === "extracting") ? "none" : "auto",
            }}>
            <div className="flex size-11 items-center justify-center rounded-xl" style={{ background: "rgba(115,66,226,0.1)" }}>
              <Upload size={22} strokeWidth={1.75} style={{ color: "var(--color-accent)" }} />
            </div>
            <div>
              <p className="text-xs font-semibold">Click to upload or drag & drop</p>
              <p className="mt-0.5 text-xs" style={{ color: "var(--ink-3)" }}>PDF · PNG · JPG · CSV · XLSX</p>
            </div>
          </label>

          {/* Progress */}
          {parseStep !== "idle" && (
            <Panel>
              <div className="flex items-center justify-between">
                <p className="truncate text-xs font-medium pr-2">{parseFile}</p>
                {parseStep === "error"     && <AlertCircle  size={14} style={{ color: "var(--bad)",  flexShrink: 0 }} />}
                {parseStep === "ready"     && <CheckCircle2 size={14} style={{ color: "var(--ok)",   flexShrink: 0 }} />}
                {(parseStep === "uploading" || parseStep === "extracting") && (
                  <Loader2 size={14} className="animate-spin shrink-0" style={{ color: "var(--color-accent)" }} />
                )}
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full" style={{ background: "var(--color-login-bg)" }}>
                <motion.div className="h-full rounded-full"
                  style={{ background: parseStep === "error" ? "var(--bad)" : parseStep === "ready" ? "var(--ok)" : "var(--color-accent)" }}
                  animate={{ width: parseStep === "error" ? "100%" : parseStep === "ready" ? "100%" : parseStep === "extracting" ? "65%" : "25%" }}
                  transition={{ duration: 0.5 }} />
              </div>
              {parseStep === "extracting" && <p className="mt-1.5 text-xs" style={{ color: "var(--ink-3)" }}>Gemini AI extracting fields…</p>}
              {parseStep === "error" && <p className="mt-1.5 text-xs" style={{ color: "var(--bad)" }}>{parseErr}</p>}
              {parseStep === "error" && (
                <button type="button" onClick={() => setParseStep("idle")}
                  className="mt-2 flex items-center gap-1 text-xs font-medium" style={{ color: "var(--color-accent)" }}>
                  <RefreshCw size={11} strokeWidth={2} /> Try again
                </button>
              )}
            </Panel>
          )}

          {/* Extracted fields */}
          {parseStep === "ready" && parseFields.length > 0 && (
            <FieldsCard fileName={parseFile} fields={parseFields} onPost={handleManualPost} />
          )}
        </div>
      </div>

      {/* ── Right: chat ────────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col">
        {/* Chat header */}
        <div className="flex items-center justify-between border-b px-5 py-3" style={{ borderColor: "var(--hairline)", background: "#fff" }}>
          <p className="text-sm font-semibold">AI Agent</p>
          <div className="flex items-center gap-2">
            {!toolCtx && (
              <span className="rounded-full px-2.5 py-1 text-xs" style={{ background: "rgba(201,138,26,0.1)", color: "var(--warn)" }}>
                Profile loading…
              </span>
            )}
            {messages.length > 0 && (
              <button type="button" onClick={clearChat}
                className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium"
                style={{ borderColor: "var(--hairline)", color: "var(--ink-2)" }}>
                <X size={11} strokeWidth={2} /> New chat
              </button>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          {isEmpty && (
            <div className="mx-auto flex max-w-lg flex-col items-center gap-4 pt-16 text-center">
              <p className="text-base font-semibold">Ask me anything about your trades</p>
              <p className="text-sm" style={{ color: "var(--ink-2)" }}>
                Upload a document on the left, or type a question. I can read and update your ledger directly.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {["Show me my recent transactions", "Any fee discrepancies in my ledger?", "What's my PSX CGT this year?", "Flag anything that needs review"].map((s) => (
                  <button key={s} type="button" onClick={() => setInput(s)}
                    className="rounded-full border bg-white px-3.5 py-2 text-xs font-medium transition-shadow hover:shadow-md"
                    style={{ borderColor: "var(--hairline)" }}>{s}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mx-auto max-w-2xl space-y-5">
            <AnimatePresence initial={false}>
              {messages.map((msg, mi) => (
                <motion.div key={mi} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                  {msg.role === "user" ? (
                    <div className="flex justify-end">
                      <div className="max-w-[80%] space-y-1.5">
                        {msg.attachments?.map((a) => (
                          <div key={a.id} className="flex justify-end">
                            <span className="inline-flex items-center gap-1.5 rounded-xl border bg-white px-2.5 py-1.5 text-xs"
                              style={{ borderColor: "var(--hairline)" }}>
                              <Paperclip size={11} strokeWidth={1.75} style={{ color: "var(--color-accent)" }} />
                              {a.name}
                            </span>
                          </div>
                        ))}
                        {msg.text && (
                          <div className="rounded-2xl rounded-tr-sm px-4 py-3 text-sm text-white"
                            style={{ background: "var(--color-accent)" }}>{msg.text}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {msg.text ? (
                        <p className="whitespace-pre-wrap text-sm leading-relaxed" style={{ color: "var(--color-text)" }}>
                          {msg.text}{msg.streaming && <Cursor />}
                        </p>
                      ) : msg.streaming ? (
                        <Cursor />
                      ) : null}
                      {msg.toolCalls?.map((tc, ti) => (
                        <ToolCard key={tc.id} tc={tc}
                          onConfirm={() => confirmTool(mi, ti)}
                          onReject={() => rejectTool(mi, ti)} />
                      ))}
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
            <div ref={bottomRef} />
          </div>
        </div>

        {/* Composer */}
        <div className="border-t px-4 py-3 sm:px-6" style={{ borderColor: "var(--hairline)", background: "#fff" }}>
          <div className="mx-auto max-w-2xl">
            {attachments.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {attachments.map((a) => (
                  <span key={a.id} className="inline-flex items-center gap-1.5 rounded-xl border bg-white px-2.5 py-1.5 text-xs"
                    style={{ borderColor: "var(--hairline)" }}>
                    <Paperclip size={11} strokeWidth={1.75} style={{ color: "var(--color-accent)" }} />
                    <span className="max-w-[110px] truncate">{a.name}</span>
                    <button type="button" onClick={() => setAttachments((p) => p.filter((x) => x.id !== a.id))}
                      style={{ color: "var(--ink-3)" }}><X size={11} strokeWidth={2} /></button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-end gap-2 rounded-2xl px-3 py-2 transition-shadow focus-within:shadow-md"
              style={{ border: "1px solid var(--hairline)", background: "var(--color-login-bg)" }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const file = e.dataTransfer.files[0]; if (file) runExtract(file); }}>
              <label htmlFor={inputId} className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-xl hover:bg-black/5">
                <Paperclip size={16} strokeWidth={1.75} style={{ color: "var(--ink-2)" }} />
              </label>
              <textarea rows={1} value={input} disabled={busy}
                onChange={(e) => { setInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`; }}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (!busy) submit(); } }}
                placeholder="Ask about your trades, tax, or upload a document…"
                className="flex-1 resize-none bg-transparent py-1.5 text-sm outline-none"
                style={{ minHeight: 34, maxHeight: 140, color: "var(--color-text)" }} />
              {busy ? (
                <button type="button" onClick={stop} className="flex size-8 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: "var(--bad)" }}>
                  <StopCircle size={15} strokeWidth={1.75} />
                </button>
              ) : (
                <button type="button" onClick={submit} disabled={!input.trim() && attachments.length === 0}
                  className="flex size-8 shrink-0 items-center justify-center rounded-xl text-white disabled:opacity-30"
                  style={{ background: "var(--color-accent)" }}>
                  <Send size={14} strokeWidth={2} />
                </button>
              )}
            </div>
            <p className="mt-1.5 text-center text-xs" style={{ color: "var(--ink-3)" }}>
              Enter to send · Shift+Enter for new line · AI can read and write your ledger
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
