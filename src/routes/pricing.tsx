import { createFileRoute } from "@tanstack/react-router";
import { BadgeCheck, Minus } from "lucide-react";
import { useState } from "react";
import { Btn, Panel, Reveal, StatusPill } from "@/components/kit";
import { PageShell } from "@/components/site/PageShell";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "AuditX Pricing — Free, Pro and Enterprise Plans" },
      {
        name: "description",
        content:
          "Compare AuditX plans: free parsing for 50 transactions a month, Pro at $9.99 and Enterprise multi-client audit tooling at $49.",
      },
      { property: "og:title", content: "AuditX Pricing" },
      {
        property: "og:description",
        content: "Free, Pro and Enterprise plans for trade reconciliation and CGT reporting.",
      },
    ],
  }),
  component: Pricing,
});

const rows: [string, string | boolean, string | boolean, string | boolean][] = [
  ["Parsed transactions / month", "50", "Unlimited", "Unlimited"],
  ["Tax profiles", "1", "3", "Unlimited"],
  ["CSV export", true, true, true],
  ["PDF tax summary", false, true, true],
  ["Anomaly detection", false, true, true],
  ["Tax-loss harvesting", false, true, true],
  ["Multi-account management", false, false, true],
  ["Team roles & permissions", false, false, true],
  ["API access", false, false, true],
  ["Priority reconciliation", false, false, true],
  ["Audit-trail retention", "90 days", "2 years", "7 years"],
];

function Cell({ v }: { v: string | boolean }) {
  if (v === true)
    return <BadgeCheck size={18} strokeWidth={1.75} style={{ color: "var(--color-accent)" }} />;
  if (v === false) return <Minus size={18} strokeWidth={1.75} style={{ color: "var(--ink-3)" }} />;
  return <span className="tnum text-sm">{v}</span>;
}

function Pricing() {
  const [annual, setAnnual] = useState(false);
  const pro = annual ? "$7.99" : "$9.99";
  const ent = annual ? "$39" : "$49";

  return (
    <PageShell
      eyebrow="Pricing"
      title="Plans that scale with your ledger"
      sub="Every plan includes deterministic tax math, hash-chained audit logging and per-organisation data isolation."
    >
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => setAnnual(false)}
          className={`rounded-full px-4 py-2 text-sm font-medium ${annual ? "" : "bg-white"}`}
          style={annual ? { color: "var(--ink-2)" } : { border: "1px solid var(--hairline)" }}
        >
          Monthly
        </button>
        <button
          type="button"
          onClick={() => setAnnual(true)}
          className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ${annual ? "bg-white" : ""}`}
          style={annual ? { border: "1px solid var(--hairline)" } : { color: "var(--ink-2)" }}
        >
          Annual <StatusPill tone="ok">Save 20%</StatusPill>
        </button>
      </div>

      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {[
          { name: "Free", price: "$0", note: "For getting your first book clean" },
          { name: "Pro", price: pro, note: "For active traders", popular: true },
          { name: "Enterprise", price: ent, note: "For brokerages & managers" },
        ].map((t, i) => (
          <Reveal key={t.name} i={i}>
            <Panel
              className="h-full"
              style={
                t.popular ? { border: "2px solid var(--color-accent)", boxShadow: "var(--shadow-hover)" } : {}
              }
            >
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold">{t.name}</h3>
                {t.popular && <StatusPill tone="info">Most popular</StatusPill>}
              </div>
              <p className="tnum mt-4 text-3xl font-semibold">
                {t.price}
                {t.name !== "Free" && (
                  <span className="text-sm font-normal" style={{ color: "var(--ink-3)" }}>
                    /mo
                  </span>
                )}
              </p>
              <p className="mt-1 text-xs" style={{ color: "var(--ink-3)" }}>
                {t.note}
              </p>
              <Btn className="mt-6 w-full" variant={t.popular ? "primary" : "secondary"}>
                {t.name === "Enterprise" ? "Contact sales" : "Start Free Audit"}
              </Btn>
            </Panel>
          </Reveal>
        ))}
      </div>

      <div className="mt-16 overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--hairline)" }}>
              {["Feature", "Free", "Pro", "Enterprise"].map((h) => (
                <th key={h} className="py-3 text-sm font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r[0]} style={{ borderBottom: "1px solid var(--hairline)" }}>
                <td
                  className="sticky left-0 bg-white py-3 pr-4 text-sm"
                  style={{ color: "var(--ink-2)" }}
                >
                  {r[0]}
                </td>
                <td className="py-3">
                  <Cell v={r[1]} />
                </td>
                <td className="py-3">
                  <Cell v={r[2]} />
                </td>
                <td className="py-3">
                  <Cell v={r[3]} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Panel className="mt-14 flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h3 className="text-lg font-semibold">Need custom retention or on-prem exports?</h3>
          <p className="mt-1.5 text-sm" style={{ color: "var(--ink-2)" }}>
            Enterprise plans can be tailored per jurisdiction, client volume and audit policy.
          </p>
        </div>
        <Btn>Contact sales</Btn>
      </Panel>
    </PageShell>
  );
}
