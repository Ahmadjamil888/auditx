import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, Sparkles, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AgentActivity } from "@/components/agent/AgentActivity";
import { AIMessage } from "@/components/agent/AIMessage";
import { ChatComposer } from "@/components/agent/ChatComposer";
import { ExtractedFieldsCard } from "@/components/agent/ExtractedFieldsCard";
import { useAuth } from "@/lib/auth-context";
import {
  fileToAttachment,
  runAgent,
  type AgentAttachment,
  type AgentStep,
  type AgentTurn,
} from "@/lib/agent-service";
import type { ExtractedField } from "@/lib/ai-service";

export const Route = createFileRoute("/app/agent")({
  component: AgentPage,
});

// ── Message shape ─────────────────────────────────────────────────────────────

type Message =
  | { role: "user"; text: string; attachments: AgentAttachment[] }
  | { role: "assistant"; text: string; steps: AgentStep[]; fields?: { attachmentId: string; fileName: string; fields: ExtractedField[] }[] };

const STARTERS = [
  "Summarise all transactions in this broker slip",
  "Calculate my capital gains tax exposure for this period",
  "Flag any fee discrepancies or WHT mismatches",
  "Run a reconciliation check on this document",
];

// ── Component ─────────────────────────────────────────────────────────────────

function AgentPage() {
  const { profile } = useAuth();
  const bottomRef  = useRef<HTMLDivElement>(null);
  const abortRef   = useRef<AbortController | null>(null);

  const [messages,     setMessages]     = useState<Message[]>([]);
  const [input,        setInput]        = useState("");
  const [attachments,  setAttachments]  = useState<AgentAttachment[]>([]);
  const [busy,         setBusy]         = useState(false);
  const [activeSteps,  setActiveSteps]  = useState<AgentStep[]>([]);

  // Auto-scroll on new content
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeSteps]);

  // ── File handling ───────────────────────────────────────────────────────────

  async function addFiles(files: FileList | null) {
    if (!files) return;
    const converted = await Promise.all(Array.from(files).map(fileToAttachment));
    setAttachments((prev) => [...prev, ...converted]);
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  // ── Submit ──────────────────────────────────────────────────────────────────

  async function submit() {
    if (busy) return;
    const prompt = input.trim();
    if (!prompt && attachments.length === 0) return;

    const userMsg: Message = { role: "user", text: prompt, attachments: [...attachments] };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setAttachments([]);
    setBusy(true);
    setActiveSteps([]);

    // Build history for context window
    const history: AgentTurn[] = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-10)
      .map((m) => ({ role: m.role as "user" | "assistant", text: m.text }));

    // Placeholder assistant turn for streaming
    const assistantIdx = messages.length + 1;
    setMessages((prev) => [
      ...prev,
      { role: "assistant", text: "", steps: [], fields: [] },
    ]);

    abortRef.current = new AbortController();

    try {
      await runAgent({
        prompt,
        attachments: userMsg.attachments,
        history,
        jurisdiction: profile?.jurisdiction ?? "PSX",
        signal: abortRef.current.signal,
        onStep: (steps) => {
          setActiveSteps(steps);
          setMessages((prev) =>
            prev.map((m, i) =>
              i === assistantIdx && m.role === "assistant"
                ? { ...m, steps }
                : m,
            ),
          );
        },
        onDelta: (text) => {
          setMessages((prev) =>
            prev.map((m, i) =>
              i === assistantIdx && m.role === "assistant"
                ? { ...m, text }
                : m,
            ),
          );
        },
        onFields: (attachmentId, fields) => {
          // Find the attachment name
          const att = userMsg.attachments.find((a) => a.id === attachmentId);
          if (!att) return;
          setMessages((prev) =>
            prev.map((m, i) => {
              if (i !== assistantIdx || m.role !== "assistant") return m;
              const existing = m.fields ?? [];
              const already  = existing.find((f) => f.attachmentId === attachmentId);
              if (already) return m;
              return {
                ...m,
                fields: [...existing, { attachmentId, fileName: att.name, fields }],
              };
            }),
          );
        },
      });
    } catch (e) {
      const errText = (e as Error).message ?? "Something went wrong.";
      setMessages((prev) =>
        prev.map((m, i) =>
          i === assistantIdx && m.role === "assistant"
            ? { ...m, text: `⚠️ ${errText}` }
            : m,
        ),
      );
    } finally {
      setBusy(false);
      setActiveSteps([]);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
    setBusy(false);
  }

  const isEmpty = messages.length === 0;

  return (
    <div className="flex h-[calc(100dvh-56px)] flex-col">

      {/* ── Conversation ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        {isEmpty ? (
          <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 pt-16 text-center">
            <div
              className="flex size-14 items-center justify-center rounded-2xl"
              style={{ background: "rgba(115,66,226,0.1)" }}
            >
              <Sparkles size={28} strokeWidth={1.5} style={{ color: "var(--color-accent)" }} />
            </div>
            <div>
              <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "1.5rem" }}>
                AuditX AI Agent
              </h2>
              <p className="mt-2 text-sm" style={{ color: "var(--ink-2)" }}>
                Upload any broker slip, contract note, CSV or dividend voucher.
                Ask me to extract fields, compute your tax exposure, flag discrepancies, or run a reconciliation.
              </p>
            </div>
            <div className="grid w-full gap-2 sm:grid-cols-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setInput(s); }}
                  className="rounded-xl border bg-white px-4 py-3 text-left text-sm transition-shadow hover:shadow-md"
                  style={{ borderColor: "var(--hairline)" }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-2xl space-y-6">
            <AnimatePresence initial={false}>
              {messages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  {msg.role === "user" ? (
                    <div className="flex items-start gap-3">
                      <div
                        className="flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                        style={{ background: "var(--color-accent)", color: "#fff" }}
                      >
                        <User size={14} strokeWidth={2} />
                      </div>
                      <div className="flex-1 space-y-2">
                        {msg.text && (
                          <div
                            className="inline-block max-w-full rounded-2xl px-4 py-3 text-sm"
                            style={{ background: "var(--color-accent)", color: "#fff" }}
                          >
                            {msg.text}
                          </div>
                        )}
                        {msg.attachments.map((a) => (
                          <div key={a.id} className="flex items-center gap-2 text-xs" style={{ color: "var(--ink-2)" }}>
                            <span className="rounded-lg border bg-white px-2.5 py-1.5" style={{ borderColor: "var(--hairline)" }}>
                              📎 {a.name}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3">
                      <div
                        className="flex size-8 shrink-0 items-center justify-center rounded-full"
                        style={{ background: "rgba(115,66,226,0.1)" }}
                      >
                        <Bot size={14} strokeWidth={2} style={{ color: "var(--color-accent)" }} />
                      </div>
                      <div className="flex-1 space-y-3">
                        {msg.steps.length > 0 && (
                          <AgentActivity steps={msg.steps} running={busy && i === messages.length - 1} />
                        )}
                        {msg.text && <AIMessage text={msg.text} />}
                        {msg.fields?.map((fc) => (
                          <ExtractedFieldsCard
                            key={fc.attachmentId}
                            fileName={fc.fileName}
                            fields={fc.fields}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
            <div ref={bottomRef} />
          </div>
        )}
        {!isEmpty && <div ref={bottomRef} />}
      </div>

      {/* ── Composer ──────────────────────────────────────────────────────── */}
      <div className="border-t px-4 py-3 sm:px-6" style={{ borderColor: "var(--hairline)", background: "var(--color-sheet, #fff)" }}>
        <div className="mx-auto max-w-2xl space-y-2">
          {busy && (
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={stop}
                className="rounded-full border px-3 py-1 text-xs font-medium transition-shadow hover:shadow-md"
                style={{ borderColor: "var(--hairline)", color: "var(--bad)" }}
              >
                Stop generating
              </button>
            </div>
          )}
          <ChatComposer
            value={input}
            onChange={setInput}
            onSubmit={submit}
            attachments={attachments}
            onAddFiles={addFiles}
            onRemoveAttachment={removeAttachment}
            busy={busy}
            placeholder="Ask about your documents, tax, reconciliation…"
            disabled={false}
          />
        </div>
      </div>
    </div>
  );
}
