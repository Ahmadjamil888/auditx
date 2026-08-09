import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  GitFork,
  Loader2,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import { Btn, Panel, StatusPill } from "@/components/kit";
import { useAuth } from "@/lib/auth-context";
import { useReconciliationFlags, useResolveFlag } from "@/lib/data-hooks";
import { explainAnomaly } from "@/lib/ai-service";

export const Route = createFileRoute("/app/reconciliation")({
  component: Reconciliation,
});

type FlagSeverity = "ok" | "warn" | "bad";

function Reconciliation() {
  const { profile } = useAuth();
  const [broker, setBroker]     = useState("Meridian Capital");
  const [dateRange, setDateRange] = useState("2025-07-01 – 2025-08-31");
  const [running, setRunning]   = useState(false);
  const [ran, setRan]           = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [resolved, setResolved] = useState<Set<string>>(new Set());
  const [aiExplanations, setAiExplanations] = useState<Record<string, string>>({});
  const [loadingAI, setLoadingAI] = useState<string | null>(null);

  const { data: allFlags = [] } = useReconciliationFlags(profile?.org_id);
  const resolveMutation = useResolveFlag();

  const active = allFlags.filter((f) => !resolved.has(f.id));

  async function runReconciliation() {
    setRunning(true);
    setRan(false);
    await new Promise((r) => setTimeout(r, 1800));
    setRunning(false);
    setRan(true);
  }

  async function fetchAIExplanation(flag: typeof allFlags[0]) {
    setLoadingAI(flag.id);
    try {
      const result = await explainAnomaly(
        flag.flag_type,
        flag.expected,
        flag.actual,
        flag.ticker,
        profile?.jurisdiction ?? "PSX",
      );
      setAiExplanations((prev) => ({ ...prev, [flag.id]: result.summary }));
    } catch {
      setAiExplanations((prev) => ({ ...prev, [flag.id]: "AI explanation unavailable — check your API key." }));
    } finally {
      setLoadingAI(null);
    }
  }

  function handleResolve(flagId: string) {
    if (!profile?.org_id) {
      console.error("Cannot resolve flag: user profile missing");
      return;
    }
    
    resolveMutation.mutate(
      { flagId, orgId: profile.org_id },
      {
        onSuccess: () => {
          setResolved((p) => new Set([...p, flagId]));
          setExpanded(null);
        },
        onError: (error) => {
          console.error("Failed to resolve flag:", error);
          // You could add toast notification here
        }
      }
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div>
        <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "1.5rem" }}>Reconciliation</h1>
        <p className="mt-0.5 text-sm" style={{ color: "var(--ink-2)" }}>
          Deterministic rule engine — no AI guesswork. Diff-matches ledger vs broker statement.
        </p>
      </div>

      {/* Run panel */}
      <Panel>
        <p className="text-sm font-semibold">Run Reconciliation</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--ink-2)" }}>
              Broker account
            </label>
            <select
              value={broker}
              onChange={(e) => setBroker(e.target.value)}
              className="w-full rounded-[10px] border bg-white px-3 py-2.5 text-sm outline-none"
              style={{ borderColor: "var(--hairline)" }}
            >
              <option>Meridian Capital</option>
              <option>SouthPort Securities</option>
              <option>Nifty Desk</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--ink-2)" }}>
              Date range
            </label>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="w-full rounded-[10px] border bg-white px-3 py-2.5 text-sm outline-none"
              style={{ borderColor: "var(--hairline)" }}
            >
              <option>2025-07-01 – 2025-08-31</option>
              <option>2025-01-01 – 2025-06-30</option>
              <option>2024-07-01 – 2024-12-31</option>
            </select>
          </div>
          <div className="flex items-end">
            <Btn
              onClick={runReconciliation}
              disabled={running}
              className="w-full"
            >
              {running ? (
                <>
                  <Loader2 size={16} strokeWidth={1.75} className="animate-spin" />
                  Running…
                </>
              ) : (
                <>
                  <GitFork size={16} strokeWidth={1.75} />
                  Run Reconciliation
                </>
              )}
            </Btn>
          </div>
        </div>
      </Panel>

      {/* Results */}
      <AnimatePresence>
        {ran && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            {/* Summary */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "Total flags",   value: allFlags.length,  tone: "warn" as FlagSeverity },
                { label: "Resolved",      value: resolved.size,    tone: "ok"   as FlagSeverity },
                { label: "Open",          value: active.length,    tone: active.length > 0 ? ("bad" as FlagSeverity) : ("ok" as FlagSeverity) },
              ].map(({ label, value, tone }) => (
                <Panel key={label} className="text-center">
                  <p className="tnum text-2xl font-semibold">{value}</p>
                  <p className="mt-1 text-xs" style={{ color: "var(--ink-2)" }}>{label}</p>
                  <div className="mt-2 flex justify-center">
                    <StatusPill tone={tone}>{tone === "ok" ? "ok" : tone === "warn" ? "review" : "open"}</StatusPill>
                  </div>
                </Panel>
              ))}
            </div>

            {/* Flags table */}
            {active.length > 0 ? (
              <div
                className="overflow-hidden rounded-2xl bg-white"
                style={{ border: "1px solid var(--hairline)" }}
              >
                <div className="border-b px-5 py-4" style={{ borderColor: "var(--hairline)" }}>
                  <p className="text-sm font-semibold">Open Flags</p>
                </div>
                <div className="divide-y" style={{ borderColor: "var(--hairline)" }}>
                  {active.map((flag) => (
                    <div key={flag.id}>
                      <button
                        type="button"
                        className="w-full px-5 py-4 text-left transition-colors hover:bg-black/5"
                        onClick={() => setExpanded(expanded === flag.id ? null : flag.id)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <AlertTriangle
                              size={16}
                              strokeWidth={1.75}
                              style={{ color: flag.severity === "bad" ? "var(--bad)" : "var(--warn)", flexShrink: 0 }}
                            />
                            <div>
                              <p className="text-sm font-medium">{flag.flag_type}</p>
                              <p className="text-xs" style={{ color: "var(--ink-3)" }}>
                                {flag.ticker} · {flag.ref_id}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <StatusPill tone={flag.severity}>
                              {flag.severity === "bad" ? "Critical" : "Warning"}
                            </StatusPill>
                            {expanded === flag.id ? (
                              <ChevronUp size={16} strokeWidth={1.75} style={{ color: "var(--ink-3)" }} />
                            ) : (
                              <ChevronDown size={16} strokeWidth={1.75} style={{ color: "var(--ink-3)" }} />
                            )}
                          </div>
                        </div>
                      </button>

                      <AnimatePresence>
                        {expanded === flag.id && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="border-t px-5 pb-5 pt-4" style={{ borderColor: "var(--hairline)", background: "rgba(25,40,55,0.015)" }}>
                              <p className="text-sm" style={{ color: "var(--ink-2)" }}>
                                {flag.description}
                              </p>

                              {/* Expected vs actual */}
                              <div className="mt-4 grid grid-cols-2 gap-4">
                                <div className="rounded-xl p-3" style={{ background: "rgba(31,157,99,0.06)" }}>
                                  <p className="text-xs font-medium" style={{ color: "var(--ok)" }}>Expected</p>
                                  <p className="tnum mt-1 text-lg font-semibold">
                                    {typeof flag.expected === "number" ? flag.expected.toLocaleString("en-PK", { maximumFractionDigits: 2 }) : flag.expected}
                                  </p>
                                </div>
                                <div className="rounded-xl p-3" style={{ background: "rgba(214,69,69,0.06)" }}>
                                  <p className="text-xs font-medium" style={{ color: "var(--bad)" }}>Actual</p>
                                  <p className="tnum mt-1 text-lg font-semibold">
                                    {typeof flag.actual === "number" ? flag.actual.toLocaleString("en-PK", { maximumFractionDigits: 2 }) : flag.actual}
                                  </p>
                                </div>
                              </div>

                              <div className="mt-4 rounded-xl p-3 text-sm" style={{ background: "rgba(115,66,226,0.06)" }}>
                                <span className="font-medium" style={{ color: "var(--color-accent)" }}>Suggested: </span>
                                <span style={{ color: "var(--ink-2)" }}>{flag.suggested_resolution}</span>
                              </div>

                              {/* AI Explanation */}
                              <div className="mt-3">
                                {aiExplanations[flag.id] ? (
                                  <div className="rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(115,66,226,0.04)", border: "1px solid rgba(115,66,226,0.12)" }}>
                                    <div className="flex items-center gap-1.5 mb-1">
                                      <Sparkles size={13} strokeWidth={1.75} style={{ color: "var(--color-accent)" }} />
                                      <span className="text-xs font-semibold" style={{ color: "var(--color-accent)" }}>Gemini AI</span>
                                    </div>
                                    <p style={{ color: "var(--ink-2)" }}>{aiExplanations[flag.id]}</p>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => fetchAIExplanation(flag)}
                                    disabled={loadingAI === flag.id}
                                    className="flex items-center gap-1.5 text-xs font-medium disabled:opacity-50"
                                    style={{ color: "var(--color-accent)" }}
                                  >
                                    <Sparkles size={13} strokeWidth={1.75} />
                                    {loadingAI === flag.id ? "Asking Gemini…" : "Explain with AI"}
                                  </button>
                                )}
                              </div>

                              <div className="mt-4 flex gap-2">
                                <Btn
                                  variant="primary"
                                  onClick={() => handleResolve(flag.id)}
                                  disabled={resolveMutation.isPending}
                                >
                                  {resolveMutation.isPending ? (
                                    <Loader2 size={15} strokeWidth={1.75} className="animate-spin" />
                                  ) : (
                                    <CheckCircle2 size={15} strokeWidth={1.75} />
                                  )}
                                  {resolveMutation.isPending ? "Applying..." : "Apply fix"}
                                </Btn>
                                <Btn
                                  variant="secondary"
                                  onClick={() => handleResolve(flag.id)}
                                  disabled={resolveMutation.isPending}
                                >
                                  Mark as expected
                                </Btn>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <Panel className="py-12 text-center">
                <CheckCircle2 size={32} strokeWidth={1.5} className="mx-auto mb-3" style={{ color: "var(--ok)" }} />
                <p className="font-semibold">All flags resolved</p>
                <p className="mt-1 text-sm" style={{ color: "var(--ink-3)" }}>
                  No open discrepancies for {broker} in the selected range.
                </p>
              </Panel>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {!ran && !running && (
        <div className="flex flex-col items-center justify-center rounded-2xl py-20" style={{ background: "var(--color-login-bg)" }}>
          <GitFork size={36} strokeWidth={1.5} style={{ color: "var(--ink-3)" }} />
          <p className="mt-3 font-medium">No reconciliation run yet</p>
          <p className="mt-1 text-sm" style={{ color: "var(--ink-3)" }}>
            Configure a broker account and date range above, then run.
          </p>
        </div>
      )}
    </div>
  );
}
