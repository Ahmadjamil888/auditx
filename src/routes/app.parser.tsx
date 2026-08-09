import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, FileSearch, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AgentActivity } from "@/components/agent/AgentActivity";
import { AIMessage } from "@/components/agent/AIMessage";
import { AttachmentChip, ChatComposer } from "@/components/agent/ChatComposer";
import { ExtractedFieldsCard } from "@/components/agent/ExtractedFieldsCard";
import { Logo } from "@/components/brand/Logo";
import {
  fileToAttachment,
  runAgent,
  textToAttachment,
  type AgentAttachment,
  type AgentStep,
} from "@/lib/agent-service";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/app/parser")({
  component: ParserWorkspace,
  head: () => ({
    meta: [
      { title: "AI Audit Workspace · AuditX" },
      {
        name: "description",
        content:
          "Upload broker slips, contract notes or dividend vouchers and ask AuditX to extract, reconcile and compute tax on your trades.",
      },
      { property: "og:title", content: "AI Audit Workspace · AuditX" },
      {
        property: "og:description",
        content: "Chat with an AI audit agent over your own broker documents.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

// ── Sample slips (kept as one-click context) ─────────────────────────────────

const SAMPLE_SLIPS = [
  {
    label: "PSX Broker Slip",
    desc: "Meridian Capital · OGDC BUY",
    text: `MERIDIAN CAPITAL (PVT) LTD
TRADE CONFIRMATION
Date: 28-Aug-2025
Ref: PSX-8821-K

TRANSACTION DETAILS:
Symbol: OGDC
Action: BUY
Quantity: 500 shares
Rate: PKR 104.50 per share
Gross Value: PKR 52,250.00

CHARGES:
Brokerage: PKR 1,044.00 (2%)
CDC Charges: PKR 150.00
SECP Levy: PKR 130.63
Total Fees: PKR 1,324.63

Settlement Date: 30-Aug-2025
Exchange: PSX`,
  },
  {
    label: "NSE Contract Note",
    desc: "Nifty Desk · TCS SELL",
    text: `NIFTY DESK SECURITIES LTD
CONTRACT NOTE
Date: 28/08/2025
Order Ref: NSE-55421

TRADE DETAILS:
Scrip: TCS
Exchange: NSE
Trade Type: SELL
Qty: 25
Rate: INR 4,280.00
Gross: INR 1,07,000.00

DEDUCTIONS:
Brokerage: INR 535.00
STT: INR 107.00
Total Charges: INR 751.30

Net Receivable: INR 1,06,248.70`,
  },
  {
    label: "Dividend Voucher",
    desc: "MCB Bank · Dividend",
    text: `MCB BANK LIMITED
DIVIDEND PAYMENT ADVICE
FY 2025 — Final Dividend

Shares Held: 1,000
Dividend Rate: PKR 4.50 per share
Gross Dividend: PKR 4,500.00
WHT Deducted (10% Filer): PKR 450.00
Net Amount: PKR 4,050.00

Payment Date: 25-Aug-2025
Exchange: PSX`,
  },
];

const SUGGESTIONS = [
  "Extract every field and flag anything low-confidence",
  "Compute my capital gains tax on this trade",
  "Reconcile this slip against my ledger",
  "Summarise the fees and withholding deducted",
];

// ── Message model ─────────────────────────────────────────────────────────────

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  attachments: AgentAttachment[];
  steps: AgentStep[];
  running: boolean;
  error?: string;
};

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ── Component ─────────────────────────────────────────────────────────────────

function ParserWorkspace() {
  const { profile } = useAuth();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState<AgentAttachment[]>([]);
  const [context, setContext] = useState<AgentAttachment[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const started = messages.length > 0;
  const apiKeyMissing = !import.meta.env["VITE_GOOGLE_AI_API_KEY"];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function handleAddFiles(files: FileList | null) {
    if (!files?.length) return;
    const added = await Promise.all(Array.from(files).map(fileToAttachment));
    setPending((p) => [...p, ...added]);
  }

  function addSample(label: string, text: string) {
    setPending((p) => [...p, textToAttachment(`${label}.txt`, text)]);
  }

  function patch(id: string, next: Partial<ChatMessage>) {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...next } : m)));
  }

  async function submit(overridePrompt?: string) {
    const prompt = (overridePrompt ?? input).trim();
    const newAttachments = pending;
    if (busy || (!prompt && newAttachments.length === 0)) return;

    const promptText =
      prompt ||
      "Extract every field from the attached document, flag anything low-confidence, and tell me what to do next.";

    const userMsg: ChatMessage = {
      id: uid(),
      role: "user",
      text: promptText,
      attachments: newAttachments,
      steps: [],
      running: false,
    };
    const aiId = uid();
    const aiMsg: ChatMessage = {
      id: aiId,
      role: "assistant",
      text: "",
      attachments: newAttachments,
      steps: [],
      running: true,
    };

    const history = messages
      .filter((m) => m.text)
      .map((m) => ({ role: m.role, text: m.text }));

    setMessages((prev) => [...prev, userMsg, aiMsg]);
    setInput("");
    setPending([]);
    setBusy(true);

    const attachmentsForRun = [...context, ...newAttachments];

    try {
      await runAgent({
        prompt: promptText,
        attachments: attachmentsForRun,
        history,
        jurisdiction: profile?.jurisdiction ?? "PSX",
        onStep: (steps) => patch(aiId, { steps }),
        onDelta: (full) => patch(aiId, { text: full }),
        onFields: (attachmentId, fields) => {
          setMessages((prev) =>
            prev.map((m) => ({
              ...m,
              attachments: m.attachments.map((a) =>
                a.id === attachmentId ? { ...a, fields } : a,
              ),
            })),
          );
        },
      });
      patch(aiId, { running: false });
    } catch (e) {
      patch(aiId, { running: false, error: (e as Error).message });
    } finally {
      setContext(attachmentsForRun);
      setBusy(false);
    }
  }

  function resetChat() {
    setMessages([]);
    setContext([]);
    setPending([]);
    setInput("");
  }

  const composer = (
    <ChatComposer
      value={input}
      onChange={setInput}
      onSubmit={() => void submit()}
      attachments={pending}
      onAddFiles={(f) => void handleAddFiles(f)}
      onRemoveAttachment={(id) => setPending((p) => p.filter((a) => a.id !== id))}
      busy={busy}
      disabled={apiKeyMissing}
      placeholder={
        started
          ? "Ask a follow-up, or attach another document…"
          : "Upload a broker slip and ask AuditX anything about it…"
      }
    />
  );

  return (
    <div className="flex h-full flex-col">
      {/* Transcript */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
          {!started ? (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="flex min-h-[60vh] flex-col justify-center"
            >
              <div className="mb-6 text-center">
                <div className="mb-4 flex justify-center">
                  <Logo />
                </div>
                <h1
                  style={{ fontFamily: "var(--font-heading)", fontSize: "clamp(1.5rem,4vw,2rem)" }}
                >
                  What should I audit today?
                </h1>
                <p className="mx-auto mt-2 max-w-md text-sm" style={{ color: "var(--ink-2)" }}>
                  Attach a broker slip, contract note, dividend voucher, CSV or XLSX — then ask for
                  extraction, reconciliation or a tax computation.
                </p>
              </div>

              {apiKeyMissing && (
                <div
                  className="mb-4 flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm"
                  style={{ background: "rgba(201,138,26,0.08)", border: "1px solid rgba(201,138,26,0.2)" }}
                >
                  <AlertCircle
                    size={15}
                    strokeWidth={1.75}
                    style={{ color: "var(--warn)", flexShrink: 0, marginTop: 1 }}
                  />
                  <span style={{ color: "var(--ink-2)" }}>
                    <strong>VITE_GOOGLE_AI_API_KEY</strong> is not set. Add it to <code>.env</code>{" "}
                    to enable the AI agent.{" "}
                    <a
                      href="https://aistudio.google.com/app/apikey"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "var(--color-accent)" }}
                    >
                      Get a free key →
                    </a>
                  </span>
                </div>
              )}

              {composer}

              <div className="mt-4 flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void submit(s)}
                    disabled={apiKeyMissing}
                    className="rounded-full border bg-white px-3.5 py-1.5 text-xs transition-shadow hover:shadow-md disabled:opacity-50"
                    style={{ borderColor: "var(--hairline)", color: "var(--ink-2)" }}
                  >
                    {s}
                  </button>
                ))}
              </div>

              <div className="mt-6">
                <p
                  className="mb-2 text-xs font-semibold tracking-wide uppercase"
                  style={{ color: "var(--ink-3)" }}
                >
                  Or attach a sample slip
                </p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {SAMPLE_SLIPS.map((s) => (
                    <button
                      key={s.label}
                      type="button"
                      onClick={() => addSample(s.label, s.text)}
                      className="rounded-xl border bg-white px-3 py-2.5 text-left transition-shadow hover:shadow-md"
                      style={{ borderColor: "var(--hairline)" }}
                    >
                      <p className="text-xs font-semibold">{s.label}</p>
                      <p className="mt-0.5 text-xs" style={{ color: "var(--ink-3)" }}>
                        {s.desc}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          ) : (
            <div className="space-y-6 pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs" style={{ color: "var(--ink-3)" }}>
                  <FileSearch size={14} strokeWidth={1.75} />
                  {context.length > 0
                    ? `${context.length} document${context.length > 1 ? "s" : ""} in context`
                    : "No documents in context"}
                </div>
                <button
                  type="button"
                  onClick={resetChat}
                  disabled={busy}
                  className="flex items-center gap-1.5 rounded-full border bg-white px-3 py-1.5 text-xs font-medium transition-shadow hover:shadow-md disabled:opacity-50"
                  style={{ borderColor: "var(--hairline)" }}
                >
                  <RefreshCw size={12} strokeWidth={2} /> New session
                </button>
              </div>

              <AnimatePresence initial={false}>
                {messages.map((m) =>
                  m.role === "user" ? (
                    <motion.div
                      key={m.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex flex-col items-end gap-2"
                    >
                      {m.attachments.length > 0 && (
                        <div className="flex flex-wrap justify-end gap-2">
                          {m.attachments.map((a) => (
                            <AttachmentChip key={a.id} attachment={a} compact />
                          ))}
                        </div>
                      )}
                      <div
                        className="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm"
                        style={{ background: "var(--color-accent)", color: "#fff" }}
                      >
                        {m.text}
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key={m.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-3"
                    >
                      <AgentActivity steps={m.steps} running={m.running} />

                      {m.attachments
                        .filter((a) => a.fields?.length)
                        .map((a) => (
                          <ExtractedFieldsCard
                            key={a.id}
                            fileName={a.name}
                            fields={a.fields ?? []}
                          />
                        ))}

                      {m.text && <AIMessage text={m.text} />}

                      {m.running && !m.text && (
                        <p className="text-sm" style={{ color: "var(--ink-3)" }}>
                          Working through your document…
                        </p>
                      )}

                      {m.error && (
                        <div
                          className="rounded-xl px-4 py-3 text-sm"
                          style={{ background: "rgba(214,69,69,0.07)", color: "var(--bad)" }}
                        >
                          {m.error}
                        </div>
                      )}
                    </motion.div>
                  ),
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      {/* Docked composer once the session has started */}
      {started && (
        <motion.div
          layout
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="shrink-0 border-t"
          style={{ borderColor: "var(--hairline)", background: "var(--color-login-bg)" }}
        >
          <div className="mx-auto w-full max-w-3xl px-4 py-3 sm:px-6">{composer}</div>
        </motion.div>
      )}
    </div>
  );
}
