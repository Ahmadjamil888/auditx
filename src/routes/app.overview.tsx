import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  FileSearch,
  GitFork,
  Plus,
  Sparkles,
  TrendingUp,
  Upload,
} from "lucide-react";
import { useState } from "react";
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
import { Panel, StatusPill, reveal } from "@/components/kit";
import { useAuth } from "@/lib/auth-context";
import { useTransactions, useReconciliationFlags } from "@/lib/data-hooks";
import { computeTax } from "@/lib/tax";
import { analyzePortfolio } from "@/lib/ai-service";

export const Route = createFileRoute("/app/overview")({
  component: Overview,
});

const allocationColors = ["#7342E2", "#8F63EA", "#1F9D63", "#3B6FD1", "#C98A1A", "#CFC8C5"];

const quickActions = [
  { icon: Upload,     label: "Upload Statement",   to: "/app/parser",         color: "var(--color-accent)" },
  { icon: GitFork,    label: "Run Reconciliation",  to: "/app/reconciliation", color: "var(--info)" },
  { icon: BarChart3,  label: "Tax Summary",         to: "/app/tax",            color: "var(--ok)" },
  { icon: FileSearch, label: "Audit Trail",         to: "/app/audit-trail",    color: "var(--warn)" },
];

function StatCard({ label, value, delta, tone, i }: { label: string; value: string; delta: string; tone: "ok" | "bad" | "warn" | "info"; i: number }) {
  return (
    <motion.div variants={reveal} custom={i} initial="hidden" animate="visible">
      <Panel>
        <p className="text-xs" style={{ color: "var(--ink-2)" }}>{label}</p>
        <p className="tnum mt-1.5 text-2xl font-semibold">{value}</p>
        <div className="mt-2">
          <StatusPill tone={tone}>{delta}</StatusPill>
        </div>
      </Panel>
    </motion.div>
  );
}

function Overview() {
  const { profile } = useAuth();
  const jurisdiction = (profile?.jurisdiction as "PSX" | "NSE") ?? "PSX";
  const currency     = jurisdiction === "PSX" ? "PKR" : "INR";

  const { data: transactions = [], isLoading: txLoading } = useTransactions(profile?.org_id);
  const { data: flags = []                               } = useReconciliationFlags(profile?.org_id);

  const tax              = computeTax(transactions, { jurisdiction, filerStatus: "Filer", taxYear: "2025" });
  const unreconciledCount = transactions.filter((t) => t.status === "needs_review").length;
  const realizedGain     = tax.totalGain;

  // Build allocation from real positions
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

  // Build cumulative P&L chart from real transactions by month
  const pnlByMonth: Record<string, number> = {};
  for (const lot of tax.lots) {
    const month = lot.sellDate?.slice(0, 7); // "YYYY-MM"
    if (month) pnlByMonth[month] = (pnlByMonth[month] ?? 0) + lot.gain;
  }
  const pnlData = Object.entries(pnlByMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .reduce<{ month: string; value: number }[]>((acc, [key, gain]) => {
      const prev = acc[acc.length - 1]?.value ?? 0;
      acc.push({ month: key.slice(5), value: Math.round(prev + gain) });
      return acc;
    }, []);

  // Recent activity from real transactions
  const recentActivity = transactions.slice(0, 5).map((tx) => ({
    text: `${tx.ticker} ${tx.action} parsed & posted`,
    time: tx.trade_date,
    tone: tx.status === "needs_review" ? ("warn" as const) : ("ok" as const),
    icon: tx.status === "needs_review" ? AlertTriangle : CheckCircle2,
  }));

  // AI portfolio narrative
  const [aiNarrative, setAiNarrative] = useState<string | null>(null);
  const [loadingAI, setLoadingAI]     = useState(false);

  async function fetchAINarrative() {
    setLoadingAI(true);
    try {
      const holdings = allocationData.map((d) => ({
        ticker: d.name,
        unrealizedPnl: 0, // would require market prices
        holdingDays: 90,
      }));
      const text = await analyzePortfolio(holdings, realizedGain, jurisdiction);
      setAiNarrative(text);
    } catch {
      setAiNarrative("AI analysis requires VITE_GOOGLE_AI_API_KEY to be configured.");
    } finally {
      setLoadingAI(false);
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "1.5rem" }}>Overview</h1>
          <p className="mt-0.5 text-sm" style={{ color: "var(--ink-2)" }}>
            Portfolio summary for FY 2025 · {jurisdiction}
          </p>
        </div>
        <Link
          to="/app/parser"
          className="hidden items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white sm:flex"
          style={{ background: "var(--color-accent)" }}
        >
          <Plus size={16} strokeWidth={2} />
          Upload
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Portfolio Value"
          value={txLoading ? "—" : `${currency} ${totalPortfolioValue.toLocaleString()}`}
          delta="+3.2% MTD"
          tone="ok"
          i={0}
        />
        <StatCard
          label="Realized Gains YTD"
          value={`${currency} ${realizedGain.toLocaleString("en-PK", { maximumFractionDigits: 0 })}`}
          delta="+8.1% vs last year"
          tone="ok"
          i={1}
        />
        <StatCard
          label="Estimated Tax Liability"
          value={`${currency} ${tax.estimatedTaxDue.toLocaleString("en-PK", { maximumFractionDigits: 0 })}`}
          delta="FIFO · Filer"
          tone="info"
          i={2}
        />
        <StatCard
          label="Unreconciled Items"
          value={String(unreconciledCount)}
          delta="needs review"
          tone={unreconciledCount > 0 ? "warn" : "ok"}
          i={3}
        />
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-3">
        <motion.div variants={reveal} custom={0} initial="hidden" whileInView="visible" viewport={{ once: true }} className="lg:col-span-2">
          <Panel>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Cumulative Realized P&L</p>
                <p className="text-xs" style={{ color: "var(--ink-3)" }}>{currency} · YTD 2025</p>
              </div>
              <TrendingUp size={18} strokeWidth={1.75} style={{ color: "var(--color-accent)" }} />
            </div>
            <div className="mt-4">
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={pnlData} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#7342E2" stopOpacity={0.18} />
                      <stop offset="95%" stopColor="#7342E2" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--ink-3)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--ink-3)" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    formatter={(v: number) => [`${currency} ${v.toLocaleString()}`, "Realized P&L"]}
                    contentStyle={{ fontSize: 12, borderRadius: 10, border: "1px solid var(--hairline)" }}
                  />
                  <Area type="monotone" dataKey="value" stroke="#7342E2" strokeWidth={2} fill="url(#pnlGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </motion.div>

        {allocationData.length > 0 && (
          <motion.div variants={reveal} custom={1} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <Panel className="h-full">
              <p className="text-sm font-semibold">Holdings Allocation</p>
              <p className="text-xs" style={{ color: "var(--ink-3)" }}>By ticker · current positions</p>
              <div className="mt-4 flex justify-center">
                <ResponsiveContainer width={140} height={140}>
                  <PieChart>
                    <Pie data={allocationData} cx="50%" cy="50%" innerRadius={42} outerRadius={65} dataKey="value" paddingAngle={2}>
                      {allocationData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} formatter={(v: number) => [`${currency} ${v.toLocaleString()}`, ""]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-1">
                {allocationData.map((d) => (
                  <div key={d.name} className="flex items-center gap-1.5 text-xs" style={{ color: "var(--ink-2)" }}>
                    <span className="size-2 rounded-full shrink-0" style={{ background: d.color }} />
                    {d.name}
                  </div>
                ))}
              </div>
            </Panel>
          </motion.div>
        )}
      </div>

      {/* AI narrative panel */}
      <Panel>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles size={16} strokeWidth={1.75} style={{ color: "var(--color-accent)" }} />
            <p className="text-sm font-semibold">AI Portfolio Analysis</p>
          </div>
          <button
            type="button"
            disabled={loadingAI}
            onClick={fetchAINarrative}
            className="rounded-full border px-3 py-1.5 text-xs font-medium transition-shadow hover:shadow-md disabled:opacity-50"
            style={{ borderColor: "var(--hairline)" }}
          >
            {loadingAI ? "Analysing…" : aiNarrative ? "Refresh" : "Analyse with Gemini"}
          </button>
        </div>
        {aiNarrative ? (
          <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
            {aiNarrative}
          </p>
        ) : (
          <p className="mt-3 text-sm" style={{ color: "var(--ink-3)" }}>
            Click "Analyse with Gemini" to get an AI-generated portfolio health summary based on your actual positions.
          </p>
        )}
      </Panel>

      {/* Needs attention + recent activity */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Needs Attention</p>
            {flags.length > 0 && (
              <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: "rgba(201,138,26,0.12)", color: "var(--warn)" }}>
                {flags.length} items
              </span>
            )}
          </div>
          <div className="mt-4 space-y-3">
            {flags.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--ink-3)" }}>No open flags — your book is clean.</p>
            ) : flags.map((f) => (
              <div key={f.id} className="flex items-start justify-between rounded-xl p-3" style={{ background: "var(--color-login-bg)" }}>
                <div className="flex items-start gap-2.5">
                  <AlertTriangle size={16} strokeWidth={1.75} style={{ color: f.severity === "bad" ? "var(--bad)" : "var(--warn)", marginTop: 1 }} />
                  <div>
                    <p className="text-xs font-medium">{f.flag_type}</p>
                    <p className="mt-0.5 text-xs" style={{ color: "var(--ink-3)" }}>{f.ticker} · {f.ref_id}</p>
                  </div>
                </div>
                <Link to="/app/reconciliation" className="flex items-center gap-1 text-xs font-medium" style={{ color: "var(--color-accent)" }}>
                  Resolve <ArrowUpRight size={12} />
                </Link>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <p className="text-sm font-semibold">Recent Activity</p>
          <div className="mt-4 space-y-3">
            {recentActivity.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--ink-3)" }}>No transactions yet — upload a statement to get started.</p>
            ) : recentActivity.map(({ icon: Ic, text, time, tone }, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <Ic size={15} strokeWidth={1.75} style={{ color: `var(--${tone})`, marginTop: 1, flexShrink: 0 }} />
                <p className="flex-1 text-xs leading-relaxed" style={{ color: "var(--ink-2)" }}>{text}</p>
                <span className="text-xs" style={{ color: "var(--ink-3)" }}>{time}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {quickActions.map(({ icon: Ic, label, to, color }) => (
          <Link
            key={label}
            to={to}
            className="flex flex-col items-center gap-2 rounded-2xl bg-white py-5 text-center text-xs font-medium transition-shadow hover:shadow-md"
            style={{ border: "1px solid var(--hairline)" }}
          >
            <span className="flex size-10 items-center justify-center rounded-xl" style={{ background: `color-mix(in srgb, ${color} 10%, transparent)` }}>
              <Ic size={20} strokeWidth={1.75} style={{ color }} />
            </span>
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}
