// ─── AuditX Mission Control Dashboard ────────────────────────────────────────
// "What is happening in my financial world right now?"
// Every number is deterministic. AI only explains.

import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  FileSearch,
  GitFork,
  Search,
  Sparkles,
  TrendingUp,
  Upload,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { reveal, Panel } from "@/components/kit";
import { useAuth } from "@/lib/auth-context";
import { useTransactions, useReconciliationFlags } from "@/lib/data-hooks";
import { computeTax } from "@/lib/tax";
import {
  useHealthScore,
  usePortfolioSummary,
  usePriorities,
  useFinancialEvents,
  useFinancialInsights,
  useDailyBriefing,
} from "@/lib/financial-intelligence-hooks";
import { DailyBriefing } from "@/components/intelligence/DailyBriefing";
import { FinancialHealthScore } from "@/components/intelligence/FinancialHealthScore";
import { PriorityCard, PriorityCardSkeleton } from "@/components/intelligence/PriorityCard";
import {
  FinancialTimeline,
  generateTimelineFromTransactions,
} from "@/components/intelligence/FinancialTimeline";
import { InsightCard, InsightCardEmpty } from "@/components/intelligence/InsightCard";
import { useCommandBar } from "@/components/intelligence/AuditXCommandBar";
import type { InsightData } from "@/components/intelligence/InsightCard";
import type { EventSeverity } from "@/lib/financial-intelligence";

export const Route = createFileRoute("/app/overview")({
  component: MissionControl,
});

const allocationColors = ["#7342E2", "#8F63EA", "#1F9D63", "#3B6FD1", "#C98A1A", "#CFC8C5"];

// ── Metric Card ───────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  sub,
  tone,
  i,
  askWhy,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "ok" | "bad" | "warn" | "info";
  i: number;
  askWhy?: string;
}) {
  const { setOpen } = useCommandBar();

  const toneColors = {
    ok: "var(--ok)",
    bad: "var(--bad)",
    warn: "var(--warn)",
    info: "var(--color-accent)",
  };

  return (
    <motion.div variants={reveal} custom={i} initial="hidden" animate="visible">
      <div
        className="group relative overflow-hidden rounded-2xl bg-white p-5 transition-shadow hover:shadow-md"
        style={{ border: "1px solid var(--hairline)" }}
      >
        <p className="text-xs font-medium" style={{ color: "var(--ink-2)" }}>
          {label}
        </p>
        <p className="tnum mt-2 text-2xl font-bold" style={{ color: "var(--color-text)" }}>
          {value}
        </p>
        <p className="mt-1 text-xs" style={{ color: "var(--ink-3)" }}>
          {sub}
        </p>
        {askWhy && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mt-3 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold opacity-0 transition-all group-hover:opacity-100"
            style={{
              background: `color-mix(in srgb, ${toneColors[tone]} 10%, transparent)`,
              color: toneColors[tone],
              border: `1px solid color-mix(in srgb, ${toneColors[tone]} 20%, transparent)`,
            }}
          >
            <Sparkles size={10} />
            Why?
          </button>
        )}
      </div>
    </motion.div>
  );
}

// ── "AuditX Found Something" ─────────────────────────────────────────────────

function FoundSomethingSection({
  insights,
  flags,
  currency,
}: {
  insights: ReturnType<typeof useFinancialInsights>["data"];
  flags: ReturnType<typeof useReconciliationFlags>["data"];
  currency: string;
}) {
  // Build insight data from real sources
  const insightData: InsightData[] = [];

  // Convert DB financial insights
  for (const ins of (insights ?? []).slice(0, 3)) {
    insightData.push({
      id: ins.id,
      type: ins.insight_type,
      severity: ins.severity as EventSeverity,
      title: ins.title,
      summary: ins.summary,
      confidence: ins.confidence,
      evidenceCount: (ins.evidence_ids ?? []).length,
      actionLabel: "Investigate",
      actionLink: "/app/investigations",
      secondaryActionLabel: "View Evidence",
      secondaryActionLink: "/app/reconciliation",
    });
  }

  // Synthesize from reconciliation flags when no DB insights yet
  if (insightData.length === 0 && (flags ?? []).length > 0) {
    const criticalFlags = (flags ?? []).filter((f) => f.severity === "bad");
    const warnFlags = (flags ?? []).filter((f) => f.severity === "warn");

    if (criticalFlags.length > 0) {
      const totalImpact = criticalFlags.reduce(
        (s, f) => s + Math.abs((f.actual ?? 0) - (f.expected ?? 0)),
        0,
      );
      insightData.push({
        id: "synth-critical",
        type: "FEE_DISCREPANCY",
        severity: "CRITICAL",
        title: `${criticalFlags.length} Critical Reconciliation Flag${criticalFlags.length > 1 ? "s" : ""}`,
        summary: criticalFlags[0]?.description ?? "Critical data integrity issues detected requiring immediate review.",
        confidence: 0.95,
        financialImpact: totalImpact,
        currency,
        evidenceCount: criticalFlags.length,
        actionLabel: "Investigate",
        actionLink: "/app/investigations",
        secondaryActionLabel: "View Flags",
        secondaryActionLink: "/app/reconciliation",
      });
    }

    if (warnFlags.length > 0) {
      insightData.push({
        id: "synth-warn",
        type: "ANOMALY_DETECTED",
        severity: "HIGH",
        title: `${warnFlags.length} Potential Discrepanc${warnFlags.length > 1 ? "ies" : "y"} Detected`,
        summary: `AuditX identified ${warnFlags.length} transactions with reconciliation warnings that may affect your financial records.`,
        confidence: 0.88,
        evidenceCount: warnFlags.length,
        actionLabel: "Review",
        actionLink: "/app/reconciliation",
      });
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div
            className="flex size-8 items-center justify-center rounded-lg"
            style={{ background: "rgba(115,66,226,0.1)" }}
          >
            <Sparkles size={15} style={{ color: "var(--color-accent)" }} />
          </div>
          <div>
            <h2 className="text-sm font-bold">AuditX Found Something</h2>
            <p className="text-xs" style={{ color: "var(--ink-3)" }}>
              Proactively surfaced findings from your financial data
            </p>
          </div>
        </div>
        <Link
          to="/app/insights"
          className="flex items-center gap-1 text-xs font-semibold"
          style={{ color: "var(--color-accent)" }}
        >
          All insights <ChevronRight size={13} />
        </Link>
      </div>
      {insightData.length === 0 ? (
        <InsightCardEmpty />
      ) : (
        <div className="space-y-3">
          {insightData.map((ins, i) => (
            <InsightCard key={ins.id} insight={ins} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

function MissionControl() {
  const { profile } = useAuth();
  const jurisdiction = (profile?.jurisdiction as "PSX" | "NSE") ?? "PSX";
  const currency = jurisdiction === "PSX" ? "PKR" : "INR";

  const { data: transactions = [], isLoading: txLoading } = useTransactions(profile?.org_id);
  const { data: flags = [] } = useReconciliationFlags(profile?.org_id);
  const { score, isLoading: scoreLoading } = useHealthScore();
  const { summary } = usePortfolioSummary();
  const { priorities, isLoading: prioritiesLoading } = usePriorities();
  const { data: events = [], isLoading: eventsLoading } = useFinancialEvents(30);
  const { data: insights = [] } = useFinancialInsights(5);

  const tax = computeTax(transactions, { jurisdiction, filerStatus: "Filer", taxYear: "2025" });
  const unreconciledCount = transactions.filter((t) => t.status === "needs_review").length;

  // Portfolio allocation from positions
  const tickerMap: Record<string, number> = {};
  for (const tx of transactions) {
    if (tx.action === "BUY") tickerMap[tx.ticker] = (tickerMap[tx.ticker] ?? 0) + tx.quantity * tx.price;
    if (tx.action === "SELL") tickerMap[tx.ticker] = (tickerMap[tx.ticker] ?? 0) - tx.quantity * tx.price;
  }
  const allocationData = Object.entries(tickerMap)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, value], i) => ({ name, value: Math.round(value), color: allocationColors[i] ?? "#ccc" }));

  const totalPortfolioValue = allocationData.reduce((s, d) => s + d.value, 0);

  // Cumulative P&L chart
  const pnlByMonth: Record<string, number> = {};
  for (const lot of tax.lots) {
    const month = lot.sellDate?.slice(0, 7);
    if (month) pnlByMonth[month] = (pnlByMonth[month] ?? 0) + lot.gain;
  }
  const pnlData = Object.entries(pnlByMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .reduce<{ month: string; value: number }[]>((acc, [key, gain]) => {
      const prev = acc[acc.length - 1]?.value ?? 0;
      acc.push({ month: key.slice(5), value: Math.round(prev + gain) });
      return acc;
    }, []);

  // Timeline entries — use DB events if available, else synthesize
  const timelineEntries =
    events.length > 0
      ? events.map((e) => ({
          id: e.id,
          date: e.created_at,
          isToday: new Date(e.created_at).toDateString() === new Date().toDateString(),
          isYesterday:
            new Date(e.created_at).toDateString() ===
            new Date(Date.now() - 86400000).toDateString(),
          severity: e.severity as EventSeverity,
          title: e.title,
          description: e.description,
          confidence: e.confidence,
          eventType: e.event_type,
          actionLabel: "View details",
          actionLink: "/app/timeline",
        }))
      : generateTimelineFromTransactions(transactions, flags, currency);

  const fmt = (n: number) => n.toLocaleString("en-PK", { maximumFractionDigits: 0 });

  // Empty state
  if (!txLoading && transactions.length === 0) {
    return (
      <div className="flex min-h-[80vh] flex-col items-center justify-center p-6 text-center">
        <div
          className="flex size-20 items-center justify-center rounded-3xl"
          style={{ background: "rgba(115,66,226,0.08)" }}
        >
          <Zap size={36} style={{ color: "var(--color-accent)" }} />
        </div>
        <h1
          className="mt-6 text-2xl font-bold"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          Your Financial Intelligence Starts Here
        </h1>
        <p className="mt-3 max-w-md text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
          Upload your first broker statement. AuditX will extract transactions, reconcile records,
          calculate tax, find anomalies, and build your financial timeline.
        </p>
        <Link
          to="/app/parser"
          className="mt-6 flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white"
          style={{ background: "var(--color-accent)", boxShadow: "0 4px 24px rgba(115,66,226,0.3)" }}
        >
          <Upload size={16} />
          Upload your first statement
        </Link>
        <p className="mt-4 max-w-sm text-xs leading-relaxed" style={{ color: "var(--ink-3)" }}>
          Your finances don't need another dashboard. They need intelligence.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-[1400px]">
      {/* Daily Briefing */}
      <DailyBriefing />

      {/* Top row: Health Score + Metrics */}
      <div className="grid gap-4 lg:grid-cols-4">
        {/* Health Score */}
        <div className="lg:col-span-1">
          <FinancialHealthScore score={score} isLoading={scoreLoading} />
        </div>

        {/* Metric cards */}
        <div className="lg:col-span-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <MetricCard
            label="Portfolio Value"
            value={txLoading ? "—" : `${currency} ${fmt(totalPortfolioValue)}`}
            sub="Current positions"
            tone="info"
            i={0}
            askWhy="Why did my portfolio value change?"
          />
          <MetricCard
            label="Realized Gains YTD"
            value={`${currency} ${fmt(tax.totalGain)}`}
            sub="FIFO lot matching"
            tone={tax.totalGain >= 0 ? "ok" : "bad"}
            i={1}
            askWhy="Why did my realized gains change?"
          />
          <MetricCard
            label="Estimated Tax Liability"
            value={`${currency} ${fmt(tax.estimatedTaxDue)}`}
            sub={`FIFO · ${jurisdiction} Filer`}
            tone="warn"
            i={2}
            askWhy="Why did my estimated tax change?"
          />
          <MetricCard
            label="Unreconciled Items"
            value={String(unreconciledCount)}
            sub={unreconciledCount > 0 ? "Requires review" : "All matched"}
            tone={unreconciledCount > 0 ? "warn" : "ok"}
            i={3}
            askWhy="Why are these transactions unreconciled?"
          />
          <MetricCard
            label="Total Transactions"
            value={String(transactions.length)}
            sub="In your ledger"
            tone="info"
            i={4}
          />
          <MetricCard
            label="Open Flags"
            value={String(flags.length)}
            sub={flags.length > 0 ? "Need attention" : "Clean book"}
            tone={flags.length > 0 ? "warn" : "ok"}
            i={5}
          />
        </div>
      </div>

      {/* Priorities */}
      {(priorities.length > 0 || prioritiesLoading) && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold">Requires Attention</h2>
              <p className="text-xs" style={{ color: "var(--ink-3)" }}>
                AuditX-prioritised issues for your review
              </p>
            </div>
            <Link
              to="/app/reconciliation"
              className="flex items-center gap-1 text-xs font-semibold"
              style={{ color: "var(--color-accent)" }}
            >
              All issues <ChevronRight size={13} />
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {prioritiesLoading
              ? [0, 1, 2].map((i) => <PriorityCardSkeleton key={i} />)
              : priorities.slice(0, 3).map((p) => <PriorityCard key={p.id} priority={p} />)}
          </div>
        </div>
      )}

      {/* AuditX Found Something + Portfolio Charts */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* AuditX Found Something */}
        <div className="lg:col-span-2">
          <FoundSomethingSection insights={insights} flags={flags} currency={currency} />
        </div>

        {/* Holdings Allocation */}
        {allocationData.length > 0 && (
          <div>
            <Panel className="h-full">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm font-bold">Holdings</p>
                  <p className="text-xs" style={{ color: "var(--ink-3)" }}>
                    By ticker · current positions
                  </p>
                </div>
                <BarChart3 size={16} style={{ color: "var(--ink-3)" }} />
              </div>
              <div className="flex justify-center">
                <ResponsiveContainer width={140} height={140}>
                  <PieChart>
                    <Pie
                      data={allocationData}
                      cx="50%"
                      cy="50%"
                      innerRadius={42}
                      outerRadius={65}
                      dataKey="value"
                      paddingAngle={2}
                    >
                      {allocationData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid var(--hairline)" }}
                      formatter={(v: number) => [`${currency} ${fmt(v)}`, ""]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 space-y-1.5">
                {allocationData.map((d) => (
                  <div key={d.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5" style={{ color: "var(--ink-2)" }}>
                      <span
                        className="size-2 rounded-full shrink-0"
                        style={{ background: d.color }}
                      />
                      {d.name}
                    </div>
                    <span className="tnum font-medium" style={{ color: "var(--color-text)" }}>
                      {((d.value / totalPortfolioValue) * 100).toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        )}
      </div>

      {/* P&L Chart */}
      {pnlData.length > 0 && (
        <Panel>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-bold">Cumulative Realized P&L</p>
              <p className="text-xs" style={{ color: "var(--ink-3)" }}>
                {currency} · YTD 2025 · FIFO lot matching
              </p>
            </div>
            <TrendingUp size={16} style={{ color: "var(--color-accent)" }} />
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={pnlData} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#7342E2" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#7342E2" stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: "var(--ink-3)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--ink-3)" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip
                formatter={(v: number) => [`${currency} ${fmt(v)}`, "Realized P&L"]}
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 10,
                  border: "1px solid var(--hairline)",
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#7342E2"
                strokeWidth={2}
                fill="url(#pnlGrad)"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </Panel>
      )}

      {/* Financial Timeline */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold">Financial Timeline</h2>
            <p className="text-xs" style={{ color: "var(--ink-3)" }}>
              Meaningful financial events — automatically recorded
            </p>
          </div>
          <Link
            to="/app/timeline"
            className="flex items-center gap-1 text-xs font-semibold"
            style={{ color: "var(--color-accent)" }}
          >
            Full timeline <ChevronRight size={13} />
          </Link>
        </div>
        <Panel>
          <FinancialTimeline
            entries={timelineEntries.slice(0, 8)}
            isLoading={eventsLoading && transactions.length === 0}
          />
        </Panel>
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="mb-3 text-sm font-bold">Quick Actions</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { icon: Upload,     label: "Upload Statement",    to: "/app/parser",          color: "var(--color-accent)" },
            { icon: GitFork,    label: "Run Reconciliation",  to: "/app/reconciliation",  color: "var(--info)" },
            { icon: Search,     label: "New Investigation",   to: "/app/investigations",  color: "var(--warn)" },
            { icon: BarChart3,  label: "Tax Summary",         to: "/app/tax",             color: "var(--ok)" },
          ].map(({ icon: Ic, label, to, color }) => (
            <Link
              key={label}
              to={to}
              className="flex flex-col items-center gap-2 rounded-2xl bg-white py-5 text-center text-xs font-medium transition-shadow hover:shadow-md"
              style={{ border: "1px solid var(--hairline)" }}
            >
              <span
                className="flex size-10 items-center justify-center rounded-xl"
                style={{ background: `color-mix(in srgb, ${color} 10%, transparent)` }}
              >
                <Ic size={20} strokeWidth={1.75} style={{ color }} />
              </span>
              {label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
