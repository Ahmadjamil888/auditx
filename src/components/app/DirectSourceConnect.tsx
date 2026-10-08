// ─── Direct Source Connection Wizard ─────────────────────────────────────────
// Lets the user connect an Excel file (upload) or a Google Sheet (URL paste)
// directly from Settings. Shows an AI permission prompt before any write.
// On approval the file is pushed to /api/documents/upload (Excel) or
// saved as a connected_source (Google Sheets).

import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  FileSpreadsheet,
  Link2,
  Loader2,
  Lock,
  RefreshCw,
  RotateCcw,
  Sheet,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { useQueryClient } from "@tanstack/react-query";

// ── Types ──────────────────────────────────────────────────────────────────────
type Step = "choose" | "excel-pick" | "sheet-url" | "permission" | "pushing" | "done" | "error";
type SourceMode = "excel" | "sheets";

interface PermissionRequest {
  mode:       SourceMode;
  filename:   string;
  rowCount:   number;
  actions:    string[];  // what the AI will do
  reversible: boolean;
}

// ── Permission banner ─────────────────────────────────────────────────────────
function PermissionPrompt({
  req,
  onApprove,
  onCancel,
}: {
  req:       PermissionRequest;
  onApprove: () => void;
  onCancel:  () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="overflow-hidden rounded-2xl"
      style={{ border: "1px solid rgba(115,66,226,0.25)", background: "rgba(115,66,226,0.03)" }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 border-b px-5 py-4"
        style={{ borderColor: "rgba(115,66,226,0.15)" }}>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl"
          style={{ background: "rgba(115,66,226,0.12)" }}>
          <ShieldCheck size={16} strokeWidth={1.75} style={{ color: "var(--color-accent)" }} />
        </span>
        <div>
          <p className="text-sm font-semibold">AuditX wants permission to access your data</p>
          <p className="text-xs" style={{ color: "var(--ink-3)" }}>
            Review what will happen before approving
          </p>
        </div>
      </div>

      {/* Details */}
      <div className="px-5 py-4 space-y-3">
        <div className="flex items-start gap-2 text-sm">
          <FileSpreadsheet size={15} style={{ color: "var(--color-accent)", marginTop: 1, flexShrink: 0 }} />
          <span>
            <strong>{req.filename}</strong>
            {req.rowCount > 0 && <span style={{ color: "var(--ink-3)" }}> · ~{req.rowCount} rows detected</span>}
          </span>
        </div>

        <div className="rounded-xl p-4 space-y-2"
          style={{ background: "rgba(25,40,55,0.04)", border: "1px solid var(--hairline)" }}>
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ink-3)" }}>
            AuditX will:
          </p>
          {req.actions.map((a, i) => (
            <div key={i} className="flex items-start gap-2 text-sm">
              <ChevronRight size={12} style={{ color: "var(--color-accent)", marginTop: 3, flexShrink: 0 }} />
              <span style={{ color: "var(--ink-2)" }}>{a}</span>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs"
          style={{ background: "rgba(31,157,99,0.08)", border: "1px solid rgba(31,157,99,0.2)" }}>
          <Lock size={11} style={{ color: "var(--ok)", flexShrink: 0 }} />
          <span style={{ color: "var(--ok)" }}>
            {req.reversible
              ? "Every change is logged and reversible from the Activity Feed."
              : "Read-only — no changes will be made to your source file."}
          </span>
        </div>

        <p className="text-xs" style={{ color: "var(--ink-3)" }}>
          AuditX will <strong>never</strong> overwrite your source file.
          Extracted data is written to a separate derived ledger only.
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 border-t px-5 py-3"
        style={{ borderColor: "var(--hairline)" }}>
        <button type="button" onClick={onCancel}
          className="rounded-full border px-4 py-2 text-sm font-medium transition-colors hover:bg-black/5"
          style={{ borderColor: "var(--hairline)" }}>
          Cancel
        </button>
        <button type="button" onClick={onApprove}
          className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white"
          style={{ background: "var(--color-accent)" }}>
          <ShieldCheck size={14} />
          Allow access
        </button>
      </div>
    </motion.div>
  );
}

// ── Excel upload step ─────────────────────────────────────────────────────────
function ExcelPickStep({
  onFile,
  onBack,
}: {
  onFile: (f: File, rowCount: number) => void;
  onBack: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging]   = useState(false);
  const [fileName, setFileName]   = useState<string | null>(null);
  const [rowCount, setRowCount]   = useState(0);
  const [pending,  setPending]    = useState<File | null>(null);
  const [counting, setCounting]   = useState(false);

  async function processFile(file: File) {
    setFileName(file.name);
    setPending(file);
    setCounting(true);
    // Count rows client-side without AI
    try {
      if (file.name.endsWith(".csv") || file.name.endsWith(".txt")) {
        const text = await file.text();
        setRowCount(Math.max(0, text.split("\n").filter(Boolean).length - 1));
      } else {
        // XLSX — use xlsx library
        const XLSX = await import("xlsx");
        const buf  = await file.arrayBuffer();
        const wb   = XLSX.read(buf, { type: "array" });
        let rows   = 0;
        for (const name of wb.SheetNames) {
          const sheet = wb.Sheets[name];
          if (sheet) rows += XLSX.utils.sheet_to_json(sheet).length;
        }
        setRowCount(rows);
      }
    } catch { setRowCount(0); }
    setCounting(false);
  }

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack}
        className="flex items-center gap-1.5 text-xs font-medium" style={{ color: "var(--ink-3)" }}>
        <RotateCcw size={11} /> Back
      </button>

      <p className="text-sm font-semibold">Upload Excel or CSV file</p>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) void processFile(f); }}
        onClick={() => inputRef.current?.click()}
        className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed py-10 transition-colors"
        style={{
          borderColor: dragging ? "var(--color-accent)" : "var(--hairline)",
          background:  dragging ? "rgba(115,66,226,0.04)" : "rgba(25,40,55,0.02)",
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv,.txt"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void processFile(f); }}
        />
        <FileSpreadsheet size={28} strokeWidth={1.5} style={{ color: dragging ? "var(--color-accent)" : "var(--ink-3)" }} />
        <p className="mt-3 text-sm font-medium" style={{ color: dragging ? "var(--color-accent)" : "var(--color-text)" }}>
          {fileName ? fileName : "Drop your file here, or click to browse"}
        </p>
        <p className="mt-1 text-xs" style={{ color: "var(--ink-3)" }}>
          Supports .xlsx · .xls · .csv · .txt
        </p>
        {counting && (
          <p className="mt-2 flex items-center gap-1.5 text-xs" style={{ color: "var(--ink-3)" }}>
            <Loader2 size={11} className="animate-spin" /> Counting rows…
          </p>
        )}
        {!counting && rowCount > 0 && (
          <p className="mt-2 text-xs font-medium" style={{ color: "var(--ok)" }}>
            ✓ {rowCount} data rows found
          </p>
        )}
      </div>

      {pending && !counting && (
        <button type="button"
          onClick={() => onFile(pending, rowCount)}
          className="flex w-full items-center justify-center gap-2 rounded-full py-2.5 text-sm font-semibold text-white"
          style={{ background: "var(--color-accent)" }}>
          <ChevronRight size={15} />
          Continue
        </button>
      )}
    </div>
  );
}

// ── Google Sheets URL step ────────────────────────────────────────────────────
function SheetUrlStep({
  onUrl,
  onBack,
}: {
  onUrl:  (url: string, rowCount: number) => void;
  onBack: () => void;
}) {
  const [url,      setUrl]      = useState("");
  const [loading,  setLoading]  = useState(false);
  const [rowCount, setRowCount] = useState(0);
  const [error,    setError]    = useState<string | null>(null);
  const [verified, setVerified] = useState(false);

  async function verifySheet() {
    setError(null);
    setLoading(true);
    setVerified(false);
    try {
      const m = url.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
      if (!m) throw new Error("Not a valid Google Sheets URL.");
      const gid = url.match(/[#&?]gid=(\d+)/)?.[1] ?? "0";
      const res = await fetch(
        `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv&gid=${gid}`,
        { redirect: "follow" },
      );
      if (!res.ok) throw new Error("Cannot access sheet. Make sure it's shared as 'Anyone with the link'.");
      const csv   = await res.text();
      const rows  = Math.max(0, csv.split("\n").filter(Boolean).length - 1);
      setRowCount(rows);
      setVerified(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack}
        className="flex items-center gap-1.5 text-xs font-medium" style={{ color: "var(--ink-3)" }}>
        <RotateCcw size={11} /> Back
      </button>

      <p className="text-sm font-semibold">Paste a Google Sheets link</p>
      <p className="text-xs" style={{ color: "var(--ink-3)" }}>
        The sheet must be shared as <strong>Anyone with the link → Viewer</strong>.
      </p>

      <div className="flex gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => { setUrl(e.target.value); setVerified(false); setError(null); }}
          placeholder="https://docs.google.com/spreadsheets/d/..."
          className="flex-1 rounded-xl border px-3 py-2.5 text-sm outline-none"
          style={{ borderColor: error ? "var(--bad)" : verified ? "var(--ok)" : "var(--hairline)" }}
        />
        <button type="button" onClick={() => void verifySheet()} disabled={!url.trim() || loading}
          className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--color-accent)" }}>
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Verify
        </button>
      </div>

      {error && (
        <p className="flex items-center gap-1.5 text-xs" style={{ color: "var(--bad)" }}>
          <AlertTriangle size={11} /> {error}
        </p>
      )}

      {verified && (
        <p className="flex items-center gap-1.5 text-xs font-medium" style={{ color: "var(--ok)" }}>
          <CheckCircle2 size={11} /> Sheet accessible · {rowCount} data rows
        </p>
      )}

      {verified && (
        <button type="button" onClick={() => onUrl(url, rowCount)}
          className="flex w-full items-center justify-center gap-2 rounded-full py-2.5 text-sm font-semibold text-white"
          style={{ background: "var(--color-accent)" }}>
          <ChevronRight size={15} />
          Continue
        </button>
      )}
    </div>
  );
}

// ── Main wizard ───────────────────────────────────────────────────────────────
export function DirectSourceConnect({
  orgId,
  onComplete,
}: {
  orgId:      string;
  onComplete: () => void;
}) {
  const { session } = useAuth();
  const qc          = useQueryClient();

  const [step,       setStep]      = useState<Step>("choose");
  const [mode,       setMode]      = useState<SourceMode>("excel");
  const [permReq,    setPermReq]   = useState<PermissionRequest | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingUrl,  setPendingUrl]  = useState<string | null>(null);
  const [errorMsg,   setErrorMsg]  = useState<string | null>(null);
  const [jobId,      setJobId]     = useState<string | null>(null);

  // ── Step handlers ──────────────────────────────────────────────────────────

  function handleExcelFile(file: File, rowCount: number) {
    setPendingFile(file);
    setPermReq({
      mode:     "excel",
      filename: file.name,
      rowCount,
      actions: [
        `Extract up to ${rowCount} transaction rows using deterministic CSV parsing (no AI for structured files)`,
        "Classify each row as BUY / SELL / DIV using the column headers",
        "Write extracted rows to your derived ledger with confidence scores",
        "Flag any rows with missing fields for your review — never silently guess",
      ],
      reversible: true,
    });
    setStep("permission");
  }

  function handleSheetUrl(url: string, rowCount: number) {
    setPendingUrl(url);
    const m = url.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    setPermReq({
      mode:     "sheets",
      filename: m ? `Google Sheet (${m[1].slice(0, 8)}…)` : "Google Sheet",
      rowCount,
      actions: [
        "Connect the sheet as a continuously-monitored source",
        "Check for content changes every 60 seconds using a hash diff",
        "Extract new or changed rows automatically when detected",
        "Write to your derived ledger only — source sheet is never modified",
      ],
      reversible: true,
    });
    setStep("permission");
  }

  async function handleApprove() {
    if (!permReq || !session?.access_token) return;
    setStep("pushing");
    setErrorMsg(null);

    try {
      if (permReq.mode === "excel" && pendingFile) {
        // Upload file → autonomous extraction
        const form = new FormData();
        form.append("file", pendingFile);

        const res = await fetch("/api/documents/upload", {
          method:  "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
          body:    form,
        });

        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw new Error(body || `Upload failed (${res.status})`);
        }

        const data = await res.json() as { uploaded?: Array<{ job_id: string | null }> };
        setJobId(data.uploaded?.[0]?.job_id ?? null);
        await qc.invalidateQueries({ queryKey: ["agent_jobs", orgId] });
        toast.success(`${pendingFile.name} uploaded — extraction running`);

      } else if (permReq.mode === "sheets" && pendingUrl) {
        // Save as a connected source
        const m = pendingUrl.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
        if (!m) throw new Error("Invalid Google Sheets URL");
        const sheetId = m[1];

        const { error } = await supabase.from("connected_sources").upsert({
          org_id:       orgId,
          source_type:  "google_sheets",
          external_id:  sheetId,
          display_name: `Google Sheet (${sheetId.slice(0, 12)}…)`,
          paused:       false,
          rules:        { auto_import: true } as never,
          updated_at:   new Date().toISOString(),
        } as never, { onConflict: "org_id,source_type,external_id" });

        if (error) throw new Error(error.message);
        await qc.invalidateQueries({ queryKey: ["connected_sources", orgId] });
        toast.success("Google Sheet connected — monitoring started");
      }

      setStep("done");

    } catch (e) {
      setErrorMsg((e as Error).message ?? "Something went wrong");
      setStep("error");
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <AnimatePresence mode="wait">
        {step === "choose" && (
          <motion.div key="choose"
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            className="grid gap-3 sm:grid-cols-2">

            {/* Excel card */}
            <button type="button"
              onClick={() => { setMode("excel"); setStep("excel-pick"); }}
              className="flex flex-col items-start gap-3 rounded-2xl p-5 text-left transition-shadow hover:shadow-md"
              style={{ border: "1px solid var(--hairline)", background: "#fff" }}>
              <span className="flex size-10 items-center justify-center rounded-xl"
                style={{ background: "rgba(31,157,99,0.1)" }}>
                <FileSpreadsheet size={18} strokeWidth={1.75} style={{ color: "var(--ok)" }} />
              </span>
              <div>
                <p className="text-sm font-semibold">Upload Excel / CSV</p>
                <p className="mt-0.5 text-xs" style={{ color: "var(--ink-3)" }}>
                  One-time import. AuditX extracts transactions and writes to your ledger.
                </p>
              </div>
              <span className="flex items-center gap-1 text-xs font-medium" style={{ color: "var(--ok)" }}>
                Browse file <ChevronRight size={11} />
              </span>
            </button>

            {/* Google Sheets card */}
            <button type="button"
              onClick={() => { setMode("sheets"); setStep("sheet-url"); }}
              className="flex flex-col items-start gap-3 rounded-2xl p-5 text-left transition-shadow hover:shadow-md"
              style={{ border: "1px solid var(--hairline)", background: "#fff" }}>
              <span className="flex size-10 items-center justify-center rounded-xl"
                style={{ background: "rgba(115,66,226,0.1)" }}>
                <Sheet size={18} strokeWidth={1.75} style={{ color: "var(--color-accent)" }} />
              </span>
              <div>
                <p className="text-sm font-semibold">Connect Google Sheet</p>
                <p className="mt-0.5 text-xs" style={{ color: "var(--ink-3)" }}>
                  Continuous monitoring. AuditX detects changes and syncs automatically.
                </p>
              </div>
              <span className="flex items-center gap-1 text-xs font-medium" style={{ color: "var(--color-accent)" }}>
                Paste link <ChevronRight size={11} />
              </span>
            </button>
          </motion.div>
        )}

        {step === "excel-pick" && (
          <motion.div key="excel-pick"
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
            <ExcelPickStep onFile={handleExcelFile} onBack={() => setStep("choose")} />
          </motion.div>
        )}

        {step === "sheet-url" && (
          <motion.div key="sheet-url"
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
            <SheetUrlStep onUrl={handleSheetUrl} onBack={() => setStep("choose")} />
          </motion.div>
        )}

        {step === "permission" && permReq && (
          <motion.div key="permission"
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
            <PermissionPrompt
              req={permReq}
              onApprove={() => void handleApprove()}
              onCancel={() => setStep(mode === "excel" ? "excel-pick" : "sheet-url")}
            />
          </motion.div>
        )}

        {step === "pushing" && (
          <motion.div key="pushing"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center py-12 text-center">
            <Loader2 size={32} className="animate-spin" style={{ color: "var(--color-accent)" }} />
            <p className="mt-4 text-sm font-medium">
              {mode === "excel" ? "Uploading and extracting…" : "Connecting sheet…"}
            </p>
            <p className="mt-1 text-xs" style={{ color: "var(--ink-3)" }}>
              This usually takes a few seconds. Your source file is not modified.
            </p>
          </motion.div>
        )}

        {step === "done" && (
          <motion.div key="done"
            initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center py-10 text-center">
            <span className="flex size-14 items-center justify-center rounded-2xl"
              style={{ background: "rgba(31,157,99,0.1)" }}>
              <CheckCircle2 size={28} strokeWidth={1.75} style={{ color: "var(--ok)" }} />
            </span>
            <p className="mt-4 text-sm font-semibold">
              {mode === "excel" ? "File imported successfully" : "Sheet connected"}
            </p>
            <p className="mt-1 text-xs max-w-xs" style={{ color: "var(--ink-3)" }}>
              {mode === "excel"
                ? "AuditX is extracting your transactions. Check the Activity Feed for progress."
                : "AuditX will monitor this sheet every 60 seconds and sync changes automatically."}
            </p>
            {jobId && (
              <a href="/app/activity"
                className="mt-4 flex items-center gap-1.5 text-xs font-semibold"
                style={{ color: "var(--color-accent)" }}>
                View in Activity Feed <ChevronRight size={11} />
              </a>
            )}
            <button type="button" onClick={onComplete}
              className="mt-5 rounded-full border px-5 py-2 text-sm font-medium hover:bg-black/5"
              style={{ borderColor: "var(--hairline)" }}>
              Done
            </button>
          </motion.div>
        )}

        {step === "error" && (
          <motion.div key="error"
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            className="flex flex-col items-center justify-center py-10 text-center">
            <span className="flex size-14 items-center justify-center rounded-2xl"
              style={{ background: "rgba(214,69,69,0.1)" }}>
              <X size={28} strokeWidth={1.75} style={{ color: "var(--bad)" }} />
            </span>
            <p className="mt-4 text-sm font-semibold" style={{ color: "var(--bad)" }}>Something went wrong</p>
            <p className="mt-1 text-xs max-w-xs" style={{ color: "var(--ink-3)" }}>
              {errorMsg ?? "Unknown error. Your data was not changed."}
            </p>
            <button type="button" onClick={() => { setStep("choose"); setErrorMsg(null); }}
              className="mt-5 flex items-center gap-1.5 rounded-full border px-5 py-2 text-sm font-medium hover:bg-black/5"
              style={{ borderColor: "var(--hairline)" }}>
              <RotateCcw size={13} /> Try again
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
