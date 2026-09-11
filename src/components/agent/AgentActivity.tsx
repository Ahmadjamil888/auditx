// ─── AgentActivity — animated multi-step progress tracker ────────────────────

import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  BarChart3,
  BookOpen,
  Check,
  ChevronDown,
  Circle,
  ClipboardCheck,
  FileSearch,
  GitMerge,
  Loader2,
  Scale,
  Search,
  Shield,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import type { AgentStep } from "@/lib/agent-service";

// ── Step icon mapping ─────────────────────────────────────────────────────────

const STEP_ICONS: Record<string, React.FC<any>> = {
  "understanding":   Sparkles,
  "extracting":      FileSearch,
  "reconciliation":  GitMerge,
  "analysis":        BarChart3,
  "evidence":        BookOpen,
  "compliance":      Shield,
  "calculation":     Scale,
  "quality":         ClipboardCheck,
  "research":        Search,
  "reading":         FileSearch,
  "context":         Sparkles,
  "analyze":         BarChart3,
  "compose":         ClipboardCheck,
};

function resolveIcon(step: AgentStep): React.FC<any> {
  const lower = step.label.toLowerCase();
  for (const [key, Icon] of Object.entries(STEP_ICONS)) {
    if (lower.includes(key)) return Icon;
  }
  return Circle;
}

// ── Step icon renderer ────────────────────────────────────────────────────────

function StepIcon({ status, step }: { status: AgentStep["status"]; step: AgentStep }) {
  if (status === "done")
    return <Check size={11} strokeWidth={2.5} style={{ color: "var(--ok)" }} />;
  if (status === "active")
    return <Loader2 size={11} strokeWidth={2.5} className="animate-spin" style={{ color: "var(--color-accent)" }} />;
  if (status === "error")
    return <AlertCircle size={11} strokeWidth={2.5} style={{ color: "var(--bad)" }} />;
  const Icon = resolveIcon(step);
  return <Icon size={9} strokeWidth={1.75} style={{ color: "var(--ink-3)" }} />;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AgentActivity({ steps, running }: { steps: AgentStep[]; running: boolean }) {
  const [open, setOpen] = useState(true);
  if (steps.length === 0) return null;

  const done   = steps.every((s) => s.status === "done");
  const failed = steps.some((s)  => s.status === "error");
  const active = steps.find((s)  => s.status === "active");

  const completed = steps.filter((s) => s.status === "done").length;
  const progress  = steps.length > 0 ? (completed / steps.length) * 100 : 0;

  return (
    <div
      className="overflow-hidden rounded-2xl"
      style={{
        border: "1px solid var(--hairline)",
        background: done ? "rgba(31,157,99,0.04)" : "rgba(115,66,226,0.04)",
      }}
    >
      {/* Header */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-xs font-medium"
      >
        {running && !done ? (
          <Loader2
            size={13}
            strokeWidth={2.5}
            className="shrink-0 animate-spin"
            style={{ color: "var(--color-accent)" }}
          />
        ) : failed ? (
          <AlertCircle size={13} strokeWidth={2.5} style={{ color: "var(--warn)" }} />
        ) : (
          <Check size={13} strokeWidth={2.5} style={{ color: "var(--ok)" }} />
        )}

        <span className="font-semibold" style={{ color: "var(--color-text)" }}>
          AI Activity
        </span>

        {running && active && (
          <span className="truncate font-normal" style={{ color: "var(--ink-3)" }}>
            — {active.label}
          </span>
        )}
        {done && !failed && (
          <span className="font-normal" style={{ color: "var(--ok)" }}>
            — Completed
          </span>
        )}

        <span
          className="ml-auto shrink-0 text-[10px] tabular-nums"
          style={{ color: "var(--ink-3)" }}
        >
          {completed}/{steps.length}
        </span>

        <ChevronDown
          size={13}
          strokeWidth={2}
          className="shrink-0 transition-transform"
          style={{
            color: "var(--ink-3)",
            transform: open ? "rotate(180deg)" : "none",
          }}
        />
      </button>

      {/* Progress bar */}
      {running && !done && (
        <div className="h-0.5 w-full overflow-hidden" style={{ background: "rgba(115,66,226,0.08)" }}>
          <motion.div
            className="h-full"
            style={{ background: "var(--color-accent)" }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.4, ease: "easeInOut" }}
          />
        </div>
      )}

      {/* Steps list */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
          >
            <div className="space-y-1 px-4 pb-4 pt-1">
              {steps.map((s) => (
                <motion.div
                  key={s.id}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-start gap-2.5 text-xs"
                >
                  <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full"
                    style={{
                      background:
                        s.status === "done"   ? "rgba(31,157,99,0.12)"  :
                        s.status === "active" ? "rgba(115,66,226,0.12)" :
                        s.status === "error"  ? "rgba(214,69,69,0.12)"  :
                        "rgba(25,40,55,0.06)",
                    }}
                  >
                    <StepIcon status={s.status} step={s} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <span
                      style={{
                        color:
                          s.status === "pending" ? "var(--ink-3)" :
                          s.status === "error"   ? "var(--bad)"   :
                          "var(--ink-2)",
                        fontWeight: s.status === "active" ? 500 : 400,
                      }}
                    >
                      {s.label}
                    </span>
                    {s.detail && (
                      <span className="ml-1.5" style={{ color: "var(--ink-3)" }}>
                        — {s.detail}
                      </span>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
