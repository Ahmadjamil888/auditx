// ─── AuditX Command Bar ────────────────────────────────────────────────────────
// Global intelligent command bar — replaces chat-first UX.
// Keyboard shortcut: Ctrl+K / ⌘K
// Context-aware: understands current page and entity.

import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  FileSearch,
  GitFork,
  Lightbulb,
  Loader2,
  Search,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { useAIContext } from "@/lib/financial-intelligence-hooks";
import { detectIntent, buildIntelligencePrompt, getPortfolioSummary, getTaxLiability, getUnreconciledTransactions, getCriticalAnomalies, getFinancialHealth, type IntelligenceToolContext } from "@/lib/intelligence-tools";
import { streamCompletion, isKeyMissing } from "@/lib/openrouter-client";

// ── Suggestions ───────────────────────────────────────────────────────────────

const GLOBAL_SUGGESTIONS = [
  { icon: AlertTriangle, label: "WHY DID MY TAX CHANGE?", sub: "Explain my latest tax change", intent: "TAX_CHANGE_EXPLANATION" },
  { icon: Zap,           label: "WHAT NEEDS ATTENTION?",   sub: "Show critical financial issues",       intent: "DAILY_PRIORITIES" },
  { icon: Search,        label: "FIND DISCREPANCIES",      sub: "Show suspicious transactions",        intent: "BROKER_DISCREPANCY" },
  { icon: Lightbulb,     label: "TAX OPPORTUNITIES",       sub: "Find tax-loss harvesting chances",    intent: "TAX_OPPORTUNITY" },
  { icon: BarChart3,     label: "PORTFOLIO HEALTH",        sub: "Analyse my current positions",        intent: "PORTFOLIO_ANALYSIS" },
  { icon: GitFork,       label: "RECONCILIATION STATUS",   sub: "Show what's unreconciled",            intent: "RECONCILIATION_STATUS" },
];

// ── AI Response Component ─────────────────────────────────────────────────────

function AIResponse({ text, isStreaming }: { text: string; isStreaming: boolean }) {
  return (
    <div className="max-h-[420px] overflow-y-auto px-5 py-4">
      <div
        className="mb-3 flex items-center gap-2"
        style={{ color: "var(--color-accent)" }}
      >
        <Sparkles size={13} />
        <span className="text-xs font-semibold uppercase tracking-wider">AuditX Intelligence</span>
        {isStreaming && <Loader2 size={12} className="ml-auto animate-spin" style={{ color: "var(--ink-3)" }} />}
      </div>
      <div
        className="prose prose-sm max-w-none"
        style={{ color: "var(--color-text)", fontSize: "13px", lineHeight: "1.65" }}
      >
        {text.split("\n").map((line, i) => {
          if (line.startsWith("## ")) {
            return <p key={i} className="font-bold mt-3 mb-1" style={{ fontSize: "13px" }}>{line.slice(3)}</p>;
          }
          if (line.startsWith("- ")) {
            return <p key={i} className="pl-3 mb-0.5" style={{ color: "var(--ink-2)" }}>• {line.slice(2)}</p>;
          }
          if (line.startsWith("**") && line.endsWith("**")) {
            return <p key={i} className="font-semibold mt-2">{line.slice(2, -2)}</p>;
          }
          if (line.trim() === "") return <div key={i} className="h-1.5" />;
          return <p key={i} className="mb-1" style={{ color: "var(--ink-2)" }}>{line}</p>;
        })}
      </div>
      {!isStreaming && (
        <div
          className="mt-4 border-t pt-3 text-[11px]"
          style={{ borderColor: "var(--hairline)", color: "var(--ink-3)" }}
        >
          Deterministic calculations · AI interpretation only · Numbers from your ledger
        </div>
      )}
    </div>
  );
}

// ── Main Command Bar ──────────────────────────────────────────────────────────

interface CommandBarProps {
  open: boolean;
  onClose: () => void;
}

export function AuditXCommandBar({ open, onClose }: CommandBarProps) {
  const { profile } = useAuth();
  const routerState = useRouterState();
  const navigate = useNavigate();
  const currentPath = routerState.location.pathname;
  const inputRef = useRef<HTMLInputElement>(null);

  const { context } = useAIContext({
    page: currentPath,
  });

  const [query, setQuery] = useState("");
  const [aiResponse, setAIResponse] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [hasResponse, setHasResponse] = useState(false);
  const [loadingState, setLoadingState] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 80);
      setQuery("");
      setAIResponse("");
      setHasResponse(false);
      setLoadingState(null);
    }
  }, [open]);

  const getContextualPrompt = useCallback(() => {
    if (!currentPath || currentPath === "/app/overview") return "";
    const segments = currentPath.split("/").filter(Boolean);
    const page = segments[1];
    if (page === "ledger") return "about the selected transaction or ledger in general";
    if (page === "tax") return "about my tax calculations";
    if (page === "reconciliation") return "about reconciliation flags";
    return "";
  }, [currentPath]);

  const runIntelligence = useCallback(
    async (prompt: string) => {
      if (!profile?.org_id) return;

      if (isKeyMissing()) {
        setAIResponse("AI is not configured. Add VITE_OPENROUTER_API_KEY to your environment variables.");
        setHasResponse(true);
        return;
      }

      setIsStreaming(true);
      setHasResponse(true);
      setAIResponse("");

      const toolCtx: IntelligenceToolContext = {
        orgId: profile.org_id,
        jurisdiction: (profile.jurisdiction as "PSX" | "NSE") ?? "PSX",
        taxYear: "2025",
        currentPage: currentPath,
      };

      const intent = detectIntent(prompt, currentPath.split("/")[2]);
      setLoadingState("Gathering financial context...");

      // Run relevant tools based on intent
      const toolResults = [];
      try {
        if (intent === "TAX_CHANGE_EXPLANATION" || intent === "TAX_OPPORTUNITY") {
          setLoadingState("Computing tax data...");
          const tax = await getTaxLiability(toolCtx);
          toolResults.push(tax);
        }
        if (intent === "PORTFOLIO_ANALYSIS") {
          setLoadingState("Analysing portfolio...");
          const portfolio = await getPortfolioSummary(toolCtx);
          toolResults.push(portfolio);
        }
        if (intent === "RECONCILIATION_STATUS") {
          setLoadingState("Checking reconciliation...");
          const unreconciled = await getUnreconciledTransactions(toolCtx);
          toolResults.push(unreconciled);
        }
        if (intent === "ANOMALY_EXPLANATION" || intent === "BROKER_DISCREPANCY") {
          setLoadingState("Finding anomalies...");
          const anomalies = await getCriticalAnomalies(toolCtx);
          toolResults.push(anomalies);
        }
        if (intent === "FINANCIAL_HEALTH" || intent === "DAILY_PRIORITIES") {
          setLoadingState("Assessing financial health...");
          const health = await getFinancialHealth(toolCtx);
          toolResults.push(health);
          const anomalies = await getCriticalAnomalies(toolCtx);
          toolResults.push(anomalies);
        }
        if (intent === "GENERAL") {
          setLoadingState("Loading financial context...");
          const health = await getFinancialHealth(toolCtx);
          toolResults.push(health);
        }

        setLoadingState("Preparing explanation...");

        const finalPrompt = buildIntelligencePrompt(prompt, intent, toolResults, {
          jurisdiction: toolCtx.jurisdiction,
          currentPage: currentPath,
          taxYear: toolCtx.taxYear,
        });

        setLoadingState(null);
        for await (const chunk of streamCompletion({
          systemPrompt: "You are AuditX Intelligence, a financial audit assistant. Be concise, precise, and reference specific numbers from the data provided. Never invent figures.",
          userPrompt: finalPrompt,
          maxTokens: 1024,
          temperature: 0.3,
        })) {
          setAIResponse((prev) => prev + chunk);
        }
      } catch (err) {
        setAIResponse(`Unable to complete analysis: ${(err as Error).message}`);
      } finally {
        setIsStreaming(false);
        setLoadingState(null);
      }
    },
    [profile, currentPath],
  );

  function handleSubmit() {
    const trimmed = query.trim();
    if (!trimmed) return;
    void runIntelligence(trimmed);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleSubmit();
    if (e.key === "Escape") onClose();
  }

  function handleSuggestion(suggestion: (typeof GLOBAL_SUGGESTIONS)[0]) {
    setQuery(suggestion.sub);
    void runIntelligence(suggestion.sub);
  }

  // Nav commands
  const navItems = [
    { label: "Go to Overview", to: "/app/overview", icon: BarChart3 },
    { label: "Go to Ledger", to: "/app/ledger", icon: FileSearch },
    { label: "Go to Reconciliation", to: "/app/reconciliation", icon: GitFork },
    { label: "Go to Tax Center", to: "/app/tax", icon: BarChart3 },
    { label: "Go to Investigations", to: "/app/investigations", icon: Search },
  ];

  const filteredNav = query
    ? navItems.filter((n) => n.label.toLowerCase().includes(query.toLowerCase()))
    : [];

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-50"
            style={{ background: "rgba(10,18,28,0.55)", backdropFilter: "blur(6px)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          <motion.div
            className="fixed left-1/2 top-[10vh] z-50 w-full max-w-2xl -translate-x-1/2"
            initial={{ opacity: 0, y: -20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.97 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            <div
              className="mx-4 overflow-hidden rounded-2xl bg-white shadow-2xl"
              style={{ border: "1px solid var(--hairline)", boxShadow: "0 24px 80px rgba(10,18,28,0.18)" }}
            >
              {/* Search input */}
              <div
                className="flex items-center gap-3 px-5 py-4"
                style={{ borderBottom: hasResponse ? "1px solid var(--hairline)" : "none" }}
              >
                <Sparkles size={18} style={{ color: "var(--color-accent)", flexShrink: 0 }} />
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Ask AuditX anything about your finances…"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    if (hasResponse) {
                      setHasResponse(false);
                      setAIResponse("");
                    }
                  }}
                  onKeyDown={handleKeyDown}
                  className="flex-1 text-sm outline-none bg-transparent"
                  style={{ color: "var(--color-text)" }}
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      setHasResponse(false);
                      setAIResponse("");
                      inputRef.current?.focus();
                    }}
                    style={{ color: "var(--ink-3)" }}
                  >
                    <X size={16} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="flex size-6 items-center justify-center rounded-md text-xs"
                  style={{ background: "rgba(25,40,55,0.07)", color: "var(--ink-3)" }}
                >
                  Esc
                </button>
              </div>

              {/* Loading state */}
              {loadingState && (
                <div
                  className="flex items-center gap-3 px-5 py-3"
                  style={{ borderBottom: "1px solid var(--hairline)", background: "rgba(115,66,226,0.04)" }}
                >
                  <Loader2 size={14} className="animate-spin" style={{ color: "var(--color-accent)" }} />
                  <span className="text-xs" style={{ color: "var(--ink-2)" }}>{loadingState}</span>
                </div>
              )}

              {/* AI Response */}
              {hasResponse && aiResponse && (
                <AIResponse text={aiResponse} isStreaming={isStreaming} />
              )}

              {/* Navigation shortcuts */}
              {!hasResponse && filteredNav.length > 0 && (
                <div className="px-2 py-2">
                  <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--ink-3)" }}>
                    Navigate
                  </p>
                  {filteredNav.map((item) => (
                    <button
                      key={item.to}
                      type="button"
                      onClick={() => { void navigate({ to: item.to }); onClose(); }}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors hover:bg-black/4"
                      style={{ color: "var(--ink-2)" }}
                    >
                      <item.icon size={15} strokeWidth={1.75} style={{ color: "var(--ink-3)" }} />
                      {item.label}
                      <ArrowRight size={12} className="ml-auto" style={{ color: "var(--ink-3)" }} />
                    </button>
                  ))}
                </div>
              )}

              {/* Suggestions */}
              {!hasResponse && !query && (
                <div className="p-3">
                  <p
                    className="mb-2 px-2 text-[10px] font-bold uppercase tracking-widest"
                    style={{ color: "var(--ink-3)" }}
                  >
                    {getContextualPrompt() ? `Context: ${currentPath.split("/").pop()?.toUpperCase()} page` : "Suggested Queries"}
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {GLOBAL_SUGGESTIONS.map((s) => (
                      <button
                        key={s.intent}
                        type="button"
                        onClick={() => handleSuggestion(s)}
                        className="flex items-start gap-2.5 rounded-xl p-3 text-left transition-colors hover:bg-black/4"
                        style={{ border: "1px solid var(--hairline)" }}
                      >
                        <s.icon size={14} style={{ color: "var(--color-accent)", marginTop: 1, flexShrink: 0 }} />
                        <div>
                          <p className="text-[10px] font-bold" style={{ color: "var(--color-accent)" }}>{s.label}</p>
                          <p className="mt-0.5 text-[11px]" style={{ color: "var(--ink-2)" }}>{s.sub}</p>
                        </div>
                      </button>
                    ))}
                  </div>

                  {query.trim().length > 0 && (
                    <button
                      type="button"
                      onClick={handleSubmit}
                      className="mt-2 flex w-full items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition-colors hover:bg-black/4"
                      style={{ color: "var(--color-accent)", border: "1px solid rgba(115,66,226,0.2)", background: "rgba(115,66,226,0.04)" }}
                    >
                      <Sparkles size={14} />
                      Ask: "{query}"
                      <ArrowRight size={14} className="ml-auto" />
                    </button>
                  )}
                </div>
              )}

              {/* Submit hint */}
              {!hasResponse && query.trim() && filteredNav.length === 0 && (
                <div className="px-5 py-3" style={{ borderTop: "1px solid var(--hairline)" }}>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    className="flex w-full items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition-colors"
                    style={{ color: "var(--color-accent)", background: "rgba(115,66,226,0.06)", border: "1px solid rgba(115,66,226,0.15)" }}
                  >
                    <Sparkles size={14} />
                    Ask AuditX: "{query.slice(0, 60)}{query.length > 60 ? "…" : ""}"
                    <ArrowRight size={14} className="ml-auto" />
                  </button>
                </div>
              )}

              {/* Footer */}
              <div
                className="flex items-center justify-between border-t px-5 py-2.5"
                style={{ borderColor: "var(--hairline)", background: "rgba(25,40,55,0.02)" }}
              >
                <span className="text-[11px]" style={{ color: "var(--ink-3)" }}>
                  Powered by AuditX Intelligence · Numbers from your ledger
                </span>
                <div className="flex items-center gap-3 text-[11px]" style={{ color: "var(--ink-3)" }}>
                  <span>↵ Ask</span>
                  <span>Esc Close</span>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ── Global Command Bar Provider ───────────────────────────────────────────────
// Handles Ctrl+K / ⌘K keyboard shortcut globally

import { createContext, useContext, type ReactNode } from "react";

interface CommandBarContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const CommandBarContext = createContext<CommandBarContextValue>({
  open: false,
  setOpen: () => {},
});

export function CommandBarProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: globalThis.KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <CommandBarContext.Provider value={{ open, setOpen }}>
      {children}
      <AuditXCommandBar open={open} onClose={() => setOpen(false)} />
    </CommandBarContext.Provider>
  );
}

export function useCommandBar() {
  return useContext(CommandBarContext);
}
