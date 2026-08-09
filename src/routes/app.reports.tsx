import { createFileRoute } from "@tanstack/react-router";
import { Clock, Download, FileText, Plus } from "lucide-react";
import { Btn, Panel, StatusPill } from "@/components/kit";

export const Route = createFileRoute("/app/reports")({
  component: Reports,
});

const typeTone = (type: string): "ok" | "info" | "warn" | "bad" => {
  if (type === "Tax Report") return "ok";
  if (type === "Reconciliation") return "warn";
  if (type === "Audit Log") return "info";
  return "info";
};

function Reports() {
  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "1.5rem" }}>Reports</h1>
          <p className="mt-0.5 text-sm" style={{ color: "var(--ink-2)" }}>
            Download, schedule and share your exported reports.
          </p>
        </div>
        <Btn>
          <Plus size={16} strokeWidth={2} />
          Generate report
        </Btn>
      </div>

      {/* Scheduled */}
      <Panel>
        <p className="text-sm font-semibold">Scheduled Reports</p>
        <div className="mt-4 space-y-3">
          {[
            { label: "Monthly ledger digest", schedule: "1st of every month", next: "Coming soon" },
            { label: "Quarterly tax summary", schedule: "Every quarter-end", next: "Coming soon" },
          ].map((s) => (
            <div
              key={s.label}
              className="flex items-center justify-between rounded-xl px-4 py-3"
              style={{ background: "var(--color-login-bg)" }}
            >
              <div className="flex items-center gap-3">
                <Clock size={16} strokeWidth={1.75} style={{ color: "var(--color-accent)" }} />
                <div>
                  <p className="text-sm font-medium">{s.label}</p>
                  <p className="text-xs" style={{ color: "var(--ink-3)" }}>{s.schedule}</p>
                </div>
              </div>
              <div className="text-right">
                <StatusPill tone="info">{s.next}</StatusPill>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      {/* Saved reports — empty state until reports are generated */}
      <div
        className="overflow-hidden rounded-2xl bg-white"
        style={{ border: "1px solid var(--hairline)" }}
      >
        <div className="border-b px-5 py-4" style={{ borderColor: "var(--hairline)" }}>
          <p className="text-sm font-semibold">Saved Reports</p>
        </div>
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <FileText size={32} strokeWidth={1.5} style={{ color: "var(--ink-3)" }} />
          <p className="text-sm font-medium">No reports generated yet</p>
          <p className="text-xs" style={{ color: "var(--ink-3)" }}>
            Click "Generate report" to create your first tax summary or ledger export.
          </p>
        </div>
      </div>
    </div>
  );
}
