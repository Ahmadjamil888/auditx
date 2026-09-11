// ─── Financial Health Score Component ────────────────────────────────────────
// Deterministic score. Every component is transparent and explainable.

import { motion, AnimatePresence } from "framer-motion";
import { Info, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useState } from "react";
import type { HealthScoreBreakdown } from "@/lib/financial-intelligence";

interface Props {
  score: HealthScoreBreakdown;
  isLoading?: boolean;
}

function ScoreRing({ value, size = 120 }: { value: number; size?: number }) {
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDash = (value / 100) * circumference;

  const color =
    value >= 80 ? "var(--ok)" : value >= 60 ? "var(--warn)" : "var(--bad)";

  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgba(25,40,55,0.07)"
        strokeWidth={8}
      />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={8}
        strokeLinecap="round"
        strokeDasharray={circumference}
        initial={{ strokeDashoffset: circumference }}
        animate={{ strokeDashoffset: circumference - strokeDash }}
        transition={{ duration: 1.2, ease: "easeOut" }}
      />
    </svg>
  );
}

function BreakdownBar({
  label,
  value,
  max,
  delay,
}: {
  label: string;
  value: number;
  max: number;
  delay: number;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  const color =
    pct >= 80 ? "var(--ok)" : pct >= 60 ? "var(--warn)" : "var(--bad)";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs" style={{ color: "var(--ink-2)" }}>
          {label}
        </span>
        <span className="tnum text-xs font-semibold" style={{ color }}>
          {value}/{max}
        </span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full"
        style={{ background: "rgba(25,40,55,0.08)" }}
      >
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, delay, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

export function FinancialHealthScore({ score, isLoading }: Props) {
  const [expanded, setExpanded] = useState(false);

  const label =
    score.total >= 80 ? "GOOD" : score.total >= 60 ? "FAIR" : "NEEDS ATTENTION";
  const labelColor =
    score.total >= 80 ? "var(--ok)" : score.total >= 60 ? "var(--warn)" : "var(--bad)";

  const TrendIcon =
    score.trend > 0 ? TrendingUp : score.trend < 0 ? TrendingDown : Minus;

  if (isLoading) {
    return (
      <div
        className="rounded-2xl p-6"
        style={{ background: "#fff", border: "1px solid var(--hairline)" }}
      >
        <div className="h-24 w-full animate-pulse rounded-xl" style={{ background: "var(--hairline)" }} />
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl p-5"
      style={{ background: "#fff", border: "1px solid var(--hairline)" }}
    >
      <div className="flex items-center justify-between">
        <div>
          <p
            className="text-xs font-medium uppercase tracking-widest"
            style={{ color: "var(--ink-3)" }}
          >
            Financial Health
          </p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-colors hover:bg-black/5"
          style={{ color: "var(--ink-3)", border: "1px solid var(--hairline)" }}
        >
          <Info size={12} />
          How is this calculated?
        </button>
      </div>

      <div className="mt-4 flex items-center gap-6">
        <div className="relative flex shrink-0 items-center justify-center">
          <ScoreRing value={score.total} size={96} />
          <div className="absolute flex flex-col items-center">
            <span className="tnum text-2xl font-bold leading-none" style={{ color: "var(--color-text)" }}>
              {score.total}
            </span>
            <span className="text-[10px]" style={{ color: "var(--ink-3)" }}>
              /100
            </span>
          </div>
        </div>

        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span
              className="rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide"
              style={{ background: `color-mix(in srgb, ${labelColor} 12%, transparent)`, color: labelColor }}
            >
              {label}
            </span>
            {score.trend !== 0 && (
              <span
                className="flex items-center gap-1 text-xs font-medium"
                style={{ color: score.trend > 0 ? "var(--ok)" : "var(--bad)" }}
              >
                <TrendIcon size={12} />
                {score.trend > 0 ? "+" : ""}{score.trend} this month
              </span>
            )}
          </div>
          <p className="mt-2 text-sm" style={{ color: "var(--ink-2)" }}>
            {score.total >= 80
              ? "Your financial records are well-maintained."
              : score.total >= 60
              ? "Some areas need attention to improve accuracy."
              : "Multiple issues require immediate attention."}
          </p>
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div
              className="mt-4 space-y-3 border-t pt-4"
              style={{ borderColor: "var(--hairline)" }}
            >
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--ink-3)" }}>
                Score Breakdown
              </p>
              <BreakdownBar label="Reconciliation" value={score.reconciliation} max={30} delay={0} />
              <BreakdownBar label="Document Completeness" value={score.documentCompleteness} max={20} delay={0.05} />
              <BreakdownBar label="Data Confidence" value={score.dataConfidence} max={15} delay={0.1} />
              <BreakdownBar label="Tax Confidence" value={score.taxConfidence} max={15} delay={0.15} />
              <BreakdownBar label="Compliance" value={score.compliance} max={10} delay={0.2} />
              <BreakdownBar label="Risk Exposure" value={score.riskExposure} max={10} delay={0.25} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
