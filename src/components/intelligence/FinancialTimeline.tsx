// ─── Financial Timeline Component ────────────────────────────────────────────
// Living record of meaningful financial events. Replaces chat history.
// Only shows deterministic events — never UI noise.

import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  FileText,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Search,
  Zap,
} from "lucide-react";
import type { FinancialEvent, EventSeverity } from "@/lib/financial-intelligence";

// ── Synthetic timeline entries from real data ─────────────────────────────────
// Used when no events table exists yet — derived from transactions and flags.

export interface TimelineEntry {
  id: string;
  date: string;
  isToday: boolean;
  isYesterday: boolean;
  severity: EventSeverity;
  title: string;
  description: string;
  actionLabel?: string | undefined;
  actionLink?: string | undefined;
  confidence?: number | undefined;
  eventType: string;
}

function severityToIcon(severity: EventSeverity) {
  switch (severity) {
    case "CRITICAL": return AlertCircle;
    case "HIGH":     return AlertTriangle;
    case "SUCCESS":  return CheckCircle2;
    case "INFO":     return FileText;
    default:         return RefreshCw;
  }
}

function severityToColor(severity: EventSeverity): string {
  switch (severity) {
    case "CRITICAL": return "var(--bad)";
    case "HIGH":     return "var(--warn)";
    case "MEDIUM":   return "var(--warn)";
    case "SUCCESS":  return "var(--ok)";
    case "INFO":     return "var(--info)";
    default:         return "var(--ink-3)";
  }
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const today = now.toDateString();
  const yesterday = new Date(now.getTime() - 86400000).toDateString();

  if (d.toDateString() === today) return "TODAY";
  if (d.toDateString() === yesterday) return "YESTERDAY";

  return d.toLocaleDateString("en-PK", {
    month: "long",
    day: "numeric",
    ...(d.getFullYear() !== now.getFullYear() && { year: "numeric" }),
  }).toUpperCase();
}

// ── Event Entry ───────────────────────────────────────────────────────────────

function TimelineEntryRow({ entry }: { entry: TimelineEntry }) {
  const Icon = severityToIcon(entry.severity);
  const color = severityToColor(entry.severity);

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
      className="group flex gap-4"
    >
      {/* Timeline line + dot */}
      <div className="flex flex-col items-center">
        <div
          className="flex size-8 shrink-0 items-center justify-center rounded-full"
          style={{ background: `color-mix(in srgb, ${color} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 25%, transparent)` }}
        >
          <Icon size={14} style={{ color }} />
        </div>
        <div className="mt-1 w-px flex-1" style={{ background: "var(--hairline)", minHeight: 16 }} />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 pb-4">
        <p
          className="text-sm font-medium"
          style={{ color: "var(--color-text)" }}
        >
          {entry.title}
        </p>
        <p
          className="mt-0.5 text-xs leading-relaxed"
          style={{ color: "var(--ink-2)" }}
        >
          {entry.description}
        </p>
        {entry.confidence !== undefined && (
          <p className="mt-1 text-[11px]" style={{ color: "var(--ink-3)" }}>
            Confidence:{" "}
            <span style={{ color: entry.confidence >= 0.9 ? "var(--ok)" : "var(--warn)" }}>
              {(entry.confidence * 100).toFixed(1)}%
            </span>
          </p>
        )}
        {entry.actionLabel && entry.actionLink && (
          <Link
            to={entry.actionLink}
            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold transition-colors hover:opacity-80"
            style={{ color: "var(--color-accent)" }}
          >
            {entry.actionLabel} →
          </Link>
        )}
      </div>
    </motion.div>
  );
}

// ── Group entries by date ─────────────────────────────────────────────────────

function groupByDate(entries: TimelineEntry[]): Array<{ label: string; items: TimelineEntry[] }> {
  const groups: Record<string, TimelineEntry[]> = {};
  for (const entry of entries) {
    const key = entry.date.slice(0, 10);
    if (!groups[key]) groups[key] = [];
    groups[key]!.push(entry);
  }
  return Object.entries(groups)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, items]) => ({
      label: formatDateLabel(date),
      items,
    }));
}

// ── Convert FinancialEvent to TimelineEntry ───────────────────────────────────

export function eventToTimelineEntry(event: FinancialEvent): TimelineEntry {
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  const eventDate = new Date(event.created_at);

  return {
    id: event.id,
    date: event.created_at,
    isToday: eventDate.toDateString() === today,
    isYesterday: eventDate.toDateString() === yesterday,
    severity: event.severity,
    title: event.title,
    description: event.description,
    confidence: event.confidence,
    eventType: event.event_type,
    actionLabel: event.entity_type ? "View details" : undefined,
    actionLink: event.entity_type === "transaction" ? `/app/ledger` : "/app/overview",
  };
}

// ── Main Component ────────────────────────────────────────────────────────────

interface Props {
  entries: TimelineEntry[];
  isLoading?: boolean;
  showEmpty?: boolean;
}

export function FinancialTimeline({ entries, isLoading, showEmpty = true }: Props) {
  const groups = groupByDate(entries);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex gap-4">
            <div className="size-8 animate-pulse rounded-full" style={{ background: "var(--hairline)" }} />
            <div className="flex-1 space-y-2 pt-1">
              <div className="h-4 w-48 animate-pulse rounded" style={{ background: "var(--hairline)" }} />
              <div className="h-3 w-full animate-pulse rounded" style={{ background: "var(--hairline)" }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (entries.length === 0 && showEmpty) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div
          className="flex size-12 items-center justify-center rounded-2xl"
          style={{ background: "rgba(115,66,226,0.08)" }}
        >
          <Zap size={20} style={{ color: "var(--color-accent)" }} />
        </div>
        <p className="mt-4 font-semibold">No financial events yet</p>
        <p className="mt-1 max-w-xs text-sm" style={{ color: "var(--ink-2)" }}>
          Upload a broker statement to start building your financial timeline.
        </p>
        <Link
          to="/app/parser"
          className="mt-4 rounded-full px-4 py-2 text-sm font-semibold text-white"
          style={{ background: "var(--color-accent)" }}
        >
          Upload Statement
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {groups.map(({ label, items }) => (
        <div key={label}>
          <div className="mb-3 flex items-center gap-3">
            <span
              className="text-[10px] font-bold uppercase tracking-widest"
              style={{ color: "var(--ink-3)" }}
            >
              {label}
            </span>
            <div className="h-px flex-1" style={{ background: "var(--hairline)" }} />
          </div>
          <div className="space-y-0">
            {items.map((entry) => (
              <TimelineEntryRow key={entry.id} entry={entry} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Synthetic timeline generator from transactions ────────────────────────────
// Creates meaningful timeline entries directly from transaction data
// Used when no financial_events table rows exist yet.

export function generateTimelineFromTransactions(
  transactions: Array<{
    id: string;
    ticker: string;
    action: string;
    quantity: number;
    price: number;
    trade_date: string;
    status: string;
    confidence_score: number;
    broker: string;
  }>,
  flags: Array<{
    id: string;
    flag_type: string;
    severity: string;
    ticker: string;
    description: string;
    created_at?: string;
  }>,
  currency: string,
): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();

  // Group transactions by date
  const txByDate: Record<string, typeof transactions> = {};
  for (const tx of transactions) {
    if (!txByDate[tx.trade_date]) txByDate[tx.trade_date] = [];
    txByDate[tx.trade_date]!.push(tx);
  }

  for (const [date, txs] of Object.entries(txByDate).slice(0, 15)) {
    const postedCount = txs.filter((t) => t.status === "posted").length;
    const reviewCount = txs.filter((t) => t.status === "needs_review").length;
    const avgConf = txs.reduce((s, t) => s + t.confidence_score, 0) / txs.length;
    const d = new Date(date);
    const isToday = d.toDateString() === today;
    const isYesterday = d.toDateString() === yesterday;

    if (postedCount > 0) {
      entries.push({
        id: `tx-${date}-posted`,
        date,
        isToday,
        isYesterday,
        severity: "SUCCESS",
        title: `${postedCount} transaction${postedCount > 1 ? "s" : ""} processed`,
        description: `${txs.map((t) => t.ticker).filter((v, i, a) => a.indexOf(v) === i).slice(0, 3).join(", ")} trades recorded.`,
        confidence: avgConf,
        eventType: "TRANSACTION_RECONCILED",
        actionLabel: "View in Ledger",
        actionLink: "/app/ledger",
      });
    }

    if (reviewCount > 0) {
      entries.push({
        id: `tx-${date}-review`,
        date,
        isToday,
        isYesterday,
        severity: "HIGH",
        title: `${reviewCount} transaction${reviewCount > 1 ? "s" : ""} require review`,
        description: `These transactions were extracted with lower confidence and need verification.`,
        confidence: avgConf,
        eventType: "TRANSACTION_UNRECONCILED",
        actionLabel: "Review",
        actionLink: "/app/reconciliation",
      });
    }
  }

  // Add flag entries
  for (const flag of flags.slice(0, 5)) {
    const severity: EventSeverity =
      flag.severity === "bad" ? "CRITICAL" : flag.severity === "warn" ? "HIGH" : "MEDIUM";
    entries.push({
      id: `flag-${flag.id}`,
      date: flag.created_at ?? new Date().toISOString(),
      isToday: new Date(flag.created_at ?? "").toDateString() === today,
      isYesterday: new Date(flag.created_at ?? "").toDateString() === yesterday,
      severity,
      title: `${flag.flag_type} detected — ${flag.ticker}`,
      description: flag.description,
      eventType: "ANOMALY_DETECTED",
      actionLabel: "Investigate",
      actionLink: "/app/reconciliation",
    });
  }

  return entries.sort((a, b) => b.date.localeCompare(a.date));
}
