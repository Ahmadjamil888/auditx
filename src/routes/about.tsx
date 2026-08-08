import { createFileRoute } from "@tanstack/react-router";
import { Panel, Reveal, StatusPill } from "@/components/kit";
import { PageShell } from "@/components/site/PageShell";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About AuditX — Audit Infrastructure for Emerging Markets" },
      {
        name: "description",
        content:
          "AuditX builds audit-grade reconciliation and tax tooling for traders and micro-brokerages on emerging-market exchanges.",
      },
      { property: "og:title", content: "About AuditX" },
      {
        property: "og:description",
        content: "Why we build deterministic, explainable audit tooling for regional exchanges.",
      },
    ],
  }),
  component: About,
});

const team = [
  ["Ayesha Farooq", "Co-founder, CEO"],
  ["Daniyal Shah", "Co-founder, Engineering"],
  ["Ritu Mehra", "Head of Tax Engineering"],
  ["Omar Bhatti", "Design"],
  ["Lina Sørensen", "Compliance"],
  ["Faraz Ali", "Applied AI"],
];

const values = [
  ["Traceable over clever", "If a number can't be traced to a document, it doesn't ship."],
  ["Deterministic where it counts", "Models read; code computes."],
  ["Regional first", "Built for PSX and NSE realities, not retrofitted from US brokerages."],
];

function About() {
  return (
    <PageShell
      eyebrow="About"
      title="Audit infrastructure for the exchanges nobody built tools for"
      sub="Reconciliation in emerging markets still runs on printed slips, WhatsApp screenshots and spreadsheets. AuditX exists to make that book provable."
    >
      <div className="grid gap-6 md:grid-cols-3">
        {values.map(([t, d], i) => (
          <Reveal key={t} i={i}>
            <Panel className="h-full">
              <h3 className="text-base font-semibold">{t}</h3>
              <p className="mt-2 text-sm" style={{ color: "var(--ink-2)" }}>
                {d}
              </p>
            </Panel>
          </Reveal>
        ))}
      </div>

      <h2 className="mt-16 text-xl font-semibold">Team</h2>
      <div className="mt-6 grid gap-6 sm:grid-cols-2 md:grid-cols-3">
        {team.map(([name, role]) => (
          <Panel key={name} className="flex items-center gap-4">
            <div
              className="flex size-11 items-center justify-center rounded-full text-sm font-semibold"
              style={{ background: "rgba(115,66,226,0.1)", color: "var(--color-accent)" }}
            >
              {String(name).charAt(0)}
            </div>
            <div>
              <p className="text-sm font-semibold">{name}</p>
              <p className="text-xs" style={{ color: "var(--ink-3)" }}>
                {role}
              </p>
            </div>
          </Panel>
        ))}
      </div>

      <h2 className="mt-16 text-xl font-semibold">Press</h2>
      <div className="mt-6 flex flex-wrap gap-2">
        {["Profit Magazine", "TechInAsia", "Dawn Business", "Mint"].map((p) => (
          <StatusPill key={p} tone="info">
            {p}
          </StatusPill>
        ))}
      </div>
    </PageShell>
  );
}
