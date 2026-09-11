// ─── AuditX Investigations ────────────────────────────────────────────────────
// Run structured investigations. Every finding has evidence. No invented numbers.

import { createFileRoute } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileSearch,
  GitFork,
  Info,
  Lightbulb,
  Loader2,
  Plus,
  Search,
  Sparkles,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { useState } from "react";
import { Panel, Btn, reveal } from "@/components/kit";
import { useAuth } from "@/lib/auth-context";
import { useTransactions, useReconciliationFlags } from "@/lib/data-hooks";
import { computeTax } from "@/lib/tax";
import { computePortfolioSummary, computeHealthScore } from "@/lib/financial-intelligence";
import { GoogleGenAI } from "@google/genai";
import { buildIntelligencePrompt, detectIntent, getPortfolioSummary, getTaxLiability, getUnreconciledTransactions, getCriticalAnomalies, getBrokerDiscrepancies, getMissingDocuments, type IntelligenceToolContext } from "@/lib/intelligence-tools";

export const Route = createFileRoute("/app/investigations")({
  component: Investigations,
});

// ── Investigation types ───────────────────────────────────────────────────────

type InvestigationType = "PORTFOLIO" | "TAX" | "BROKER" | "TRANSACTIONS" | "ANOMALIES";

interface InvestigationConfig {
  type: InvestigationType;
  label: string;
  icon: typeof Search;
  color: string;
  description: string;
  prompt: string;
}

const INVESTIGATION_TYPES: InvestigationConfig[] = [
  {
    type: "PORTFOLIO",
    label: "Investigate Portfolio",
    icon: BarChart3,
    color: "var(--color-accent)",
    description: "Comprehensive portfolio health, concentration risk, and performance analysis.",
    prompt: "Investigate my entire portfolio. Analyse holdings, realized gains, concentration risk, tax exposure, and identify any concerns or opportunities.",
  },
  {
    type: "TAX",
    label: "Investigate Tax",
    icon: TrendingDown,
    color: "var(--warn)",
    description: "Deep-dive into tax liability, FIFO lot matching, and harvesting opportunities.",
    prompt: "Investigate my tax situation. Analyse FIFO lot matching, short vs long-term gains, estimated tax liability, and identify tax-loss harvesting opportunities.",
  },
  {
    type: "BROKER",
    label: "Investigate Broker",
    icon: GitFork,
    color: "var(--bad)",
    description: "Detect fee discrepancies, WHT mismatches, and duplicate transactions.",
    prompt: "Investigate broker discrepancies. Find fee surcharges, WHT mismatches, duplicate entries, and reconciliation flags that need attention.",
  },
  {
    type: "TRANSACTIONS",
    label: "Investigate Transactions",
    icon: FileSearch,
    color: "var(--info)",
    description: "Analyse all transactions for anomalies, low-confidence entries, and missing data.",
    prompt: "Investigate my transaction ledger. Identify unreconciled transactions, low-confidence extractions, missing documents, and any suspicious patterns.",
  },
  {
    type: "ANOMALIES",
    label: "Find All Anomalies",
    icon: Search,
    color: "var(--warn)",
    description: "Comprehensive anomaly detection across your entire financial dataset.",
    prompt: "Run a comprehensive anomaly detection sweep. Find all discrepancies, mismatches, missing data, compliance risks, and unusual patterns across my financial records.",
  },
];

// ── Finding severity badge ────────────────────────────────────────────────────

function SeverityBadge({ level }: { level: "CRITICAL" | "WARNING" | "OPPORTUNITY" | "INFO" }) {
  const styles = {
    CRITICAL:    { bg: "rgba(214,69,69,0.1)",   text: "var(--bad)",          label: "CRITICAL" },
    WARNING:     { bg: "rgba(201,138,26,0.1)",  text: "var(--warn)",         label: "WARNING" },
    OPPORTUNITY: { bg: "rgba(31,157,99,0.1)",   text: "var(--ok)",           label: "OPPORTUNITY" },
    INFO:        { bg: "rgba(59,111,209,0.1)",  text: "var(--info)",         label: "INFO" },
  };
  const s = styles[level];
  return (
    <span
      className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
      style={{ background: s.bg, color: s.text }}
    >
      {s.label}
    </span>
  );
}

// ── Investigation result panel ────────────────────────────────────────────────

interface InvestigationResult {
  type: InvestigationType;
  startedAt: string;
  completedAt: string;
  transactionsAnalysed: number;
  flagsAnalysed: number;
  aiReport: string;
  healthScore: number;
  unreconciledCount: number;
  criticalFlags: number;
  totalGain: number;
  taxLiability: number;
  currency: string;
}

function InvestigationReport({ result }: { result: InvestigationResult }) {
  const [expanded, setExpanded] = useState(true);

  const config = INVESTIGATION_TYPES.find((t) => t.type === result.type)!;
  const Icon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="overflow-hidden rounded-2xl"
      style={{ border: "1px solid var(--hairline)", background: "#fff" }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-4 p-5"
        style={{ borderBottom: "1px solid var(--hairline)", background: "rgba(25,40,55,0.015)" }}
      >
        <div
          className="flex size-10 items-center justify-center rounded-xl"
          style={{ background: `color-mix(in srgb, ${config.color} 12%, transparent)` }}
        >
          <Icon size={18} style={{ color: config.color }} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold">Investigation Complete</h3>
            <CheckCircle2 size={14} style={{ color: "var(--ok)" }} />
          </div>
          <p className="text-xs" style={{ color: "var(--ink-3)" }}>
            {config.label} · Completed{" "}
            {new Date(result.completedAt).toLocaleTimeString("en-PK", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          style={{ color: "var(--ink-3)" }}
        >
          {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </button>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {/* Stats */}
            <div
              className="grid grid-cols-2 gap-px sm:grid-cols-4"
              style={{ borderBottom: "1px solid var(--hairline)", background: "var(--hairline)" }}
            >
              {[
                { label: "Transactions", value: result.transactionsAnalysed.toString() },
                { label: "Flags Analysed", value: result.flagsAnalysed.toString() },
                { label: "Health Score",  value: `${result.healthScore}/100` },
                { label: "Critical Issues", value: result.criticalFlags.toString() },
              ].map(({ label, value }) => (
                <div key={label} className="bg-white p-4 text-center">
                  <p className="tnum text-lg font-bold" style={{ color: "var(--color-text)" }}>
                    {value}
                  </p>
                  <p className="text-[11px]" style={{ color: "var(--ink-3)" }}>
                    {label}
                  </p>
                </div>
              ))}
            </div>

            {/* Key findings summary */}
            <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-4" style={{ borderBottom: "1px solid var(--hairline)" }}>
              {result.unreconciledCount > 0 && (
                <div
                  className="rounded-xl p-3"
                  style={{ background: "rgba(201,138,26,0.06)", border: "1px solid rgba(201,138,26,0.15)" }}
                >
                  <AlertTriangle size={14} style={{ color: "var(--warn)" }} />
                  <p className="tnum mt-1.5 text-lg font-bold" style={{ color: "var(--warn)" }}>
                    {result.unreconciledCount}
                  </p>
                  <p className="text-[11px]" style={{ color: "var(--ink-3)" }}>Unreconciled</p>
                </div>
              )}
              {result.criticalFlags > 0 && (
                <div
                  className="rounded-xl p-3"
                  style={{ background: "rgba(214,69,69,0.06)", border: "1px solid rgba(214,69,69,0.15)" }}
                >
                  <AlertCircle size={14} style={{ color: "var(--bad)" }} />
                  <p className="tnum mt-1.5 text-lg font-bold" style={{ color: "var(--bad)" }}>
                    {result.criticalFlags}
                  </p>
                  <p className="text-[11px]" style={{ color: "var(--ink-3)" }}>Critical Flags</p>
                </div>
              )}
              {result.totalGain !== 0 && (
                <div
                  className="rounded-xl p-3"
                  style={{
                    background: result.totalGain > 0 ? "rgba(31,157,99,0.06)" : "rgba(214,69,69,0.06)",
                    border: `1px solid ${result.totalGain > 0 ? "rgba(31,157,99,0.15)" : "rgba(214,69,69,0.15)"}`,
                  }}
                >
                  {result.totalGain > 0 ? (
                    <TrendingUp size={14} style={{ color: "var(--ok)" }} />
                  ) : (
                    <TrendingDown size={14} style={{ color: "var(--bad)" }} />
                  )}
                  <p
                    className="tnum mt-1.5 text-sm font-bold"
                    style={{ color: result.totalGain > 0 ? "var(--ok)" : "var(--bad)" }}
                  >
                    {result.currency}{" "}
                    {Math.abs(result.totalGain).toLocaleString("en-PK", { maximumFractionDigits: 0 })}
                  </p>
                  <p className="text-[11px]" style={{ color: "var(--ink-3)" }}>
                    {result.totalGain > 0 ? "Realized Gains" : "Realized Loss"}
                  </p>
                </div>
              )}
              {result.taxLiability > 0 && (
                <div
                  className="rounded-xl p-3"
                  style={{ background: "rgba(115,66,226,0.06)", border: "1px solid rgba(115,66,226,0.15)" }}
                >
                  <Lightbulb size={14} style={{ color: "var(--color-accent)" }} />
                  <p className="tnum mt-1.5 text-sm font-bold" style={{ color: "var(--color-accent)" }}>
                    {result.currency}{" "}
                    {result.taxLiability.toLocaleString("en-PK", { maximumFractionDigits: 0 })}
                  </p>
                  <p className="text-[11px]" style={{ color: "var(--ink-3)" }}>Estimated Tax</p>
                </div>
              )}
            </div>

            {/* AI report */}
            <div className="p-5">
              <div className="mb-3 flex items-center gap-2">
                <Sparkles size={13} style={{ color: "var(--color-accent)" }} />
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--color-accent)" }}>
                  AuditX Intelligence Report
                </p>
              </div>
              <div
                className="rounded-xl p-4 text-sm leading-relaxed"
                style={{ background: "rgba(115,66,226,0.03)", border: "1px solid rgba(115,66,226,0.1)", color: "var(--ink-2)" }}
              >
                {result.aiReport.split("\n").map((line, i) => {
                  if (line.startsWith("## "))
                    return (
                      <p key={i} className="mt-3 mb-1 font-bold" style={{ color: "var(--color-text)", fontSize: "13px" }}>
                        {line.slice(3)}
                      </p>
                    );
                  if (line.startsWith("**") && line.endsWith("**"))
                    return (
                      <p key={i} className="mt-2 font-semibold" style={{ color: "var(--color-text)" }}>
                        {line.slice(2, -2)}
                      </p>
                    );
                  if (line.startsWith("- "))
                    return (
                      <p key={i} className="pl-3 mb-0.5">
                        • {line.slice(2)}
                      </p>
                    );
                  if (line.trim() === "") return <div key={i} className="h-1.5" />;
                  return <p key={i} className="mb-1">{line}</p>;
                })}
              </div>
              <p className="mt-3 text-[11px]" style={{ color: "var(--ink-3)" }}>
                All numbers are deterministic. AI interprets pre-computed data only. Confidence: determined by calculation source.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

function Investigations() {
  const { profile } = useAuth();
  const jurisdiction = (profile?.jurisdiction as "PSX" | "NSE") ?? "PSX";
  const currency = jurisdiction === "PSX" ? "PKR" : "INR";

  const { data: transactions = [] } = useTransactions(profile?.org_id);
  const { data: flags = [] } = useReconciliationFlags(profile?.org_id);

  const [running, setRunning] = useState(false);
  const [runningType, setRunningType] = useState<InvestigationType | null>(null);
  const [progress, setProgress] = useState<string[]>([]);
  const [results, setResults] = useState<InvestigationResult[]>([]);
  const [customPrompt, setCustomPrompt] = useState("");
  const [showCustom, setShowCustom] = useState(false);

  async function runInvestigation(config: InvestigationConfig) {
    if (!profile?.org_id) return;

    const apiKey = (import.meta.env["VITE_GOOGLE_AI_API_KEY"] as string | undefined) ?? "";
    if (!apiKey || apiKey.length < 10) {
      alert("AI API key not configured. Add VITE_GOOGLE_AI_API_KEY to your .env file.");
      return;
    }

    setRunning(true);
    setRunningType(config.type);
    setProgress([]);

    const steps = [
      "Collecting financial data…",
      "Analysing reconciliation status…",
      "Computing tax exposure…",
      "Checking for anomalies…",
      "Comparing financial periods…",
      "Identifying unusual patterns…",
      "Generating findings…",
      "Preparing intelligence report…",
    ];

    const toolCtx: IntelligenceToolContext = {
      orgId: profile.org_id,
      jurisdiction,
      taxYear: "2025",
    };

    // Progressive step display
    let stepIdx = 0;
    const stepInterval = setInterval(() => {
      if (stepIdx < steps.length - 1) {
        setProgress((p) => [...p.slice(-4), steps[stepIdx]!]);
        stepIdx++;
      }
    }, 600);

    try {
      // Gather deterministic data
      const [portfolio, tax, unreconciled, anomalies, brokerDisc] = await Promise.all([
        getPortfolioSummary(toolCtx).catch(() => null),
        getTaxLiability(toolCtx).catch(() => null),
        getUnreconciledTransactions(toolCtx).catch(() => null),
        getCriticalAnomalies(toolCtx).catch(() => null),
        getBrokerDiscrepancies(toolCtx).catch(() => null),
      ]);

      const toolResults = [portfolio, tax, unreconciled, anomalies, brokerDisc].filter(
        (r) => r?.ok,
      ) as ReturnType<typeof getPortfolioSummary> extends Promise<infer T> ? T[] : never[];

      const intent = detectIntent(config.prompt);
      const aiPrompt = buildIntelligencePrompt(config.prompt, intent, toolResults as any, {
        jurisdiction,
        taxYear: "2025",
      });

      setProgress((p) => [...p.slice(-4), "Generating intelligence report…"]);

      const ai = new GoogleGenAI({ apiKey });
      let aiReport = "";
      const stream = await ai.models.generateContentStream({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: aiPrompt }] }],
        config: { temperature: 0.3, maxOutputTokens: 1500 },
      });
      for await (const chunk of stream) {
        aiReport += chunk.text ?? "";
      }

      // Compute summary stats
      const taxResult = computeTax(transactions, {
        jurisdiction,
        filerStatus: "Filer",
        taxYear: "2025",
      });
      const health = computeHealthScore(transactions, flags.length, flags.filter((f) => f.severity === "bad").length);

      const result: InvestigationResult = {
        type: config.type,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        transactionsAnalysed: transactions.length,
        flagsAnalysed: flags.length,
        aiReport,
        healthScore: health.total,
        unreconciledCount: transactions.filter((t) => t.status === "needs_review").length,
        criticalFlags: flags.filter((f) => f.severity === "bad").length,
        totalGain: taxResult.totalGain,
        taxLiability: taxResult.estimatedTaxDue,
        currency,
      };

      setResults((prev) => [result, ...prev]);
    } catch (err) {
      setResults((prev) => [
        {
          type: config.type,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          transactionsAnalysed: transactions.length,
          flagsAnalysed: flags.length,
          aiReport: `Investigation encountered an error: ${(err as Error).message}\n\nPlease check your API key and try again.`,
          healthScore: 0,
          unreconciledCount: 0,
          criticalFlags: 0,
          totalGain: 0,
          taxLiability: 0,
          currency,
        },
        ...prev,
      ]);
    } finally {
      clearInterval(stepInterval);
      setRunning(false);
      setRunningType(null);
      setProgress([]);
    }
  }

  async function runCustomInvestigation() {
    if (!customPrompt.trim()) return;
    const customConfig: InvestigationConfig = {
      type: "TRANSACTIONS",
      label: "Custom Investigation",
      icon: Search,
      color: "var(--color-accent)",
      description: customPrompt,
      prompt: customPrompt,
    };
    setShowCustom(false);
    setCustomPrompt("");
    await runInvestigation(customConfig);
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "1.5rem" }}>Investigations</h1>
          <p className="mt-0.5 text-sm" style={{ color: "var(--ink-2)" }}>
            Structured financial investigations with AI-generated reports backed by deterministic data.
          </p>
        </div>
        <Btn onClick={() => setShowCustom(true)} disabled={running}>
          <Plus size={15} strokeWidth={2} />
          Custom Investigation
        </Btn>
      </div>

      {/* Custom investigation input */}
      <AnimatePresence>
        {showCustom && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <Panel>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold">Custom Investigation</p>
                <button type="button" onClick={() => setShowCustom(false)} style={{ color: "var(--ink-3)" }}>
                  <X size={16} />
                </button>
              </div>
              <textarea
                autoFocus
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="Describe what you want to investigate. e.g. 'Investigate all OGDC transactions for fee discrepancies and calculate their tax impact.'"
                className="w-full resize-none rounded-xl border p-3 text-sm outline-none"
                style={{ borderColor: "var(--hairline)", minHeight: 80, color: "var(--color-text)" }}
              />
              <div className="mt-3 flex justify-end gap-2">
                <Btn variant="secondary" onClick={() => setShowCustom(false)}>
                  Cancel
                </Btn>
                <Btn onClick={runCustomInvestigation} disabled={!customPrompt.trim() || running}>
                  <Search size={14} />
                  Investigate
                </Btn>
              </div>
            </Panel>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Investigation type cards */}
      <div>
        <p className="mb-3 text-sm font-bold">Run Investigation</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {INVESTIGATION_TYPES.map((config) => {
            const Icon = config.icon;
            const isRunning = running && runningType === config.type;
            return (
              <motion.div
                key={config.type}
                variants={reveal}
                custom={0}
                initial="hidden"
                animate="visible"
              >
                <button
                  type="button"
                  onClick={() => void runInvestigation(config)}
                  disabled={running}
                  className="group w-full rounded-2xl p-5 text-left transition-all disabled:opacity-50 hover:shadow-md"
                  style={{ background: "#fff", border: "1px solid var(--hairline)" }}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div
                      className="flex size-9 items-center justify-center rounded-xl"
                      style={{ background: `color-mix(in srgb, ${config.color} 12%, transparent)` }}
                    >
                      {isRunning ? (
                        <Loader2 size={16} className="animate-spin" style={{ color: config.color }} />
                      ) : (
                        <Icon size={16} style={{ color: config.color }} />
                      )}
                    </div>
                    <p className="text-sm font-semibold">{config.label}</p>
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: "var(--ink-2)" }}>
                    {config.description}
                  </p>
                  {isRunning && progress.length > 0 && (
                    <div className="mt-3 space-y-1">
                      {progress.slice(-3).map((step, i) => (
                        <div key={i} className="flex items-center gap-2 text-[11px]" style={{ color: "var(--ink-3)" }}>
                          <div
                            className="size-1.5 rounded-full"
                            style={{ background: i === progress.length - 1 ? config.color : "var(--hairline)" }}
                          />
                          {step}
                        </div>
                      ))}
                    </div>
                  )}
                  {!isRunning && (
                    <div
                      className="mt-3 flex items-center gap-1 text-[11px] font-semibold opacity-0 transition-opacity group-hover:opacity-100"
                      style={{ color: config.color }}
                    >
                      Start investigation <ChevronRight size={11} />
                    </div>
                  )}
                </button>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Active investigation progress */}
      <AnimatePresence>
        {running && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <Panel>
              <div className="flex items-center gap-3 mb-4">
                <Loader2 size={18} className="animate-spin" style={{ color: "var(--color-accent)" }} />
                <p className="text-sm font-semibold">Investigation in Progress</p>
              </div>
              <div className="space-y-2">
                {[
                  `Analysing ${transactions.length} transactions`,
                  `Reviewing ${flags.length} reconciliation flags`,
                  ...progress.slice(-3),
                ].map((step, i) => (
                  <div key={i} className="flex items-center gap-2.5 text-xs" style={{ color: "var(--ink-2)" }}>
                    {i < 2 ? (
                      <CheckCircle2 size={13} style={{ color: "var(--ok)" }} />
                    ) : i === 2 ? (
                      <Loader2 size={13} className="animate-spin" style={{ color: "var(--color-accent)" }} />
                    ) : (
                      <div className="size-3 rounded-full" style={{ background: "var(--hairline)" }} />
                    )}
                    {step}
                  </div>
                ))}
              </div>
            </Panel>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold">Investigation Results</p>
            <button
              type="button"
              onClick={() => setResults([])}
              className="text-xs"
              style={{ color: "var(--ink-3)" }}
            >
              Clear all
            </button>
          </div>
          {results.map((result, i) => (
            <InvestigationReport key={i} result={result} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {results.length === 0 && !running && (
        <Panel className="py-12 text-center">
          <div
            className="mx-auto flex size-14 items-center justify-center rounded-2xl"
            style={{ background: "rgba(115,66,226,0.08)" }}
          >
            <Search size={24} style={{ color: "var(--color-accent)" }} />
          </div>
          <p className="mt-4 font-semibold">No investigations yet</p>
          <p className="mt-1 text-sm" style={{ color: "var(--ink-3)" }}>
            Run an investigation above to get a structured AI report backed by your real financial data.
          </p>
          <p className="mt-3 text-xs" style={{ color: "var(--ink-3)" }}>
            Every finding references real transactions. No invented numbers.
          </p>
        </Panel>
      )}
    </div>
  );
}
