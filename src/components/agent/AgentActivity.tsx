import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Check, ChevronDown, Circle, Loader2 } from "lucide-react";
import { useState } from "react";
import type { AgentStep } from "@/lib/agent-service";

function StepIcon({ status }: { status: AgentStep["status"] }) {
  if (status === "done")
    return <Check size={12} strokeWidth={2.5} style={{ color: "var(--ok)" }} />;
  if (status === "active")
    return <Loader2 size={12} strokeWidth={2.5} className="animate-spin" style={{ color: "var(--color-accent)" }} />;
  if (status === "error")
    return <AlertCircle size={12} strokeWidth={2.5} style={{ color: "var(--bad)" }} />;
  return <Circle size={9} strokeWidth={2} style={{ color: "var(--ink-3)" }} />;
}

export function AgentActivity({ steps, running }: { steps: AgentStep[]; running: boolean }) {
  const [open, setOpen] = useState(true);
  if (steps.length === 0) return null;

  const done = steps.every((s) => s.status === "done");
  const failed = steps.some((s) => s.status === "error");
  const active = steps.find((s) => s.status === "active");

  return (
    <div
      className="overflow-hidden rounded-xl"
      style={{ border: "1px solid var(--hairline)", background: "var(--color-login-bg)" }}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium"
      >
        {running && !done ? (
          <Loader2 size={12} strokeWidth={2.5} className="animate-spin" style={{ color: "var(--color-accent)" }} />
        ) : (
          <Check size={12} strokeWidth={2.5} style={{ color: failed ? "var(--warn)" : "var(--ok)" }} />
        )}
        <span>AI Activity</span>
        <span className="truncate font-normal" style={{ color: "var(--ink-3)" }}>
          {running && active ? `— ${active.label}` : done ? "— Completed" : ""}
        </span>
        <ChevronDown
          size={13}
          strokeWidth={2}
          className="ml-auto transition-transform"
          style={{ color: "var(--ink-3)", transform: open ? "rotate(180deg)" : "none" }}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="space-y-1.5 px-3 pb-3">
              {steps.map((s) => (
                <div key={s.id} className="flex items-start gap-2 text-xs">
                  <span className="mt-0.5 flex size-3.5 shrink-0 items-center justify-center">
                    <StepIcon status={s.status} />
                  </span>
                  <span
                    style={{
                      color:
                        s.status === "pending"
                          ? "var(--ink-3)"
                          : s.status === "error"
                            ? "var(--bad)"
                            : "var(--ink-2)",
                      fontWeight: s.status === "active" ? 500 : 400,
                    }}
                  >
                    {s.label}
                    {s.detail && (
                      <span style={{ color: "var(--ink-3)" }}> — {s.detail}</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
