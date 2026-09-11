// ─── Insight Card Component ───────────────────────────────────────────────────
// "AuditX Found Something" — proactive AI insights with evidence.

import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  AlertCircle,
  AlertTriangle,
  Lightbulb,
  Search,
  TrendingDown,
  TrendingUp,
  ArrowRight,
  Shield,
} from "lucide-react";
import type { EventSeverity } from "@/lib/financial-intelligence";

export interface InsightData {
  id: string;
  type: string;
  severity: EventSeverity;
  title: string;
  summary: string;
  confidence: number;
  financialImpact?: number;
  currency?: string;
  evidenceCount?: number;
  actionLabel?: string;
  actionLink?: string;
  secondaryActionLabel?: string;
  secondaryActionLink?: string;
}

const INSIGHT_ICONS = {
  FEE_DISCREPANCY: AlertCircle,
  TAX_OPPORTUNITY: Lightbulb,
  DUPLICATE_TRANSACTION: AlertTriangle,
  COMPLIANCE_RISK: Shield,
  ANOMALY_DETECTED: Search,
  PORTFOLIO_CHANGE: TrendingUp,
  TAX_LIABILITY_CHANGED: TrendingDown,
  DEFAULT: AlertTriangle,
};

function getInsightIcon(type: string) {
  return INSIGHT_ICONS[type as keyof typeof INSIGHT_ICONS] ?? INSIGHT_ICONS.DEFAULT;
}

function severityStyle(severity: EventSeverity) {
  switch (severity) {
    case "CRITICAL":
      return {
        bg: "rgba(214,69,69,0.05)",
        border: "rgba(214,69,69,0.15)",
        accent: "var(--bad)",
        badge: "rgba(214,69,69,0.1)",
        label: "CRITICAL",
      };
    case "HIGH":
      return {
        bg: "rgba(201,138,26,0.05)",
        border: "rgba(201,138,26,0.15)",
        accent: "var(--warn)",
        badge: "rgba(201,138,26,0.1)",
        label: "WARNING",
      };
    case "MEDIUM":
      return {
        bg: "rgba(59,111,209,0.05)",
        border: "rgba(59,111,209,0.15)",
        accent: "var(--info)",
        badge: "rgba(59,111,209,0.1)",
        label: "NOTICE",
      };
    case "LOW":
    case "SUCCESS":
      return {
        bg: "rgba(31,157,99,0.05)",
        border: "rgba(31,157,99,0.15)",
        accent: "var(--ok)",
        badge: "rgba(31,157,99,0.1)",
        label: "OPPORTUNITY",
      };
    default:
      return {
        bg: "rgba(25,40,55,0.03)",
        border: "var(--hairline)",
        accent: "var(--color-accent)",
        badge: "rgba(115,66,226,0.1)",
        label: "INSIGHT",
      };
  }
}

interface Props {
  insight: InsightData;
  index?: number;
}

export function InsightCard({ insight, index = 0 }: Props) {
  const style = severityStyle(insight.severity);
  const Icon = getInsightIcon(insight.type);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.07 }}
      className="overflow-hidden rounded-2xl"
      style={{ background: style.bg, border: `1px solid ${style.border}` }}
    >
      <div className="p-5">
        <div className="flex items-start gap-3">
          <div
            className="flex size-9 shrink-0 items-center justify-center rounded-xl"
            style={{ background: style.badge }}
          >
            <Icon size={16} style={{ color: style.accent }} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="text-[10px] font-bold uppercase tracking-widest"
                style={{ color: style.accent }}
              >
                {style.label}
              </span>
            </div>
            <p className="mt-1 text-sm font-semibold" style={{ color: "var(--color-text)" }}>
              {insight.title}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--ink-2)" }}>
              {insight.summary}
            </p>

            {insight.financialImpact !== undefined && (
              <div className="mt-3">
                <span
                  className="tnum text-sm font-bold"
                  style={{ color: style.accent }}
                >
                  {insight.currency ?? "PKR"} {Math.abs(insight.financialImpact).toLocaleString("en-PK", { maximumFractionDigits: 0 })}
                </span>
                <span className="ml-1 text-xs" style={{ color: "var(--ink-3)" }}>
                  potential impact
                </span>
              </div>
            )}

            <div className="mt-3 flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <div
                  className="h-1.5 rounded-full"
                  style={{
                    width: `${insight.confidence * 48}px`,
                    background: style.accent,
                    opacity: 0.7,
                  }}
                />
                <span className="tnum text-[10px]" style={{ color: "var(--ink-3)" }}>
                  {(insight.confidence * 100).toFixed(0)}% confidence
                </span>
              </div>
              {insight.evidenceCount !== undefined && (
                <span className="text-[10px]" style={{ color: "var(--ink-3)" }}>
                  {insight.evidenceCount} evidence item{insight.evidenceCount !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {(insight.actionLabel || insight.secondaryActionLabel) && (
        <div
          className="flex items-center gap-2 border-t px-5 py-3"
          style={{ borderColor: style.border, background: `color-mix(in srgb, ${style.bg} 50%, transparent)` }}
        >
          {insight.actionLabel && insight.actionLink && (
            <Link
              to={insight.actionLink}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all hover:opacity-90"
              style={{ background: style.accent, color: "#fff" }}
            >
              {insight.actionLabel}
              <ArrowRight size={11} />
            </Link>
          )}
          {insight.secondaryActionLabel && insight.secondaryActionLink && (
            <Link
              to={insight.secondaryActionLink}
              className="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-all"
              style={{ color: style.accent, background: style.badge, border: `1px solid color-mix(in srgb, ${style.accent} 20%, transparent)` }}
            >
              {insight.secondaryActionLabel}
            </Link>
          )}
        </div>
      )}
    </motion.div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

export function InsightCardEmpty() {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-2xl p-8 text-center"
      style={{ border: "1px dashed var(--hairline)", background: "rgba(25,40,55,0.02)" }}
    >
      <div
        className="flex size-10 items-center justify-center rounded-xl"
        style={{ background: "rgba(115,66,226,0.08)" }}
      >
        <Search size={18} style={{ color: "var(--color-accent)" }} />
      </div>
      <p className="mt-3 text-sm font-medium">No active insights</p>
      <p className="mt-1 text-xs" style={{ color: "var(--ink-2)" }}>
        AuditX will surface important findings as your data grows.
      </p>
    </div>
  );
}
