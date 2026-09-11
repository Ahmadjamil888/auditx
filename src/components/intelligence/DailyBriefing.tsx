// ─── Daily Briefing Component ─────────────────────────────────────────────────
// "Good morning, here is what changed in your financial world."
// Generated from deterministic data — no invented facts.

import { motion } from "framer-motion";
import {
  AlertCircle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  Minus,
  Sparkles,
  Sun,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { useDailyBriefing } from "@/lib/financial-intelligence-hooks";

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function getDayOfWeek(): string {
  return new Date().toLocaleDateString("en-PK", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

interface MetricDeltaProps {
  label: string;
  value: string | number;
  delta?: number;
  currency?: string;
  isGoodWhenDown?: boolean;
}

function MetricDelta({ label, value, delta, currency, isGoodWhenDown }: MetricDeltaProps) {
  const isUp = (delta ?? 0) > 0;
  const isPositive = isGoodWhenDown ? !isUp : isUp;
  const color = delta === 0 ? "var(--ink-3)" : isPositive ? "var(--ok)" : "var(--bad)";

  const Icon = !delta ? Minus : isUp ? ArrowUp : ArrowDown;

  return (
    <div className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid var(--hairline)" }}>
      <span className="text-xs" style={{ color: "var(--ink-2)" }}>
        {label}
      </span>
      <div className="flex items-center gap-2">
        <span className="tnum text-xs font-semibold" style={{ color: "var(--color-text)" }}>
          {typeof value === "number" ? value.toLocaleString() : value}
          {currency ? ` ${currency}` : ""}
        </span>
        {delta !== undefined && (
          <div className="flex items-center gap-0.5" style={{ color }}>
            <Icon size={10} />
            <span className="tnum text-[10px] font-semibold">
              {Math.abs(delta).toLocaleString()}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export function DailyBriefing() {
  const { profile } = useAuth();
  const { briefing, isLoading } = useDailyBriefing();
  const currency = profile?.jurisdiction === "PSX" ? "PKR" : "INR";

  if (isLoading) {
    return (
      <div
        className="overflow-hidden rounded-2xl"
        style={{ background: "linear-gradient(135deg, #1a0e3d 0%, #0d1a2e 100%)", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        <div className="p-6">
          <div className="h-6 w-48 animate-pulse rounded" style={{ background: "rgba(255,255,255,0.08)" }} />
          <div className="mt-2 h-4 w-72 animate-pulse rounded" style={{ background: "rgba(255,255,255,0.06)" }} />
        </div>
      </div>
    );
  }

  if (!briefing) return null;

  const criticalIssues = briefing.criticalIssues;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="overflow-hidden rounded-2xl"
      style={{
        background: "linear-gradient(135deg, #1a0e3d 0%, #0d1a2e 100%)",
        border: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sun size={14} style={{ color: "rgba(255,220,100,0.8)" }} />
              <p className="text-xs font-medium uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.45)" }}>
                {getDayOfWeek()}
              </p>
            </div>
            <h2
              className="text-xl font-bold"
              style={{ color: "#fff", fontFamily: "var(--font-heading)" }}
            >
              {getGreeting()}, {briefing.userName.split(" ")[0]}.
            </h2>
            <p className="mt-1 text-sm" style={{ color: "rgba(255,255,255,0.55)" }}>
              Your financial world is continuously monitored.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Sparkles size={14} style={{ color: "rgba(115,66,226,0.8)" }} />
            <span
              className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide"
              style={{ background: "rgba(115,66,226,0.2)", color: "rgba(179,140,255,0.9)", border: "1px solid rgba(115,66,226,0.3)" }}
            >
              Live Intelligence
            </span>
          </div>
        </div>

        {/* Key metrics */}
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div
            className="rounded-xl p-3"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            <p className="text-[10px] uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.4)" }}>
              Health Score
            </p>
            <p className="tnum mt-1 text-xl font-bold" style={{ color: briefing.healthScore >= 80 ? "#4ade80" : briefing.healthScore >= 60 ? "#fbbf24" : "#f87171" }}>
              {briefing.healthScore}
            </p>
            <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>/100</p>
          </div>

          <div
            className="rounded-xl p-3"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            <p className="text-[10px] uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.4)" }}>
              Reconciled Today
            </p>
            <p className="tnum mt-1 text-xl font-bold" style={{ color: briefing.reconciledToday > 0 ? "#4ade80" : "rgba(255,255,255,0.5)" }}>
              {briefing.reconciledToday}
            </p>
            <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>transactions</p>
          </div>

          <div
            className="rounded-xl p-3"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            <p className="text-[10px] uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.4)" }}>
              Open Issues
            </p>
            <p className="tnum mt-1 text-xl font-bold" style={{ color: briefing.newDiscrepancies > 0 ? "#f87171" : "#4ade80" }}>
              {briefing.newDiscrepancies}
            </p>
            <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>flags</p>
          </div>

          <div
            className="rounded-xl p-3"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            <p className="text-[10px] uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.4)" }}>
              Critical Issues
            </p>
            <p className="tnum mt-1 text-xl font-bold" style={{ color: criticalIssues > 0 ? "#f87171" : "#4ade80" }}>
              {criticalIssues}
            </p>
            <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>
              {criticalIssues === 0 ? "all clear" : "require action"}
            </p>
          </div>
        </div>

        {/* Top priority */}
        {briefing.topPriority && (
          <div
            className="mt-4 flex items-center justify-between rounded-xl p-3"
            style={{
              background: "rgba(214,69,69,0.12)",
              border: "1px solid rgba(214,69,69,0.25)",
            }}
          >
            <div className="flex items-center gap-2.5">
              <AlertCircle size={14} style={{ color: "#f87171", flexShrink: 0 }} />
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "#f87171" }}>
                  Top Priority
                </p>
                <p className="text-xs font-medium" style={{ color: "rgba(255,255,255,0.85)" }}>
                  {briefing.topPriority.title}
                </p>
              </div>
            </div>
            <Link
              to={briefing.topPriority.actionLink}
              className="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors"
              style={{ background: "rgba(214,69,69,0.2)", color: "#fca5a5", border: "1px solid rgba(214,69,69,0.3)" }}
            >
              {briefing.topPriority.action}
              <ArrowRight size={11} />
            </Link>
          </div>
        )}

        {criticalIssues === 0 && !briefing.topPriority && (
          <div
            className="mt-4 flex items-center gap-2.5 rounded-xl p-3"
            style={{ background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.15)" }}
          >
            <CheckCircle2 size={14} style={{ color: "#4ade80" }} />
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.7)" }}>
              No critical issues. Your financial records are in good shape.
            </p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
