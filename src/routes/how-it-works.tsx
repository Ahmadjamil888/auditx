import { createFileRoute } from "@tanstack/react-router";
import { FileCheck2, ScanSearch, Sparkles, Upload } from "lucide-react";
import { Btn, Panel, Reveal, StatusPill } from "@/components/kit";
import { PageShell } from "@/components/site/PageShell";

export const Route = createFileRoute("/how-it-works")({
  head: () => ({
    meta: [
      { title: "How AuditX Works — Upload, Extract, Reconcile, File" },
      {
        name: "description",
        content:
          "A walkthrough of the AuditX pipeline: multimodal extraction with confidence scoring, rule-based reconciliation and deterministic FIFO tax computation.",
      },
      { property: "og:title", content: "How AuditX Works" },
      {
        property: "og:description",
        content: "From a photographed broker slip to a filed capital-gains summary.",
      },
    ],
  }),
  component: HowItWorks,
});

const steps = [
  {
    icon: Upload,
    title: "1 · Upload",
    body: "Drag in PDFs, phone photos of broker slips, CSV or Excel exports, or forwarded email receipts. Files land in a private per-organisation bucket and are never shared across tenants.",
    detail: ["PDF · PNG · JPG · CSV · XLSX", "Bulk upload up to 50 files", "Sample documents available"],
  },
  {
    icon: Sparkles,
    title: "2 · Extract",
    body: "A multimodal model reads each document against a strict JSON schema and returns a confidence score per field. Anything below 0.75 is routed to the review queue instead of auto-posting.",
    detail: ["Per-field confidence badges", "Schema-validated server-side", "One automatic retry on failure"],
  },
  {
    icon: ScanSearch,
    title: "3 · Reconcile",
    body: "A deterministic rule engine — no model involved — diffs extracted trades against your cash-balance ledger by reference ID, date and amount tolerance.",
    detail: ["Unmatched trades", "Duplicate fills", "Fee surcharges vs tariff", "WHT vs filer status"],
  },
  {
    icon: FileCheck2,
    title: "4 · File",
    body: "FIFO lot matching computes holding periods and applies your jurisdiction's CGT bands. Export a PDF summary with the underlying lot-by-lot working and a verifiable audit trail.",
    detail: ["FIFO cost basis", "Short vs long-term tiers", "Dividend WHT reconciliation", "PDF + CSV export"],
  },
];

function HowItWorks() {
  return (
    <PageShell
      eyebrow="How it works"
      title="From a crumpled slip to a filed return"
      sub="Four stages, each one auditable on its own. Extraction is probabilistic and always shown as such; everything downstream is deterministic."
    >
      <div className="space-y-6">
        {steps.map((s, i) => (
          <Reveal key={s.title} i={i % 3}>
            <Panel className="grid gap-8 md:grid-cols-2">
              <div>
                <s.icon size={24} strokeWidth={1.75} style={{ color: "var(--color-accent)" }} />
                <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
                  {s.body}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {s.detail.map((d) => (
                    <StatusPill key={d} tone="info">
                      {d}
                    </StatusPill>
                  ))}
                </div>
              </div>
              <div className="rounded-xl p-5" style={{ background: "var(--color-login-bg)" }}>
                {i === 3 ? (
                  <div className="tnum space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span style={{ color: "var(--ink-2)" }}>Buy lot 12 Mar · 300 @ 118.40</span>
                      <span>35,520.00</span>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: "var(--ink-2)" }}>Sell 04 Nov · 300 @ 146.10</span>
                      <span>43,830.00</span>
                    </div>
                    <div
                      className="flex justify-between border-t pt-2 font-semibold"
                      style={{ borderColor: "var(--hairline)" }}
                    >
                      <span>Gain · 237 days · long-term</span>
                      <span style={{ color: "var(--ok)" }}>+8,310.00</span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 text-xs">
                    {["Ticker", "Action", "Quantity", "Price", "Ref ID"].map((f, k) => (
                      <div key={f} className="flex items-center justify-between">
                        <span style={{ color: "var(--ink-2)" }}>{f}</span>
                        <StatusPill tone={k === 4 ? "warn" : "ok"}>
                          {k === 4 ? "0.72" : "0.9" + (4 + k)}
                        </StatusPill>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Panel>
          </Reveal>
        ))}
      </div>

      <Panel className="mt-14 flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h3 className="text-lg font-semibold">See it on your own statements</h3>
          <p className="mt-1.5 text-sm" style={{ color: "var(--ink-2)" }}>
            Parse 50 transactions free — no card and no broker credentials required.
          </p>
        </div>
        <Btn>Start Free Audit</Btn>
      </Panel>
    </PageShell>
  );
}
