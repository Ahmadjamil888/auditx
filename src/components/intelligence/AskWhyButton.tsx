// ─── Ask Why Button ───────────────────────────────────────────────────────────
// "Every important financial number should have an intelligent Why? button."
// Opens an explanation panel for any metric.

import { AnimatePresence, motion } from "framer-motion";
import { HelpCircle, Loader2, Sparkles, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { GoogleGenAI } from "@google/genai";
import { useAuth } from "@/lib/auth-context";
import {
  getTaxLiability,
  getPortfolioSummary,
  getUnreconciledTransactions,
  getCriticalAnomalies,
  buildIntelligencePrompt,
  detectIntent,
  type IntelligenceToolContext,
} from "@/lib/intelligence-tools";

export interface AskWhyContext {
  metric: string;
  value: string | number;
  unit?: string;
  relatedPage?: string;
  transactionId?: string;
}

interface Props {
  context: AskWhyContext;
  className?: string;
}

export function AskWhyButton({ context, className }: Props) {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [response, setResponse] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    if (!profile?.org_id || hasLoaded) return;

    const apiKey = (import.meta.env["VITE_GOOGLE_AI_API_KEY"] as string | undefined) ?? "";
    if (!apiKey || apiKey.length < 10) {
      setResponse("Configure VITE_GOOGLE_AI_API_KEY to enable explanations.");
      setHasLoaded(true);
      return;
    }

    setIsStreaming(true);

    const toolCtx: IntelligenceToolContext = {
      orgId: profile.org_id,
      jurisdiction: (profile.jurisdiction as "PSX" | "NSE") ?? "PSX",
      taxYear: "2025",
      currentPage: context.relatedPage,
      currentTransactionId: context.transactionId,
    };

    const prompt = `Explain why ${context.metric} is ${context.value}${context.unit ? " " + context.unit : ""}.`;
    const intent = detectIntent(prompt, context.relatedPage?.split("/").pop());
    const toolResults = [];

    try {
      if (context.metric.toLowerCase().includes("tax")) {
        const tax = await getTaxLiability(toolCtx);
        toolResults.push(tax);
      } else if (context.metric.toLowerCase().includes("portfolio") || context.metric.toLowerCase().includes("value")) {
        const portfolio = await getPortfolioSummary(toolCtx);
        toolResults.push(portfolio);
      } else if (context.metric.toLowerCase().includes("unreconciled")) {
        const unreconciled = await getUnreconciledTransactions(toolCtx);
        toolResults.push(unreconciled);
      } else {
        const portfolio = await getPortfolioSummary(toolCtx);
        toolResults.push(portfolio);
      }

      const finalPrompt = buildIntelligencePrompt(prompt, intent, toolResults, {
        jurisdiction: toolCtx.jurisdiction,
        currentPage: context.relatedPage,
        transactionId: context.transactionId,
        taxYear: toolCtx.taxYear,
      });

      const ai = new GoogleGenAI({ apiKey });
      const stream = await ai.models.generateContentStream({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: finalPrompt }] }],
        config: { temperature: 0.3, maxOutputTokens: 400 },
      });

      let full = "";
      for await (const chunk of stream) {
        const t = chunk.text ?? "";
        full += t;
        setResponse(full);
      }
      setHasLoaded(true);
    } catch (err) {
      setResponse(`Unable to explain: ${(err as Error).message}`);
      setHasLoaded(true);
    } finally {
      setIsStreaming(false);
    }
  }, [profile, context, hasLoaded]);

  function handleClick() {
    setOpen(true);
    void load();
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleClick}
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-all hover:opacity-90 ${className ?? ""}`}
        style={{
          background: "rgba(115,66,226,0.08)",
          color: "var(--color-accent)",
          border: "1px solid rgba(115,66,226,0.15)",
        }}
        title={`Why is ${context.metric} ${context.value}?`}
      >
        <HelpCircle size={10} />
        Why?
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-50"
              style={{ background: "rgba(10,18,28,0.4)", backdropFilter: "blur(4px)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.div
              className="fixed bottom-8 left-1/2 z-50 w-full max-w-md -translate-x-1/2 md:bottom-auto md:top-1/4"
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.96 }}
              transition={{ duration: 0.2 }}
            >
              <div
                className="mx-4 overflow-hidden rounded-2xl bg-white"
                style={{ border: "1px solid var(--hairline)", boxShadow: "0 20px 60px rgba(10,18,28,0.15)" }}
              >
                {/* Header */}
                <div
                  className="flex items-center justify-between px-5 py-4"
                  style={{ borderBottom: "1px solid var(--hairline)" }}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="flex size-7 items-center justify-center rounded-lg"
                      style={{ background: "rgba(115,66,226,0.1)" }}
                    >
                      <Sparkles size={13} style={{ color: "var(--color-accent)" }} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Why {context.metric}?</p>
                      <p className="text-xs" style={{ color: "var(--ink-3)" }}>
                        <span className="tnum font-semibold" style={{ color: "var(--color-accent)" }}>
                          {typeof context.value === "number"
                            ? context.value.toLocaleString()
                            : context.value}
                        </span>
                        {context.unit ? ` ${context.unit}` : ""}
                      </p>
                    </div>
                  </div>
                  <button type="button" onClick={() => setOpen(false)} style={{ color: "var(--ink-3)" }}>
                    <X size={16} />
                  </button>
                </div>

                {/* Content */}
                <div className="max-h-80 overflow-y-auto px-5 py-4">
                  {isStreaming && !response && (
                    <div className="flex items-center gap-2" style={{ color: "var(--ink-3)" }}>
                      <Loader2 size={14} className="animate-spin" />
                      <span className="text-sm">Tracing calculation...</span>
                    </div>
                  )}
                  {response && (
                    <div className="text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
                      {response.split("\n").map((line, i) => {
                        if (line.startsWith("## ")) {
                          return (
                            <p key={i} className="mb-1 mt-3 font-semibold" style={{ color: "var(--color-text)", fontSize: "13px" }}>
                              {line.slice(3)}
                            </p>
                          );
                        }
                        if (line.startsWith("- ")) {
                          return <p key={i} className="mb-0.5 pl-3">• {line.slice(2)}</p>;
                        }
                        if (line.trim() === "") return <div key={i} className="h-2" />;
                        return <p key={i} className="mb-1 text-[13px]">{line}</p>;
                      })}
                      {isStreaming && (
                        <span className="inline-block h-3.5 w-1.5 animate-pulse rounded-sm" style={{ background: "var(--color-accent)" }} />
                      )}
                    </div>
                  )}
                </div>

                {!isStreaming && response && (
                  <div
                    className="px-5 py-3 text-[11px]"
                    style={{ borderTop: "1px solid var(--hairline)", color: "var(--ink-3)" }}
                  >
                    Numbers from your ledger · Deterministic calculation · AI interpretation only
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
