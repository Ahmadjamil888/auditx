import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { CheckCircle2, ChevronDown, Loader2 } from "lucide-react";
import { useState } from "react";
import { StatusPill } from "@/components/kit";
import type { ExtractedField } from "@/lib/ai-service";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";

function ConfidenceBadge({ score }: { score: number }) {
  const tone = score >= 0.9 ? "ok" : score >= 0.75 ? "warn" : "bad";
  return <StatusPill tone={tone}>{score.toFixed(2)}</StatusPill>;
}

/** Structured extraction result for one attached document, with inline edit + ledger posting. */
export function ExtractedFieldsCard({
  fileName,
  fields,
}: {
  fileName: string;
  fields: ExtractedField[];
}) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(true);
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState(false);
  const [error, setError] = useState("");

  const lowConf = fields.filter((f) => f.confidence < 0.75);

  async function postToLedger() {
    if (!profile?.org_id) {
      setError("Profile is still loading — try again in a moment.");
      return;
    }
    setPosting(true);
    setError("");

    const get = (name: string) => {
      const f = fields.find((x) => x.field === name);
      return (edited[name] ?? f?.value ?? "").trim();
    };

    const ticker = get("Ticker Symbol").toUpperCase();
    const action = get("Action").toUpperCase() as "BUY" | "SELL" | "DIV";
    const quantity = parseFloat(get("Quantity").replace(/,/g, "")) || 0;
    const price = parseFloat(get("Execution Price").replace(/[^\d.]/g, "")) || 0;
    const fees = parseFloat(get("Commission / Fees").replace(/[^\d.]/g, "")) || 0;
    const wht = parseFloat(get("WHT").replace(/[^\d.]/g, "")) || 0;
    const trade_date = get("Transaction Date");
    const ref_id = get("Reference ID") || `AUTO-${Date.now()}`;
    const broker = get("Broker Name");
    const exchange = get("Exchange") || profile.jurisdiction;

    const fail = (m: string) => {
      setError(m);
      setPosting(false);
    };
    if (!ticker) return fail("Ticker symbol is required.");
    if (!["BUY", "SELL", "DIV"].includes(action)) return fail("Action must be BUY, SELL, or DIV.");
    if (!quantity || quantity <= 0) return fail("Quantity must be a positive number.");
    if (!price || price <= 0) return fail("Execution price must be a positive number.");
    if (!trade_date) return fail("Transaction date is required.");

    const overall = fields.reduce((s, f) => s + f.confidence, 0) / (fields.length || 1);

    const { error: dbError } = await supabase.from("transactions").insert({
      org_id: profile.org_id,
      ticker,
      action,
      quantity,
      price,
      fees,
      wht,
      trade_date,
      ref_id,
      confidence_score: parseFloat(overall.toFixed(3)),
      status: overall < 0.75 ? "needs_review" : "posted",
      exchange,
      broker,
      source: { filename: fileName, extracted_at: new Date().toISOString() },
    });

    if (dbError) return fail(`Save failed: ${dbError.message}`);

    await queryClient.invalidateQueries({ queryKey: ["transactions", profile.org_id] });
    setPosted(true);
    setPosting(false);
  }

  return (
    <div className="overflow-hidden rounded-2xl bg-white" style={{ border: "1px solid var(--hairline)" }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-4 py-3"
      >
        <span className="truncate text-sm font-semibold">Extracted fields · {fileName}</span>
        <span className="ml-auto flex items-center gap-2">
          {lowConf.length > 0 ? (
            <StatusPill tone="warn">{lowConf.length} low confidence</StatusPill>
          ) : (
            <StatusPill tone="ok">Verified</StatusPill>
          )}
          <ChevronDown
            size={14}
            strokeWidth={2}
            className="transition-transform"
            style={{ color: "var(--ink-3)", transform: open ? "rotate(180deg)" : "none" }}
          />
        </span>
      </button>

      {open && (
        <div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr style={{ borderTop: "1px solid var(--hairline)", background: "var(--color-login-bg)" }}>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold" style={{ color: "var(--ink-2)" }}>Field</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold" style={{ color: "var(--ink-2)" }}>Value</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold" style={{ color: "var(--ink-2)" }}>Confidence</th>
                </tr>
              </thead>
              <tbody>
                {fields.map((f, i) => (
                  <motion.tr
                    key={f.field}
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(i * 0.03, 0.3) }}
                    style={{
                      borderTop: "1px solid var(--hairline)",
                      background: f.confidence < 0.75 ? "rgba(214,69,69,0.04)" : "transparent",
                    }}
                  >
                    <td className="px-4 py-2.5 text-xs font-medium whitespace-nowrap" style={{ color: "var(--ink-2)" }}>
                      {f.field}
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        value={edited[f.field] ?? f.value}
                        onChange={(e) => setEdited((p) => ({ ...p, [f.field]: e.target.value }))}
                        disabled={posted}
                        className="w-full rounded-lg border bg-transparent px-2 py-1 text-sm outline-none focus:bg-white focus:ring-2"
                        style={{ borderColor: "transparent", ["--tw-ring-color" as string]: "var(--color-accent)" }}
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <ConfidenceBadge score={f.confidence} />
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-3 px-4 py-3" style={{ borderTop: "1px solid var(--hairline)" }}>
            {posted ? (
              <span className="inline-flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--ok)" }}>
                <CheckCircle2 size={16} strokeWidth={1.75} /> Posted to ledger
              </span>
            ) : (
              <button
                type="button"
                onClick={postToLedger}
                disabled={posting}
                className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold text-white transition-opacity disabled:opacity-50"
                style={{ background: "var(--color-accent)", boxShadow: "0 4px 24px rgba(115,66,226,0.28)" }}
              >
                {posting ? (
                  <><Loader2 size={14} strokeWidth={2} className="animate-spin" /> Saving…</>
                ) : (
                  <><CheckCircle2 size={14} strokeWidth={2} /> Post to Ledger</>
                )}
              </button>
            )}
            {error && (
              <span className="text-xs" style={{ color: "var(--bad)" }}>{error}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
