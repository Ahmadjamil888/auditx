// ─── Contextual Intelligence Panel ───────────────────────────────────────────
// Right-side AI panel that knows the current page context.
// Shows suggestions, evidence, and intelligent responses.

import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Brain,
  ChevronDown,
  ChevronRight,
  FileSearch,
  GitFork,
  Lightbulb,
  Loader2,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { useState, useCallback } from "react";
import { GoogleGenAI } from "@google/genai";
import { useAuth } from "@/lib/auth-context";
import {
  detectIntent,
  buildIntelligencePrompt,
  getPortfolioSummary,
  getTaxLiability,
  getUnreconciledTransactions,
  getCriticalAnomalies,
  getFinancialHealth,
  type IntelligenceToolContext,
} from "@/lib/intelligence-tools";

// ── Context-aware suggestions ─────────────────────────────────────────────────

function getContextSuggestions(page: string, entityId?: string): string[] {
  if (entityId || page.includes("transactions")) {
    return [
      "Explain this transaction",
      "Is this flagged for a reason?",
      "Show broker evidence",
      "Compare with statement",
    ];
  }
  if (page.includes("tax")) {
    return [
      "Why did my tax change?",
      "Explain FIFO calculation",
      "Show harvesting opportunities",
      "Which transactions drove this?",
    ];
  }
  if (page.includes("reconciliation")) {
    return [
      "Explain this discrepancy",
      "What caused this flag?",
      "How do I resolve this?",
      "Show affected transactions",
    ];
  }
  if (page.includes("overview")) {
    return [
      "What needs attention today?",
      "Why did my health score change?",
      "Summarise my financial position",
      "What changed this month?",
    ];
  }
  return [
    "What needs my attention?",
    "Summarise my financial state",
    "Show critical issues",
    "Explain my tax liability",
  ];
}

function getPageContext(page: string, entityId?: string): string {
  if (entityId) return `Transaction ${entityId}`;
  if (page.includes("overview")) return "Mission Control";
  if (page.includes("ledger")) return "Transaction Ledger";
  if (page.includes("tax")) return "Tax Center";
  if (page.includes("reconciliation")) return "Reconciliation";
  if (page.includes("reports")) return "Reports";
  if (page.includes("parser")) return "Document Parser";
  if (page.includes("investigations")) return "Investigations";
  return "AuditX";
}

// ── Message renderer ──────────────────────────────────────────────────────────

function IntelligenceMessage({ text, isStreaming }: { text: string; isStreaming: boolean }) {
  return (
    <div className="text-xs leading-relaxed" style={{ color: "var(--ink-2)" }}>
      {text.split("\n").map((line, i) => {
        if (line.startsWith("## ")) {
          return (
            <p key={i} className="mb-1 mt-3 text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--color-text)" }}>
              {line.slice(3)}
            </p>
          );
        }
        if (line.startsWith("- ") || line.startsWith("• ")) {
          return (
            <p key={i} className="mb-0.5 pl-3">
              • {line.slice(2)}
            </p>
          );
        }
        if (line.trim() === "") return <div key={i} className="h-2" />;
        return <p key={i} className="mb-1">{line}</p>;
      })}
      {isStreaming && (
        <span className="inline-block h-3 w-1.5 animate-pulse rounded-sm" style={{ background: "var(--color-accent)" }} />
      )}
    </div>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────

interface Props {
  currentPage: string;
  entityId?: string;
  isOpen?: boolean;
  onClose?: () => void;
}

export function ContextualIntelligencePanel({ currentPage, entityId, isOpen = true, onClose }: Props) {
  const { profile } = useAuth();
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [hasResponse, setHasResponse] = useState(false);
  const [loadingState, setLoadingState] = useState<string | null>(null);

  const suggestions = getContextSuggestions(currentPage, entityId);
  const pageContext = getPageContext(currentPage, entityId);

  const runQuery = useCallback(
    async (prompt: string) => {
      if (!profile?.org_id) return;

      const apiKey = (import.meta.env["VITE_GOOGLE_AI_API_KEY"] as string | undefined) ?? "";
      if (!apiKey || apiKey.length < 10) {
        setResponse("AI API key not configured. Add VITE_GOOGLE_AI_API_KEY to your .env file.");
        setHasResponse(true);
        return;
      }

      setIsStreaming(true);
      setHasResponse(true);
      setResponse("");

      const toolCtx: IntelligenceToolContext = {
        orgId: profile.org_id,
        jurisdiction: (profile.jurisdiction as "PSX" | "NSE") ?? "PSX",
        taxYear: "2025",
        currentPage,
        currentTransactionId: entityId,
      };

      const intent = detectIntent(prompt, currentPage.split("/")[2]);
      setLoadingState("Building financial context...");

      const toolResults = [];
      try {
        if (intent === "TAX_CHANGE_EXPLANATION" || intent === "TAX_OPPORTUNITY") {
          const tax = await getTaxLiability(toolCtx);
          toolResults.push(tax);
        } else if (intent === "PORTFOLIO_ANALYSIS") {
          const portfolio = await getPortfolioSummary(toolCtx);
          toolResults.push(portfolio);
        } else if (intent === "RECONCILIATION_STATUS") {
          const unreconciled = await getUnreconciledTransactions(toolCtx);
          toolResults.push(unreconciled);
        } else if (intent === "ANOMALY_EXPLANATION" || intent === "BROKER_DISCREPANCY") {
          const anomalies = await getCriticalAnomalies(toolCtx);
          toolResults.push(anomalies);
        } else {
          const health = await getFinancialHealth(toolCtx);
          toolResults.push(health);
        }

        setLoadingState("Preparing response...");

        const finalPrompt = buildIntelligencePrompt(prompt, intent, toolResults, {
          jurisdiction: toolCtx.jurisdiction,
          currentPage,
          transactionId: entityId,
          taxYear: toolCtx.taxYear,
        });

        const ai = new GoogleGenAI({ apiKey });
        const stream = await ai.models.generateContentStream({
          model: "gemini-2.5-flash",
          contents: [{ role: "user", parts: [{ text: finalPrompt }] }],
          config: { temperature: 0.3, maxOutputTokens: 512 },
        });

        setLoadingState(null);
        let full = "";
        for await (const chunk of stream) {
          const t = chunk.text ?? "";
          full += t;
          setResponse(full);
        }
      } catch (err) {
        setResponse(`Analysis error: ${(err as Error).message}`);
      } finally {
        setIsStreaming(false);
        setLoadingState(null);
      }
    },
    [profile, currentPage, entityId],
  );

  if (!isOpen) return null;

  return (
    <div
      className="flex h-full flex-col overflow-hidden"
      style={{ background: "#fff", borderLeft: "1px solid var(--hairline)" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3.5"
        style={{ borderBottom: "1px solid var(--hairline)" }}
      >
        <div className="flex items-center gap-2">
          <div
            className="flex size-7 items-center justify-center rounded-lg"
            style={{ background: "rgba(115,66,226,0.1)" }}
          >
            <Brain size={13} style={{ color: "var(--color-accent)" }} />
          </div>
          <div>
            <p className="text-xs font-semibold">AuditX Intelligence</p>
            <p className="text-[10px]" style={{ color: "var(--ink-3)" }}>
              Context: {pageContext}
            </p>
          </div>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} style={{ color: "var(--ink-3)" }}>
            <X size={16} />
          </button>
        )}
      </div>

      {/* Context badge */}
      <div className="px-4 py-3">
        <div
          className="rounded-lg px-3 py-2"
          style={{ background: "rgba(115,66,226,0.06)", border: "1px solid rgba(115,66,226,0.12)" }}
        >
          <p className="text-[11px] font-medium" style={{ color: "var(--color-accent)" }}>
            Current context
          </p>
          <p className="mt-0.5 text-[11px]" style={{ color: "var(--ink-2)" }}>
            {pageContext}
          </p>
        </div>
      </div>

      {/* Suggestions */}
      {!hasResponse && (
        <div className="px-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--ink-3)" }}>
            Suggestions
          </p>
          <div className="space-y-1.5">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => { setQuery(s); void runQuery(s); }}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs transition-colors hover:bg-black/4"
                style={{ border: "1px solid var(--hairline)", color: "var(--ink-2)" }}
              >
                <Sparkles size={11} style={{ color: "var(--color-accent)", flexShrink: 0 }} />
                <span className="flex-1">{s}</span>
                <ChevronRight size={11} style={{ color: "var(--ink-3)" }} />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Loading */}
      {loadingState && (
        <div className="px-4 py-2">
          <div className="flex items-center gap-2">
            <Loader2 size={12} className="animate-spin" style={{ color: "var(--color-accent)" }} />
            <span className="text-[11px]" style={{ color: "var(--ink-2)" }}>{loadingState}</span>
          </div>
        </div>
      )}

      {/* Response */}
      {hasResponse && response && (
        <div className="flex-1 overflow-y-auto px-4 py-3">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles size={11} style={{ color: "var(--color-accent)" }} />
              <span className="text-[11px] font-semibold" style={{ color: "var(--color-accent)" }}>
                AuditX Analysis
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setHasResponse(false);
                setResponse("");
                setQuery("");
              }}
              className="text-[10px]"
              style={{ color: "var(--ink-3)" }}
            >
              Clear
            </button>
          </div>
          <IntelligenceMessage text={response} isStreaming={isStreaming} />
          {!isStreaming && (
            <p className="mt-4 text-[10px]" style={{ color: "var(--ink-3)" }}>
              Numbers from your ledger · AI interpretation only
            </p>
          )}
        </div>
      )}

      {/* Input */}
      <div
        className="mt-auto border-t p-3"
        style={{ borderColor: "var(--hairline)" }}
      >
        <div
          className="flex items-center gap-2 rounded-xl px-3 py-2"
          style={{ border: "1px solid var(--hairline)", background: "var(--color-login-bg)" }}
        >
          <input
            type="text"
            placeholder="Ask about this page…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const trimmed = query.trim();
                if (trimmed) void runQuery(trimmed);
              }
            }}
            className="flex-1 bg-transparent text-xs outline-none"
            style={{ color: "var(--color-text)" }}
          />
          <button
            type="button"
            onClick={() => { const t = query.trim(); if (t) void runQuery(t); }}
            disabled={!query.trim() || isStreaming}
            className="flex size-6 items-center justify-center rounded-lg disabled:opacity-40 transition-colors"
            style={{ background: "var(--color-accent)" }}
          >
            <ArrowRight size={11} style={{ color: "#fff" }} />
          </button>
        </div>
      </div>
    </div>
  );
}
