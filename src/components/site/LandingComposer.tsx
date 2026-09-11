// ─── LandingComposer — premium AI task input for the home page ───────────────
// • Draft text persists across page reloads (localStorage)
// • File list clears on navigation (in-memory only)
// • Suggestion chips wire directly to the agent workspace

import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp, Paperclip, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  loadComposerDraft,
  saveComposerDraft,
  setPendingFiles,
  setPendingPrompt,
} from "@/lib/chat-session";

// ── Suggestion chips ──────────────────────────────────────────────────────────

export const LANDING_SUGGESTIONS = [
  { label: "Analyze portfolio",           prompt: "Analyze my current portfolio performance, concentration risk, and cost basis from my ledger." },
  { label: "Review financial statement",  prompt: "Review my uploaded statement or ledger, extract every field, and summarize what needs attention." },
  { label: "Reconcile trades",            prompt: "Reconcile my recent trades against my ledger and list matched, unmatched and partial matches with evidence." },
  { label: "Detect anomalies",            prompt: "Scan my ledger and open flags for anomalies, duplicates, fee surcharges and WHT mismatches." },
  { label: "Calculate tax impact",        prompt: "Calculate my realised capital gains and estimated CGT using the FIFO engine on my ledger." },
  { label: "Update unfinished records",   prompt: "Update my unfinished records that still need review, then prepare a spreadsheet template for new transactions." },
] as const;

// ── Component ─────────────────────────────────────────────────────────────────

export function LandingComposer() {
  const { session, loading } = useAuth();
  const navigate             = useNavigate();
  const fileRef              = useRef<HTMLInputElement>(null);
  const textareaRef          = useRef<HTMLTextAreaElement>(null);

  // Persist draft across page reloads
  const [value, setValue]   = useState(() => loadComposerDraft("landing"));
  const [files,  setFiles]  = useState<File[]>([]);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    saveComposerDraft("landing", value);
  }, [value]);

  // Auto-grow textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, [value]);

  const canSend = value.trim().length > 0 || files.length > 0;

  const goToWorkspace = (prompt: string, attached: File[]) => {
    const text    = prompt.trim();
    const message = text || "Analyse the attached document(s).";
    // Always persist the prompt first — it survives the auth redirect
    saveComposerDraft("landing", message);
    setPendingPrompt(message);
    setPendingFiles(attached);
    if (!loading && session) {
      navigate({ to: "/app/parser" });
    } else {
      // Redirect to signin (existing users) — signup link is available there too.
      // The pending prompt is in localStorage and will auto-fire once the
      // workspace opens after authentication.
      navigate({ to: "/signin" });
    }
  };

  return (
    <div className="mx-auto w-full max-w-[720px]">
      {/* ── Composer box ──────────────────────────────────────────────────── */}
      <motion.div
        animate={{
          boxShadow: focused
            ? "0 0 0 2px rgba(115,66,226,0.25), 0 12px 40px rgba(115,66,226,0.1)"
            : "0 8px 32px rgba(25,40,55,0.08)",
          borderColor: focused ? "rgba(115,66,226,0.4)" : "rgba(25,40,55,0.1)",
        }}
        transition={{ duration: 0.2 }}
        className="overflow-hidden rounded-[24px] bg-white"
        style={{ border: "1.5px solid rgba(25,40,55,0.1)" }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          setFiles((prev) => [...prev, ...Array.from(e.dataTransfer.files)]);
        }}
      >
        <input
          ref={fileRef}
          type="file"
          multiple
          className="sr-only"
          accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.xlsx,.xls,.txt"
          onChange={(e) => {
            setFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />

        {/* Attached files */}
        <AnimatePresence>
          {files.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex flex-wrap gap-2 px-5 pt-4"
            >
              {files.map((file, i) => (
                <span
                  key={`${file.name}-${i}`}
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs"
                  style={{
                    background: "rgba(115,66,226,0.07)",
                    color: "var(--color-accent)",
                    border: "1px solid rgba(115,66,226,0.15)",
                  }}
                >
                  📎 {file.name}
                  <button
                    type="button"
                    aria-label={`Remove ${file.name}`}
                    onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                    className="hover:opacity-60"
                  >
                    <X size={11} strokeWidth={2} />
                  </button>
                </span>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Textarea */}
        <div className="px-5 pt-4 pb-3">
          <textarea
            ref={textareaRef}
            rows={2}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (canSend) goToWorkspace(value, files);
              }
            }}
            placeholder="Ask anything about your finances, trades, documents, or financial data…"
            className="w-full resize-none bg-transparent text-base leading-relaxed outline-none"
            style={{
              color: "var(--color-text)",
              minHeight: 56,
              fontFamily: "var(--font-body)",
            }}
          />
        </div>

        {/* Bottom toolbar */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderTop: "1px solid rgba(25,40,55,0.06)" }}
        >
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex size-9 items-center justify-center rounded-full transition-colors hover:bg-black/5"
              aria-label="Attach files"
              title="Attach PDF, CSV, XLSX, image"
              style={{ color: "var(--ink-3)" }}
            >
              <Paperclip size={17} strokeWidth={1.75} />
            </button>
            <span className="hidden text-xs sm:block" style={{ color: "var(--ink-3)" }}>
              PDF · CSV · XLSX · PNG
            </span>
          </div>

          <button
            type="button"
            disabled={!canSend}
            onClick={() => goToWorkspace(value, files)}
            aria-label="Send"
            className="flex size-10 items-center justify-center rounded-full text-white transition-all disabled:opacity-30"
            style={{
              background: canSend ? "var(--color-accent)" : "var(--ink-3)",
              boxShadow: canSend ? "0 4px 16px rgba(115,66,226,0.3)" : "none",
            }}
          >
            <ArrowUp size={18} strokeWidth={2.25} />
          </button>
        </div>
      </motion.div>

      {/* ── Suggestion chips ──────────────────────────────────────────────── */}
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {LANDING_SUGGESTIONS.map((chip) => (
          <button
            key={chip.label}
            type="button"
            onClick={() => {
              setValue(chip.prompt);
              goToWorkspace(chip.prompt, files);
            }}
            className="group flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-xs font-medium transition-all hover:border-[rgba(115,66,226,0.3)] hover:shadow-sm sm:text-sm"
            style={{
              border: "1px solid var(--hairline)",
              color: "var(--ink-2)",
            }}
          >
            <Sparkles
              size={11}
              strokeWidth={2}
              className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
              style={{ color: "var(--color-accent)" }}
            />
            {chip.label}
          </button>
        ))}
      </div>
    </div>
  );
}
