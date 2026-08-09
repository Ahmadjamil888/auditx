import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Loader2,
  RefreshCw,
  Upload,
  X,
} from "lucide-react";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Panel, StatusPill } from "@/components/kit";
import { parseDocument, parseTextDocument, type ExtractedField } from "@/lib/ai-service";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/app/parser")({
  component: Parser,
});

// ── Types ─────────────────────────────────────────────────────────────────────

type ParseStep = "idle" | "uploading" | "extracting" | "validating" | "ready" | "error";

const STEP_LABELS: Record<ParseStep, string> = {
  idle:       "",
  uploading:  "Reading document…",
  extracting: "Gemini AI extracting fields…",
  validating: "Validating schema & confidence…",
  ready:      "Ready for review",
  error:      "Extraction failed",
};

// ── Sample slips ──────────────────────────────────────────────────────────────

const SAMPLE_SLIPS = [
  {
    label: "PSX Broker Slip",
    desc:  "Meridian Capital · OGDC BUY",
    text: `MERIDIAN CAPITAL (PVT) LTD
TRADE CONFIRMATION
Date: 28-Aug-2025
Ref: PSX-8821-K

TRANSACTION DETAILS:
Symbol: OGDC
Action: BUY
Quantity: 500 shares
Rate: PKR 104.50 per share
Gross Value: PKR 52,250.00

CHARGES:
Brokerage: PKR 1,044.00 (2%)
CDC Charges: PKR 150.00
SECP Levy: PKR 130.63
Total Fees: PKR 1,324.63

Settlement Date: 30-Aug-2025
Exchange: PSX`,
  },
  {
    label: "NSE Contract Note",
    desc:  "Nifty Desk · TCS SELL",
    text: `NIFTY DESK SECURITIES LTD
CONTRACT NOTE
Date: 28/08/2025
Order Ref: NSE-55421

TRADE DETAILS:
Scrip: TCS
Exchange: NSE
Trade Type: SELL
Qty: 25
Rate: INR 4,280.00
Gross: INR 1,07,000.00

DEDUCTIONS:
Brokerage: INR 535.00
STT: INR 107.00
Total Charges: INR 751.30

Net Receivable: INR 1,06,248.70`,
  },
  {
    label: "Dividend Voucher",
    desc:  "MCB Bank · Dividend",
    text: `MCB BANK LIMITED
DIVIDEND PAYMENT ADVICE
FY 2025 — Final Dividend

Shares Held: 1,000
Dividend Rate: PKR 4.50 per share
Gross Dividend: PKR 4,500.00
WHT Deducted (10% Filer): PKR 450.00
Net Amount: PKR 4,050.00

Payment Date: 25-Aug-2025
Exchange: PSX`,
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function isTextFile(file: File): boolean {
  return (
    file.type.includes("text") ||
    file.type.includes("csv") ||
    file.name.endsWith(".csv") ||
    file.name.endsWith(".txt")
  );
}

function isXlsxFile(file: File): boolean {
  return (
    file.type.includes("spreadsheet") ||
    file.type.includes("excel") ||
    file.name.endsWith(".xlsx") ||
    file.name.endsWith(".xls")
  );
}

function ConfidenceBadge({ score }: { score: number }) {
  const tone = score >= 0.9 ? "ok" : score >= 0.75 ? "warn" : "bad";
  return <StatusPill tone={tone}>{score.toFixed(2)}</StatusPill>;
}

// ── Component ─────────────────────────────────────────────────────────────────

function Parser() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const inputId = "parser-file-input";
  const inputRef = useRef<HTMLInputElement>(null);

  const [dragging,     setDragging]     = useState(false);
  const [step,         setStep]         = useState<ParseStep>("idle");
  const [fileName,     setFileName]     = useState("");
  const [fields,       setFields]       = useState<ExtractedField[]>([]);
  const [editedFields, setEditedFields] = useState<Record<string, string>>({});
  const [errorMsg,     setErrorMsg]     = useState("");
  const [posted,       setPosted]       = useState(false);
  const [posting,      setPosting]      = useState(false);

  // ── Pipeline ────────────────────────────────────────────────────────────────

  async function runPipeline(file: File | null, sampleText: string | null, name: string) {
    setFileName(name);
    setFields([]);
    setEditedFields({});
    setErrorMsg("");
    setPosted(false);
    setPosting(false);

    try {
      setStep("uploading");
      setStep("extracting");

      let result;

      if (file) {
        if (isXlsxFile(file)) {
          const base64 = await fileToBase64(file);
          result = await parseDocument(
            base64,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            name,
          );
        } else if (isTextFile(file)) {
          const text = await file.text();
          result = await parseTextDocument(text, name);
        } else {
          const base64 = await fileToBase64(file);
          result = await parseDocument(base64, file.type || "application/pdf", name);
        }
      } else if (sampleText) {
        result = await parseTextDocument(sampleText, name);
      } else {
        throw new Error("No file or sample provided.");
      }

      setStep("validating");
      await new Promise((r) => setTimeout(r, 300));
      setFields(result.fields);
      setStep("ready");
    } catch (e) {
      setErrorMsg((e as Error).message);
      setStep("error");
    }
  }

  // ── File input handler ────────────────────────────────────────────────────

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) runPipeline(file, null, file.name);
    // Reset so the same file can be re-picked
    e.target.value = "";
  }

  // ── Drag-and-drop ─────────────────────────────────────────────────────────

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) runPipeline(file, null, file.name);
  }

  // ── Post to ledger ────────────────────────────────────────────────────────

  async function postToLedger() {
    if (!profile?.org_id) {
      setErrorMsg("Profile not loaded yet — wait a moment and try again.");
      return;
    }

    setPosting(true);
    setErrorMsg("");

    const get = (fieldName: string): string => {
      const f = fields.find((x) => x.field === fieldName);
      return (editedFields[fieldName] ?? f?.value ?? "").trim();
    };

    const ticker     = get("Ticker Symbol").toUpperCase();
    const action     = get("Action").toUpperCase() as "BUY" | "SELL" | "DIV";
    const quantity   = parseFloat(get("Quantity").replace(/,/g, "")) || 0;
    const price      = parseFloat(get("Execution Price").replace(/[^\d.]/g, "")) || 0;
    const fees       = parseFloat(get("Commission / Fees").replace(/[^\d.]/g, "")) || 0;
    const wht        = parseFloat(get("WHT").replace(/[^\d.]/g, "")) || 0;
    const trade_date = get("Transaction Date");
    const ref_id     = get("Reference ID") || `AUTO-${Date.now()}`;
    const broker     = get("Broker Name");
    const exchange   = get("Exchange") || profile.jurisdiction;

    if (!ticker)                              { setErrorMsg("Ticker symbol is required.");              setPosting(false); return; }
    if (!["BUY","SELL","DIV"].includes(action)) { setErrorMsg("Action must be BUY, SELL, or DIV.");    setPosting(false); return; }
    if (!quantity || quantity <= 0)           { setErrorMsg("Quantity must be a positive number.");     setPosting(false); return; }
    if (!price || price <= 0)                 { setErrorMsg("Execution price must be a positive number."); setPosting(false); return; }
    if (!trade_date)                          { setErrorMsg("Transaction date is required.");           setPosting(false); return; }

    const overall_conf = fields.reduce((s, f) => s + f.confidence, 0) / (fields.length || 1);
    const status = overall_conf < 0.75 ? "needs_review" : "posted";

    const { error } = await supabase.from("transactions").insert({
      org_id:           profile.org_id,
      ticker,
      action,
      quantity,
      price,
      fees,
      wht,
      trade_date,
      ref_id,
      confidence_score: parseFloat(overall_conf.toFixed(3)),
      status,
      exchange,
      broker,
      source: { filename: fileName, extracted_at: new Date().toISOString() },
    });

    if (error) {
      setErrorMsg(`Save failed: ${error.message}`);
      setPosting(false);
      return;
    }

    await queryClient.invalidateQueries({ queryKey: ["transactions", profile.org_id] });
    setPosted(true);
    setPosting(false);

    setTimeout(reset, 2000);
  }

  function reset() {
    setStep("idle");
    setFields([]);
    setFileName("");
    setErrorMsg("");
    setEditedFields({});
    setPosted(false);
    setPosting(false);
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const isBusy    = step === "uploading" || step === "extracting" || step === "validating";
  const lowConf   = fields.filter((f) => f.confidence < 0.75);
  const canPost   = fields.length > 0 && step === "ready" && !posted && !posting;
  const stepOrder: ParseStep[] = ["uploading", "extracting", "validating", "ready"];
  const apiKeyMissing = !import.meta.env['VITE_GOOGLE_AI_API_KEY'];

  return (
    <div className="space-y-6 p-4 sm:p-6">

      {/* Header */}
      <div>
        <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "1.5rem" }}>
          Statement Parser
        </h1>
        <p className="mt-0.5 text-sm" style={{ color: "var(--ink-2)" }}>
          Drop any broker slip, contract note, dividend voucher, CSV or XLSX.
          Gemini AI extracts every field with a per-field confidence score.
        </p>

        {apiKeyMissing && (
          <div
            className="mt-3 flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm"
            style={{ background: "rgba(201,138,26,0.08)", border: "1px solid rgba(201,138,26,0.2)" }}
          >
            <AlertCircle size={15} strokeWidth={1.75} style={{ color: "var(--warn)", flexShrink: 0, marginTop: 1 }} />
            <span style={{ color: "var(--ink-2)" }}>
              <strong>VITE_GOOGLE_AI_API_KEY</strong> is not set. Add it to{" "}
              <code>.env</code> to enable AI extraction.{" "}
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--color-accent)" }}
              >
                Get a free key →
              </a>
            </span>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">

        {/* ── Left column ─────────────────────────────────────────────────── */}
        <div className="space-y-4">

          {/*
            The hidden <input> sits outside the label visually but is
            linked via htmlFor/id — the label click always opens the dialog.
            The entire drop-zone area is the label, so clicking anywhere
            on it reliably triggers the file picker.
          */}
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            className="sr-only"
            accept=".pdf,.png,.jpg,.jpeg,.csv,.xlsx,.xls,.txt"
            disabled={isBusy}
            onChange={handleFileChange}
          />

          {/* Drop zone — wrapping label opens file picker on click */}
          <label
            htmlFor={inputId}
            onDragOver={(e) => { e.preventDefault(); if (!isBusy) setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); if (!isBusy) { const f = e.dataTransfer.files[0]; if (f) runPipeline(f, null, f.name); } }}
            className="flex cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed p-10 text-center transition-colors select-none"
            style={{
              borderColor: dragging        ? "var(--color-accent)"
                         : isBusy         ? "var(--hairline)"
                         :                  "rgba(25,40,55,0.18)",
              background:  dragging        ? "rgba(115,66,226,0.05)"
                         :                  "var(--color-login-bg)",
              cursor: isBusy ? "default" : "pointer",
              opacity: isBusy ? 0.6 : 1,
            }}
          >
            <div
              className="flex size-14 items-center justify-center rounded-2xl"
              style={{ background: "rgba(115,66,226,0.1)" }}
            >
              <Upload size={26} strokeWidth={1.75} style={{ color: "var(--color-accent)" }} />
            </div>

            <div>
              <p className="font-semibold">Click to upload or drag & drop</p>
              <p className="mt-1 text-sm" style={{ color: "var(--ink-3)" }}>
                PDF · PNG · JPG · CSV · XLSX · Max 20 MB
              </p>
            </div>

            {/* Visible button — clicking it also triggers the label's htmlFor */}
            <span
              className="inline-flex items-center gap-2 rounded-full border bg-white px-5 py-2 text-sm font-semibold transition-shadow hover:shadow-md"
              style={{ borderColor: "var(--hairline)", color: "var(--color-text)" }}
            >
              <FileText size={16} strokeWidth={1.75} />
              Browse files
            </span>
          </label>

          {/* Sample slips */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ink-3)" }}>
              Or try a sample slip:
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              {SAMPLE_SLIPS.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => runPipeline(null, s.text, `${s.label}.txt`)}
                  disabled={isBusy}
                  className="rounded-xl border bg-white px-3 py-2.5 text-left transition-shadow hover:shadow-md disabled:opacity-50"
                  style={{ borderColor: "var(--hairline)" }}
                >
                  <p className="text-xs font-semibold">{s.label}</p>
                  <p className="mt-0.5 text-xs" style={{ color: "var(--ink-3)" }}>{s.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Progress panel */}
          <AnimatePresence>
            {step !== "idle" && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <Panel>
                  <div className="flex items-center justify-between">
                    <p className="truncate pr-2 text-sm font-medium">{fileName}</p>
                    {step === "error"   && <AlertCircle  size={16} strokeWidth={1.75} style={{ color: "var(--bad)", flexShrink: 0 }} />}
                    {step === "ready"   && <CheckCircle2 size={16} strokeWidth={1.75} style={{ color: "var(--ok)",  flexShrink: 0 }} />}
                    {isBusy            && <Loader2 size={16} strokeWidth={1.75} className="animate-spin shrink-0" style={{ color: "var(--color-accent)" }} />}
                  </div>

                  {/* Progress bar */}
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--color-login-bg)" }}>
                    <motion.div
                      className="h-full rounded-full"
                      style={{
                        background:
                          step === "error"      ? "var(--bad)"
                        : step === "ready"      ? "var(--ok)"
                        :                         "var(--color-accent)",
                      }}
                      animate={{
                        width:
                          step === "error"      ? "100%"
                        : step === "ready"      ? "100%"
                        : step === "validating" ? "85%"
                        : step === "extracting" ? "55%"
                        :                         "20%",
                      }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>

                  {/* Step checklist */}
                  <div className="mt-4 space-y-2">
                    {stepOrder.map((s) => {
                      const done   = stepOrder.indexOf(step) > stepOrder.indexOf(s) && step !== "error";
                      const active = step === s;
                      return (
                        <div key={s} className="flex items-center gap-2.5 text-xs">
                          <span
                            className="flex size-4 shrink-0 items-center justify-center rounded-full"
                            style={{
                              background: done || active ? "var(--color-accent)" : "var(--color-login-bg)",
                              border: `1px solid ${done || active ? "var(--color-accent)" : "var(--hairline)"}`,
                            }}
                          >
                            {done && <CheckCircle2 size={10} strokeWidth={2.5} color="#fff" />}
                          </span>
                          <span style={{ color: active ? "var(--color-text)" : "var(--ink-3)", fontWeight: active ? 500 : 400 }}>
                            {STEP_LABELS[s]}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {step === "error" && errorMsg && (
                    <div className="mt-3 rounded-xl px-3 py-2 text-xs" style={{ background: "rgba(214,69,69,0.07)", color: "var(--bad)" }}>
                      {errorMsg}
                    </div>
                  )}

                  {step === "error" && (
                    <button
                      type="button"
                      onClick={reset}
                      className="mt-3 flex items-center gap-1.5 text-xs font-medium"
                      style={{ color: "var(--color-accent)" }}
                    >
                      <RefreshCw size={12} strokeWidth={2} /> Try again
                    </button>
                  )}
                </Panel>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Right column: extracted fields ──────────────────────────────── */}
        <div>
          <AnimatePresence mode="wait">

            {fields.length > 0 && (
              <motion.div
                key="fields"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Extracted fields</p>
                  {lowConf.length > 0
                    ? <StatusPill tone="warn">{lowConf.length} low confidence — edit below</StatusPill>
                    : <StatusPill tone="ok">All fields verified</StatusPill>
                  }
                </div>

                <div className="overflow-hidden rounded-2xl bg-white" style={{ border: "1px solid var(--hairline)" }}>
                  <table className="w-full border-collapse">
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--hairline)", background: "var(--color-login-bg)" }}>
                        <th className="px-4 py-3 text-left text-xs font-semibold" style={{ color: "var(--ink-2)" }}>Field</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold" style={{ color: "var(--ink-2)" }}>Value</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold" style={{ color: "var(--ink-2)" }}>Confidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fields.map((f, i) => (
                        <motion.tr
                          key={f.field}
                          initial={{ opacity: 0, x: 10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.04 }}
                          style={{
                            borderBottom: "1px solid var(--hairline)",
                            background: f.confidence < 0.75 ? "rgba(214,69,69,0.04)" : "transparent",
                          }}
                        >
                          <td className="px-4 py-3 text-xs font-medium" style={{ color: "var(--ink-2)" }}>{f.field}</td>
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              value={editedFields[f.field] ?? f.value}
                              onChange={(e) => setEditedFields((prev) => ({ ...prev, [f.field]: e.target.value }))}
                              className="w-full rounded-lg border bg-transparent px-2 py-1 text-sm outline-none focus:bg-white focus:ring-2"
                              style={{ borderColor: "transparent", ["--tw-ring-color" as string]: "var(--color-accent)" }}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <ConfidenceBadge score={f.confidence} />
                          </td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {lowConf.length > 0 && (
                  <p className="text-xs" style={{ color: "var(--warn)" }}>
                    Red-highlighted fields have confidence &lt; 0.75 — edit any value before posting.
                  </p>
                )}

                {errorMsg && step !== "error" && (
                  <div className="rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(214,69,69,0.07)", color: "var(--bad)" }}>
                    {errorMsg}
                  </div>
                )}

                <div className="flex gap-3">
                  {posted ? (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="flex flex-1 items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold"
                      style={{ background: "rgba(31,157,99,0.1)", color: "var(--ok)" }}
                    >
                      <CheckCircle2 size={16} strokeWidth={1.75} />
                      Posted to ledger!
                    </motion.div>
                  ) : (
                    <button
                      type="button"
                      disabled={!canPost || posting}
                      onClick={postToLedger}
                      className="flex flex-1 items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
                      style={{ background: "var(--color-accent)", boxShadow: "0 4px 24px rgba(115,66,226,0.28)" }}
                    >
                      {posting
                        ? <><Loader2 size={16} strokeWidth={1.75} className="animate-spin" /> Saving…</>
                        : <><CheckCircle2 size={16} strokeWidth={1.75} /> Post to Ledger</>
                      }
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={reset}
                    disabled={posting}
                    className="flex items-center justify-center rounded-full border px-4 py-3 text-sm font-medium transition-shadow hover:shadow-md disabled:opacity-50"
                    style={{ borderColor: "var(--hairline)" }}
                  >
                    <X size={16} strokeWidth={1.75} />
                  </button>
                </div>

                {!profile?.org_id && (
                  <p className="text-xs" style={{ color: "var(--warn)" }}>
                    Your profile is still loading — wait a moment before posting.
                  </p>
                )}
              </motion.div>
            )}

            {step === "idle" && fields.length === 0 && (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-2xl"
                style={{ background: "var(--color-login-bg)" }}
              >
                <FileText size={32} strokeWidth={1.5} style={{ color: "var(--ink-3)" }} />
                <p className="text-sm font-medium" style={{ color: "var(--ink-2)" }}>
                  Extracted fields appear here
                </p>
                <p className="px-8 text-center text-xs" style={{ color: "var(--ink-3)" }}>
                  Upload a document or try a sample slip to start AI extraction
                </p>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
