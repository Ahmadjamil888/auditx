import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type UIMessage,
} from "ai";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Bot,
  Check,
  ChevronDown,
  Download,
  Loader2,
  Shield,
  Sparkles,
  Terminal,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { useAuth } from "@/lib/auth-context";
import {
  takePendingFiles,
  takePendingPrompt,
} from "@/lib/chat-session";
import { supabase } from "@/lib/supabase";
import { withTimeout } from "@/lib/utils";

// ── Suggestion chips ──────────────────────────────────────────────────────────

const SUGGESTIONS = [
  "Reconcile my last 10 trades and flag anything odd",
  "Extract this broker slip and post it to my ledger",
  "What is my realised capital gain this tax year?",
  "Update unfinished records and prepare a new spreadsheet",
  "Detect fee surcharges and WHT mismatches",
  "Analyse my portfolio concentration and risk",
];

// ── Progress stage labels ─────────────────────────────────────────────────────

const STAGE_META: Record<string, { icon: React.FC<any>; color: string }> = {
  "Understanding your task":    { icon: Sparkles,       color: "var(--color-accent)" },
  "Extracting financial data":  { icon: Bot,            color: "var(--info)" },
  "Running reconciliation":     { icon: Shield,         color: "var(--warn)" },
  "Verifying evidence":         { icon: Check,          color: "var(--ok)" },
  "Checking calculations":      { icon: Terminal,       color: "var(--color-accent)" },
  "Preparing findings":         { icon: Sparkles,       color: "var(--ok)" },
};

// ── Workspace status ──────────────────────────────────────────────────────────

type WorkspaceStatus = "loading" | "ready" | "not_found" | "error";

// ── Tool part type ────────────────────────────────────────────────────────────

type ToolPart = {
  type: string;
  toolName?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  approval?: { id: string };
};

// ── Progress bar shown while agent is active ──────────────────────────────────

function AgentProgressBar({
  stage,
  visible,
}: {
  stage: string | null;
  visible: boolean;
}) {
  const meta = stage ? STAGE_META[stage] : null;
  const Icon = meta?.icon ?? Loader2;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
          className="mx-auto mb-3 flex max-w-3xl items-center gap-3 rounded-2xl px-4 py-3"
          style={{
            background: "rgba(115,66,226,0.06)",
            border: "1px solid rgba(115,66,226,0.14)",
          }}
        >
          <span
            className="flex size-7 shrink-0 items-center justify-center rounded-full"
            style={{ background: "rgba(115,66,226,0.12)" }}
          >
            <Loader2
              size={14}
              strokeWidth={2}
              className="animate-spin"
              style={{ color: "var(--color-accent)" }}
            />
          </span>
          <span className="flex-1 text-sm font-medium" style={{ color: "var(--color-text)" }}>
            {stage ?? "Working…"}
          </span>
          {meta && (
            <span className="text-xs" style={{ color: "var(--ink-3)" }}>
              <Icon
                size={12}
                strokeWidth={2}
                style={{ display: "inline", marginRight: 4, color: meta.color }}
              />
              {stage}
            </span>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── CSV download trigger ──────────────────────────────────────────────────────

function triggerCsvDownload(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Tool card ─────────────────────────────────────────────────────────────────

function ToolCard({
  part,
  onApprove,
}: {
  part: ToolPart;
  onApprove: ((approved: boolean) => void) | undefined;
}) {
  const [open, setOpen] = useState(false);
  const rawName      = part.toolName ?? part.type.replace(/^tool-/, "");
  const friendlyName = rawName.replace(/_/g, " ");
  const running      = part.state === "input-streaming" || part.state === "input-available";
  const needsApproval= part.state === "approval-requested";
  const isDone       = part.state === "output-available";
  const isError      = !!part.errorText;

  // Auto-download CSV when prepare_spreadsheet completes
  useEffect(() => {
    if (rawName === "prepare_spreadsheet" && isDone && part.output) {
      const out = part.output as Record<string, unknown>;
      if (typeof out["csv"] === "string" && typeof out["filename"] === "string") {
        triggerCsvDownload(out["filename"] as string, out["csv"] as string);
        toast.success("Spreadsheet ready", { description: `${out["filename"]} downloaded` });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDone]);

  // For plan_task / report_progress — show inline progress card, not a tool card
  if (rawName === "plan_task" && isDone && part.output) {
    const out = part.output as Record<string, unknown>;
    const steps = Array.isArray(out["steps"]) ? (out["steps"] as string[]) : [];
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="my-3 overflow-hidden rounded-2xl"
        style={{ border: "1px solid rgba(115,66,226,0.2)", background: "rgba(115,66,226,0.04)" }}
      >
        <div className="flex items-center gap-2 px-4 py-3">
          <Sparkles size={14} style={{ color: "var(--color-accent)" }} />
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-accent)" }}>
            Task Plan
          </span>
        </div>
        {out["objective"] && (
          <p className="px-4 pb-2 text-sm font-medium">{String(out["objective"])}</p>
        )}
        {steps.length > 0 && (
          <ul className="space-y-1.5 px-4 pb-4">
            {steps.map((step, i) => (
              <li key={i} className="flex items-start gap-2 text-xs" style={{ color: "var(--ink-2)" }}>
                <span
                  className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold"
                  style={{ background: "rgba(115,66,226,0.14)", color: "var(--color-accent)" }}
                >
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ul>
        )}
      </motion.div>
    );
  }

  if (rawName === "report_progress") return null;

  // Spreadsheet ready card
  if (rawName === "prepare_spreadsheet" && isDone && part.output) {
    const out = part.output as Record<string, unknown>;
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="my-3 overflow-hidden rounded-2xl"
        style={{ border: "1px solid rgba(31,157,99,0.25)", background: "rgba(31,157,99,0.05)" }}
      >
        <div className="flex items-center gap-3 px-4 py-3.5">
          <Download size={16} strokeWidth={1.75} style={{ color: "var(--ok)" }} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold" style={{ color: "var(--ok)" }}>
              Spreadsheet Ready
            </p>
            <p className="text-xs truncate" style={{ color: "var(--ink-3)" }}>
              {String(out["filename"] ?? "export.csv")}
              {out["row_count"] !== undefined && ` — ${out["row_count"]} rows`}
            </p>
          </div>
          {typeof out["csv"] === "string" && (
            <button
              type="button"
              onClick={() =>
                triggerCsvDownload(String(out["filename"] ?? "export.csv"), String(out["csv"]))
              }
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white"
              style={{ background: "var(--ok)" }}
            >
              <Download size={12} /> Download
            </button>
          )}
        </div>
      </motion.div>
    );
  }

  return (
    <div className="my-2 overflow-hidden rounded-xl" style={{ border: "1px solid var(--hairline)" }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium"
        style={{ background: "rgba(25,40,55,0.03)" }}
      >
        {running ? (
          <Loader2 size={14} className="animate-spin" style={{ color: "var(--color-accent)" }} />
        ) : isError ? (
          <X size={14} style={{ color: "var(--bad)" }} />
        ) : needsApproval ? (
          <AlertTriangle size={14} style={{ color: "var(--warn)" }} />
        ) : (
          <Check size={14} style={{ color: "var(--ok)" }} />
        )}
        <span className="capitalize">{friendlyName}</span>
        <span className="ml-auto" style={{ color: "var(--ink-3)" }}>
          {needsApproval
            ? "needs approval"
            : running
              ? "running"
              : isError
                ? "failed"
                : "done"}
        </span>
        {isDone && !isError && (
          <ChevronDown
            size={12}
            className="transition-transform"
            style={{ transform: open ? "rotate(180deg)" : "none", color: "var(--ink-3)" }}
          />
        )}
      </button>

      {open && (
        <div className="space-y-2 px-3 py-2 text-[11px]" style={{ color: "var(--ink-2)" }}>
          {part.input && (
            <pre className="overflow-x-auto rounded-lg bg-black/5 p-2 whitespace-pre-wrap break-words">
              {JSON.stringify(part.input, null, 2)}
            </pre>
          )}
          {part.output !== undefined && (
            <pre className="overflow-x-auto rounded-lg bg-black/5 p-2 whitespace-pre-wrap break-words">
              {JSON.stringify(part.output, null, 2)}
            </pre>
          )}
          {isError && <p style={{ color: "var(--bad)" }}>{part.errorText}</p>}
        </div>
      )}

      {needsApproval && onApprove && (
        <div
          className="flex items-center gap-3 border-t px-4 py-3"
          style={{ borderColor: "var(--hairline)", background: "rgba(201,138,26,0.05)" }}
        >
          <AlertTriangle size={14} style={{ color: "var(--warn)", flexShrink: 0 }} />
          <p className="mr-auto text-xs" style={{ color: "var(--ink-2)" }}>
            AuditX wants to write to your ledger. Review the input above before approving.
          </p>
          <button
            type="button"
            onClick={() => onApprove(false)}
            className="rounded-full px-3 py-1.5 text-xs font-semibold"
            style={{ border: "1px solid var(--hairline)" }}
          >
            Reject
          </button>
          <button
            type="button"
            onClick={() => onApprove(true)}
            className="rounded-full px-3 py-1.5 text-xs font-semibold text-white"
            style={{ background: "var(--color-accent)" }}
          >
            Approve
          </button>
        </div>
      )}
    </div>
  );
}

// ── Chat component ────────────────────────────────────────────────────────────

function Chat({
  threadId,
  initial,
  transport,
}: {
  threadId: string;
  initial: UIMessage[];
  transport: DefaultChatTransport<UIMessage>;
}) {
  const textareaRef  = useRef<HTMLTextAreaElement>(null);
  const pendingFired = useRef(false);

  const { messages, sendMessage, status, stop, error, addToolApprovalResponse } = useChat({
    id: threadId,
    messages: initial,
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    onError: (cause) => toast.error(cause.message),
  });

  // Track current public stage from report_progress / plan_task tool calls
  const [currentStage, setCurrentStage] = useState<string | null>(null);

  // ── Restore pending prompt from landing composer on first mount ────────────
  useEffect(() => {
    if (pendingFired.current) return;
    pendingFired.current = true;

    const pendingText  = takePendingPrompt();
    const pendingFiles = takePendingFiles();

    if (pendingText || pendingFiles.length > 0) {
      // Convert files to AI SDK File objects and send
      const send = async () => {
        const aiFiles = pendingFiles.length > 0
          ? await Promise.all(
              pendingFiles.map(async (f) => {
                const ab  = await f.arrayBuffer();
                return new File([ab], f.name, { type: f.type || "application/octet-stream" });
              }),
            )
          : undefined;
        await sendMessage({
          text:  pendingText || "Analyse the attached document(s).",
          files: aiFiles,
        });
      };
      void send();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (status === "ready") {
      setCurrentStage(null);
      textareaRef.current?.focus();
    }
  }, [status]);

  // Derive current public stage from the latest assistant message tool parts
  useEffect(() => {
    if (status !== "streaming") { setCurrentStage(null); return; }
    const lastMsg = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastMsg) return;
    for (const part of [...(lastMsg.parts ?? [])].reverse()) {
      const tp = part as unknown as ToolPart;
      const name = tp.toolName ?? tp.type?.replace(/^tool-/, "");
      if (name === "report_progress" && tp.output) {
        const out = tp.output as Record<string, unknown>;
        if (typeof out["stage"] === "string") { setCurrentStage(out["stage"]); return; }
      }
      if (name === "plan_task" && tp.state === "input-available" && tp.input) {
        const inp = tp.input as Record<string, unknown>;
        if (typeof inp["public_stage"] === "string") { setCurrentStage(inp["public_stage"]); return; }
      }
    }
  }, [messages, status]);

  const empty = messages.length === 0;
  const isStreaming = status === "streaming" || status === "submitted";

  return (
    <div className="flex h-[calc(100vh-3.75rem)] min-h-[560px] flex-col overflow-hidden">
      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="mx-auto w-full max-w-3xl px-5 py-8">
          {empty && (
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="flex min-h-[46vh] flex-col items-center justify-center text-center"
            >
              <div
                className="mb-5 flex size-14 items-center justify-center rounded-2xl"
                style={{ background: "rgba(115,66,226,0.1)" }}
              >
                <Sparkles size={26} strokeWidth={1.5} style={{ color: "var(--color-accent)" }} />
              </div>
              <h1
                style={{ fontFamily: "var(--font-heading)", fontSize: "clamp(1.4rem,3vw,2rem)" }}
              >
                What should AuditX analyze today?
              </h1>
              <p className="mt-3 max-w-lg text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
                Attach any broker statement, trade slip, CSV, spreadsheet or PDF — or just describe
                what you need. The AI team reads your real ledger and asks before writing anything.
              </p>
            </motion.div>
          )}

          {messages.map((message) => (
            <Message key={message.id} from={message.role}>
              <MessageContent>
                {message.parts.map((part, index) => {
                  if (part.type === "text")
                    return <MessageResponse key={index}>{part.text}</MessageResponse>;

                  if (part.type === "file")
                    return (
                      <div
                        key={index}
                        className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs"
                        style={{ borderColor: "var(--hairline)" }}
                      >
                        📎 {("filename" in part && part.filename) || "Attached document"}
                      </div>
                    );

                  if (part.type.startsWith("tool-") || part.type === "dynamic-tool") {
                    const tp = part as unknown as ToolPart;
                    const approvalId = tp.approval?.id;
                    return (
                      <ToolCard
                        key={index}
                        part={tp}
                        onApprove={
                          approvalId
                            ? (approved) =>
                                addToolApprovalResponse({ id: approvalId, approved })
                            : undefined
                        }
                      />
                    );
                  }
                  return null;
                })}
              </MessageContent>
            </Message>
          ))}

          {status === "submitted" && (
            <Shimmer>Reading your ledger and planning next steps…</Shimmer>
          )}
          {error && (
            <p className="rounded-xl px-4 py-3 text-sm" style={{ color: "var(--bad)", background: "rgba(214,69,69,0.06)" }}>
              {error.message}
            </p>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {/* ── Composer area ───────────────────────────────────────────────── */}
      <div className="px-4 pb-6 pt-2">
        <div className="mx-auto w-full max-w-3xl">
          {/* Progress bar */}
          <AgentProgressBar stage={currentStage} visible={isStreaming} />

          {/* Suggestion chips — only when empty */}
          {empty && (
            <div className="mb-3 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void sendMessage({ text: s })}
                  className="rounded-full bg-white px-3 py-1.5 text-xs transition-all hover:shadow-md"
                  style={{ border: "1px solid var(--hairline)", color: "var(--ink-2)" }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Stop button */}
          {isStreaming && (
            <div className="mb-2 flex justify-end">
              <button
                type="button"
                onClick={stop}
                className="rounded-full border px-3 py-1 text-xs font-medium transition-shadow hover:shadow-sm"
                style={{ borderColor: "var(--hairline)", color: "var(--bad)" }}
              >
                Stop generating
              </button>
            </div>
          )}

          <PromptInput
            accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.xlsx,.xls,.txt"
            multiple
            globalDrop
            onSubmit={async ({ text, files }) => {
              const trimmed = (text ?? "").trim();
              if (!trimmed && (!files || files.length === 0)) return;
              await sendMessage({ text: trimmed || "Analyse the attached document(s).", files });
            }}
          >
            <PromptInputTextarea
              ref={textareaRef}
              autoFocus
              placeholder="Ask AuditX to reconcile, analyze, correct or export your financial data…"
            />
            <PromptInputFooter>
              <PromptInputTools>
                <PromptInputActionMenu>
                  <PromptInputActionMenuTrigger tooltip="Attach files" />
                  <PromptInputActionMenuContent>
                    <PromptInputActionAddAttachments label="Attach broker document" />
                  </PromptInputActionMenuContent>
                </PromptInputActionMenu>
              </PromptInputTools>
              <PromptInputSubmit status={status} onStop={stop} />
            </PromptInputFooter>
          </PromptInput>

          <p className="mt-2 text-center text-[11px]" style={{ color: "var(--ink-3)" }}>
            AuditX reads your real ledger. Ledger writes require your explicit approval.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── ParserWorkspace (public entry point) ──────────────────────────────────────

export function ParserWorkspace({ threadId }: { threadId: string }) {
  const { session } = useAuth();
  const [status, setStatus]     = useState<WorkspaceStatus>("loading");
  const [initial, setInitial]   = useState<UIMessage[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt]   = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setLoadError(null);

    void (async () => {
      try {
        const { data: thread, error: threadError } = await withTimeout(
          supabase.from("chat_threads").select("id").eq("id", threadId).maybeSingle(),
          15000,
          "Thread query",
        );
        if (cancelled) return;
        if (threadError) throw new Error(threadError.message);
        if (!thread) { setStatus("not_found"); return; }

        const { data, error } = await withTimeout(
          supabase
            .from("chat_messages")
            .select("ai_message_id, role, parts")
            .eq("thread_id", threadId)
            .order("position"),
          15000,
          "Messages query",
        );
        if (cancelled) return;
        if (error) throw new Error(error.message);

        setInitial(
          (data ?? []).map((row) => ({
            id:    row.ai_message_id,
            role:  row.role,
            parts: row.parts,
          })) as UIMessage[],
        );
        setStatus("ready");
      } catch (cause) {
        if (cancelled) return;
        setLoadError(cause instanceof Error ? cause.message : "Failed to load workspace.");
        setStatus("error");
      }
    })();

    return () => { cancelled = true; };
  }, [threadId, attempt]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        headers: () => ({ Authorization: `Bearer ${session?.access_token ?? ""}` }),
      }),
    [session?.access_token],
  );

  if (status === "not_found" || status === "error") {
    return (
      <div className="flex h-[70vh] flex-col items-center justify-center gap-4 text-center">
        <p className="text-sm" style={{ color: "var(--ink-2)" }}>
          {status === "not_found"
            ? "This workspace does not exist or you do not have access."
            : (loadError ?? "Failed to load workspace.")}
        </p>
        <button
          type="button"
          onClick={() => setAttempt((n) => n + 1)}
          className="rounded-full px-4 py-2 text-xs font-semibold text-white"
          style={{ background: "var(--color-accent)" }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <Shimmer>Opening audit workspace…</Shimmer>
      </div>
    );
  }

  return <Chat key={threadId} threadId={threadId} initial={initial} transport={transport} />;
}
