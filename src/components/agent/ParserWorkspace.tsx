// ─── AuditX Parser Workspace ──────────────────────────────────────────────────
// AI chat interface with agentic tool execution, approval gates,
// quota-aware error handling, and chat deletion.

import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type UIMessage,
} from "ai";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowUpRight,
  Bot,
  Check,
  ChevronDown,
  Clock,
  Download,
  Loader2,
  MoreVertical,
  Shield,
  Sparkles,
  Terminal,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
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
import { takePendingFiles, takePendingPrompt } from "@/lib/chat-session";
import { supabase } from "@/lib/supabase";
import { withTimeout } from "@/lib/utils";
import {
  useAiUsageToday,
  useDeleteChatThread,
  AI_PLAN_DAILY_LIMITS,
} from "@/lib/data-hooks";

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

const STAGE_META: Record<string, { icon: React.FC<{ size?: number; strokeWidth?: number; style?: React.CSSProperties }>; color: string }> = {
  "Understanding your task":   { icon: Sparkles,  color: "var(--color-accent)" },
  "Extracting financial data": { icon: Bot,       color: "var(--info)" },
  "Running reconciliation":    { icon: Shield,    color: "var(--warn)" },
  "Verifying evidence":        { icon: Check,     color: "var(--ok)" },
  "Checking calculations":     { icon: Terminal,  color: "var(--color-accent)" },
  "Preparing findings":        { icon: Sparkles,  color: "var(--ok)" },
};

// ── Types ─────────────────────────────────────────────────────────────────────

type WorkspaceStatus = "loading" | "ready" | "not_found" | "error";

type ToolPart = {
  type: string;
  toolName?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  approval?: { id: string };
};

// ── Quota error structures returned by /api/chat ──────────────────────────────

interface QuotaError {
  code: "quota_exceeded";
  plan: string;
  daily_limit: number;
  credits_used: number;
  message: string;
}

interface ProviderError {
  code: "provider_error" | "timeout" | "rate_limit";
  message: string;
}

// ── Classify API error message ────────────────────────────────────────────────

function classifyError(msg: string): "quota" | "credits" | "rate_limit" | "timeout" | "provider" | "generic" {
  const m = msg.toLowerCase();
  if (m.includes("quota_exceeded") || m.includes("quota exceeded") || m.includes("daily limit") || m.includes("429")) return "quota";
  if (m.includes("402") || m.includes("requires more credits") || m.includes("credits") || m.includes("upgrade to a paid")) return "credits";
  if (m.includes("rate limit") || m.includes("rate-limit") || m.includes("temporarily busy")) return "rate_limit";
  if (m.includes("504") || m.includes("timeout") || m.includes("timed out") || m.includes("taking longer")) return "timeout";
  if (m.includes("502") || m.includes("503") || m.includes("upstream") || m.includes("provider") || m.includes("overloaded")) return "provider";
  return "generic";
}

// ── AI Usage Indicator ────────────────────────────────────────────────────────

function AiUsageBar({ userId, plan }: { userId: string | undefined; plan: string }) {
  const { data } = useAiUsageToday(userId);
  const dailyLimit = AI_PLAN_DAILY_LIMITS[plan] ?? AI_PLAN_DAILY_LIMITS["free"]!;
  const used = data?.credits_used_today ?? 0;
  const pct = Math.min((used / dailyLimit) * 100, 100);
  const remaining = Math.max(dailyLimit - used, 0);
  const low = pct >= 80;
  const critical = pct >= 95;

  if (!userId) return null;

  return (
    <div
      className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs"
      style={{
        border: "1px solid var(--hairline)",
        background: critical ? "rgba(214,69,69,0.05)" : low ? "rgba(201,138,26,0.05)" : "white",
      }}
    >
      <Zap
        size={13}
        strokeWidth={1.75}
        style={{ color: critical ? "var(--bad)" : low ? "var(--warn)" : "var(--ink-3)", flexShrink: 0 }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span style={{ color: "var(--ink-2)" }}>
            AI usage · {plan.charAt(0).toUpperCase() + plan.slice(1)}
          </span>
          <span
            className="font-semibold tabular-nums"
            style={{ color: critical ? "var(--bad)" : low ? "var(--warn)" : "var(--ink-2)" }}
          >
            {used} / {dailyLimit}
          </span>
        </div>
        <div
          className="h-1.5 w-full overflow-hidden rounded-full"
          style={{ background: "var(--hairline)" }}
        >
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${pct}%`,
              background: critical ? "var(--bad)" : low ? "var(--warn)" : "var(--color-accent)",
            }}
          />
        </div>
        {critical && (
          <p className="mt-0.5" style={{ color: "var(--bad)" }}>
            Almost at today's limit — {remaining} request{remaining !== 1 ? "s" : ""} remaining
          </p>
        )}
      </div>
    </div>
  );
}

// ── Quota / Error banner shown inline in the chat ─────────────────────────────

function ErrorBanner({
  message,
  plan,
  onRetry,
}: {
  message: string;
  plan: string;
  onRetry?: () => void;
}) {
  const kind = classifyError(message);

  const configs = {
    quota: {
      icon: Zap,
      color: "var(--bad)",
      bg: "rgba(214,69,69,0.06)",
      border: "rgba(214,69,69,0.2)",
      title: plan === "free" ? "You've reached today's AI limit" : "Daily AI limit reached",
      body:
        plan === "free"
          ? `Your Free plan includes ${AI_PLAN_DAILY_LIMITS["free"]} AI requests per day. Your limit resets in 24 hours.`
          : message,
      cta: plan === "free" ? "Upgrade to Pro" : null,
      ctaLink: "/app/billing",
    },
    credits: {
      icon: Zap,
      color: "var(--warn)",
      bg: "rgba(201,138,26,0.06)",
      border: "rgba(201,138,26,0.2)",
      title: "AI service needs more credits",
      body: "The AI provider ran out of free credits for this request. This is a temporary limit — try again in a few minutes or ask a simpler question.",
      cta: "Try again",
      ctaLink: null,
    },
    rate_limit: {
      icon: Clock,
      color: "var(--warn)",
      bg: "rgba(201,138,26,0.06)",
      border: "rgba(201,138,26,0.2)",
      title: "AuditX is temporarily busy",
      body: "The AI service has reached its current request limit. Your data is safe and no changes were made. Try again in a few minutes.",
      cta: "Try again",
      ctaLink: null,
    },
    timeout: {
      icon: AlertTriangle,
      color: "var(--warn)",
      bg: "rgba(201,138,26,0.06)",
      border: "rgba(201,138,26,0.2)",
      title: "AuditX is taking longer than expected",
      body: "The AI service didn't respond in time. Your financial data hasn't been changed.",
      cta: "Try again",
      ctaLink: null,
    },
    provider: {
      icon: AlertTriangle,
      color: "var(--warn)",
      bg: "rgba(201,138,26,0.06)",
      border: "rgba(201,138,26,0.2)",
      title: "AuditX is temporarily unavailable",
      body: "The AI service didn't respond. Your financial data was not changed. This is usually resolved in seconds.",
      cta: "Try again",
      ctaLink: null,
    },
    generic: {
      icon: AlertTriangle,
      color: "var(--bad)",
      bg: "rgba(214,69,69,0.06)",
      border: "rgba(214,69,69,0.2)",
      title: "Something went wrong",
      body: message,
      cta: "Try again",
      ctaLink: null,
    },
  } as const;

  const cfg = configs[kind];
  const Icon = cfg.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto my-3 max-w-3xl overflow-hidden rounded-2xl px-5 py-4"
      style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
    >
      <div className="flex items-start gap-3">
        <Icon size={16} strokeWidth={1.75} style={{ color: cfg.color, flexShrink: 0, marginTop: 1 }} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold" style={{ color: cfg.color }}>
            {cfg.title}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed" style={{ color: "var(--ink-2)" }}>
            {cfg.body}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {cfg.cta && cfg.ctaLink && (
              <a
                href={cfg.ctaLink}
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white"
                style={{ background: cfg.color }}
              >
                {cfg.cta}
                <ArrowUpRight size={11} />
              </a>
            )}
            {cfg.cta && !cfg.ctaLink && onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-black/5"
                style={{ borderColor: cfg.color, color: cfg.color }}
              >
                {cfg.cta}
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function AgentProgressBar({ stage, visible }: { stage: string | null; visible: boolean }) {
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
            <Loader2 size={14} strokeWidth={2} className="animate-spin" style={{ color: "var(--color-accent)" }} />
          </span>
          <span className="flex-1 text-sm font-medium" style={{ color: "var(--color-text)" }}>
            {stage ?? "Working…"}
          </span>
          {meta && (
            <span className="text-xs" style={{ color: "var(--ink-3)" }}>
              <Icon size={12} strokeWidth={2} style={{ display: "inline", marginRight: 4, color: meta.color }} />
              {stage}
            </span>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── CSV download helper ───────────────────────────────────────────────────────

function triggerCsvDownload(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Tool card ─────────────────────────────────────────────────────────────────

function ToolCard({ part, onApprove }: { part: ToolPart; onApprove: ((approved: boolean) => void) | undefined }) {
  const [open, setOpen] = useState(false);
  const rawName       = part.toolName ?? part.type.replace(/^tool-/, "");
  const friendlyName  = rawName.replace(/_/g, " ");
  const running       = part.state === "input-streaming" || part.state === "input-available";
  const needsApproval = part.state === "approval-requested";
  const isDone        = part.state === "output-available";
  const isError       = !!part.errorText;

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
        {out["objective"] && <p className="px-4 pb-2 text-sm font-medium">{String(out["objective"])}</p>}
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
            <p className="text-sm font-semibold" style={{ color: "var(--ok)" }}>Spreadsheet Ready</p>
            <p className="text-xs truncate" style={{ color: "var(--ink-3)" }}>
              {String(out["filename"] ?? "export.csv")}
              {out["row_count"] !== undefined && ` — ${out["row_count"]} rows`}
            </p>
          </div>
          {typeof out["csv"] === "string" && (
            <button
              type="button"
              onClick={() => triggerCsvDownload(String(out["filename"] ?? "export.csv"), String(out["csv"]))}
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
          {needsApproval ? "needs approval" : running ? "running" : isError ? "failed" : "done"}
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

// ── Delete confirm modal ──────────────────────────────────────────────────────

function DeleteChatModal({ onClose, onConfirm, deleting }: { onClose: () => void; onConfirm: () => void; deleting: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 16 }}
        transition={{ duration: 0.18 }}
        className="relative z-10 w-full max-w-sm overflow-hidden rounded-2xl bg-white p-6 shadow-2xl"
        style={{ border: "1px solid var(--hairline)" }}
      >
        <div className="mb-4 flex size-10 items-center justify-center rounded-xl" style={{ background: "rgba(214,69,69,0.1)" }}>
          <Trash2 size={18} style={{ color: "var(--bad)" }} />
        </div>
        <h3 className="mb-1 text-sm font-bold">Delete this conversation?</h3>
        <p className="text-sm" style={{ color: "var(--ink-2)" }}>
          All messages in this chat will be permanently deleted. Your ledger records and transactions are not affected.
        </p>
        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border px-4 py-2 text-sm font-medium"
            style={{ borderColor: "var(--hairline)" }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: "var(--bad)" }}
          >
            {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            Delete chat
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Chat component ────────────────────────────────────────────────────────────

function Chat({
  threadId,
  initial,
  transport,
  plan,
}: {
  threadId: string;
  initial: UIMessage[];
  transport: DefaultChatTransport<UIMessage>;
  plan: string;
}) {
  const { user } = useAuth();
  const textareaRef  = useRef<HTMLTextAreaElement>(null);
  const pendingFired = useRef(false);
  const navigate = useNavigate();
  const deleteChatMutation = useDeleteChatThread();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status, stop, error, addToolApprovalResponse, setMessages } = useChat({
    id: threadId,
    messages: initial,
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    onError: (cause) => {
      // Don't show a generic toast — the ErrorBanner in the UI handles it
      console.error("[AuditX] Chat error", cause);
    },
  });

  const [currentStage, setCurrentStage] = useState<string | null>(null);

  // ── Pending prompt from landing composer ──────────────────────────────────
  useEffect(() => {
    if (pendingFired.current) return;
    pendingFired.current = true;
    const pendingText  = takePendingPrompt();
    const pendingFiles = takePendingFiles();
    if (pendingText || pendingFiles.length > 0) {
      void (async () => {
        const aiFiles = pendingFiles.length > 0
          ? await Promise.all(pendingFiles.map(async (f) => {
              const ab = await f.arrayBuffer();
              return new File([ab], f.name, { type: f.type || "application/octet-stream" });
            }))
          : undefined;
        await sendMessage({ text: pendingText || "Analyse the attached document(s).", files: aiFiles });
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (status === "ready") { setCurrentStage(null); textareaRef.current?.focus(); }
  }, [status]);

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

  // Close menu on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    if (menuOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  async function handleDeleteChat() {
    if (!user?.id) return;
    try {
      await deleteChatMutation.mutateAsync({ threadId, userId: user.id });
      toast.success("Conversation deleted");
      // Navigate to parser index which will create a fresh thread
      navigate({ to: "/app/parser" });
    } catch {
      toast.error("Failed to delete conversation");
    }
  }

  const empty = messages.length === 0;
  const isStreaming = status === "streaming" || status === "submitted";

  // Classify the error so we can render the right message
  const errorMessage = error?.message ?? "";

  return (
    <div className="flex h-[calc(100vh-3.75rem)] min-h-[560px] flex-col overflow-hidden">
      {/* ── Thread header bar ─────────────────────────────────────────────── */}
      <div
        className="flex shrink-0 items-center justify-between border-b px-4 py-2.5"
        style={{ borderColor: "var(--hairline)", background: "rgba(255,255,255,0.8)", backdropFilter: "blur(8px)" }}
      >
        <div className="flex items-center gap-2">
          <div className="flex size-6 items-center justify-center rounded-lg" style={{ background: "rgba(115,66,226,0.1)" }}>
            <Sparkles size={13} style={{ color: "var(--color-accent)" }} />
          </div>
          <span className="text-xs font-semibold" style={{ color: "var(--color-text)" }}>AuditX</span>
          <span className="text-xs" style={{ color: "var(--ink-3)" }}>Financial AI Agent</span>
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-2" ref={menuRef}>
          {/* Usage indicator — compact */}
          <AiUsageBar userId={user?.id} plan={plan} />

          {/* Thread menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex size-8 items-center justify-center rounded-xl border transition-colors hover:bg-black/5"
              style={{ borderColor: "var(--hairline)" }}
              aria-label="Chat options"
            >
              <MoreVertical size={15} strokeWidth={1.75} style={{ color: "var(--ink-3)" }} />
            </button>

            <AnimatePresence>
              {menuOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -4 }}
                  transition={{ duration: 0.12 }}
                  className="absolute right-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-xl bg-white shadow-lg"
                  style={{ border: "1px solid var(--hairline)" }}
                >
                  <button
                    type="button"
                    onClick={() => { setMenuOpen(false); setDeleteOpen(true); }}
                    className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm transition-colors hover:bg-black/5"
                    style={{ color: "var(--bad)" }}
                  >
                    <Trash2 size={14} strokeWidth={1.75} />
                    Delete conversation
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* ── Messages ─────────────────────────────────────────────────────── */}
      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="mx-auto w-full max-w-3xl px-5 py-8">
          {empty && (
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="flex min-h-[46vh] flex-col items-center justify-center text-center"
            >
              <div className="mb-5 flex size-14 items-center justify-center rounded-2xl" style={{ background: "rgba(115,66,226,0.1)" }}>
                <Sparkles size={26} strokeWidth={1.5} style={{ color: "var(--color-accent)" }} />
              </div>
              <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "clamp(1.4rem,3vw,2rem)" }}>
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
                        onApprove={approvalId ? (approved) => addToolApprovalResponse({ id: approvalId, approved }) : undefined}
                      />
                    );
                  }
                  return null;
                })}
              </MessageContent>
            </Message>
          ))}

          {status === "submitted" && <Shimmer>Reading your ledger and planning next steps…</Shimmer>}

          {/* Quota / provider / timeout error banners */}
          {error && (
            <ErrorBanner
              message={errorMessage}
              plan={plan}
              onRetry={() => {
                const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
                if (lastUserMsg) {
                  const textParts = lastUserMsg.parts.filter((p) => p.type === "text");
                  const text = textParts.map((p) => (p as { text: string }).text).join(" ");
                  if (text) void sendMessage({ text });
                }
              }}
            />
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {/* ── Composer area ─────────────────────────────────────────────────── */}
      <div className="px-4 pb-6 pt-2">
        <div className="mx-auto w-full max-w-3xl">
          <AgentProgressBar stage={currentStage} visible={isStreaming} />

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

      {/* Delete confirm modal */}
      <AnimatePresence>
        {deleteOpen && (
          <DeleteChatModal
            onClose={() => setDeleteOpen(false)}
            onConfirm={handleDeleteChat}
            deleting={deleteChatMutation.isPending}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── ParserWorkspace (public entry point) ──────────────────────────────────────

export function ParserWorkspace({ threadId }: { threadId: string }) {
  const { session, profile } = useAuth();
  const [wsStatus, setWsStatus]   = useState<WorkspaceStatus>("loading");
  const [initial, setInitial]     = useState<UIMessage[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt]     = useState(0);

  const plan = profile?.plan ?? "free";

  useEffect(() => {
    let cancelled = false;
    setWsStatus("loading");
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
        if (!thread) { setWsStatus("not_found"); return; }

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
        setWsStatus("ready");
      } catch (cause) {
        if (cancelled) return;
        setLoadError(cause instanceof Error ? cause.message : "Failed to load workspace.");
        setWsStatus("error");
      }
    })();

    return () => { cancelled = true; };
  }, [threadId, attempt]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        headers: () => ({ Authorization: `Bearer ${session?.access_token ?? ""}` }),
        // Intercept non-2xx responses and surface the actual error body
        // before the AI SDK replaces it with the generic "An error occurred."
        fetch: async (input, init) => {
          const res = await fetch(input, init);
          if (!res.ok) {
            // Clone so we can read the body without consuming the original
            const clone = res.clone();
            let message = `HTTP ${res.status}`;
            try {
              const body = (await clone.json()) as { message?: string; code?: string };
              if (body.message) message = body.message;
            } catch {
              try { message = await clone.text(); } catch { /* use status */ }
            }
            throw new Error(message);
          }
          return res;
        },
      }),
    [session?.access_token],
  );

  if (wsStatus === "not_found" || wsStatus === "error") {
    return (
      <div className="flex h-[70vh] flex-col items-center justify-center gap-4 text-center">
        <p className="text-sm" style={{ color: "var(--ink-2)" }}>
          {wsStatus === "not_found"
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

  if (wsStatus === "loading") {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <Shimmer>Opening audit workspace…</Shimmer>
      </div>
    );
  }

  return (
    <Chat
      key={threadId}
      threadId={threadId}
      initial={initial}
      transport={transport}
      plan={plan}
    />
  );
}
