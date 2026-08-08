import { createFileRoute } from "@tanstack/react-router";
import { Fingerprint, KeyRound, Lock, ScrollText, ServerCog, ShieldCheck } from "lucide-react";
import { Btn, Panel, Reveal, StatusPill } from "@/components/kit";
import { PageShell } from "@/components/site/PageShell";

export const Route = createFileRoute("/security")({
  head: () => ({
    meta: [
      { title: "Security & Audit Architecture — AuditX" },
      {
        name: "description",
        content:
          "How AuditX protects trade data: hash-chained immutable audit logs, per-organisation row-level security, encrypted storage and deterministic tax math.",
      },
      { property: "og:title", content: "Security & Audit Architecture — AuditX" },
      {
        property: "og:description",
        content: "Immutable hash-chained audit logging, RLS isolation and encrypted document storage.",
      },
    ],
  }),
  component: Security,
});

const pillars = [
  {
    icon: Lock,
    title: "Encryption in transit and at rest",
    desc: "TLS 1.3 everywhere; documents encrypted at rest and served only through short-lived signed URLs.",
  },
  {
    icon: Fingerprint,
    title: "Per-organisation isolation",
    desc: "Postgres row-level security keys every table to your organisation membership — no shared-tenant queries.",
  },
  {
    icon: ServerCog,
    title: "Secrets never reach the browser",
    desc: "Model keys and billing secrets live only in server-side functions. The client never sees a provider credential.",
  },
  {
    icon: ScrollText,
    title: "Immutable audit log",
    desc: "Every mutation appends sha256(previous_hash + payload). Break one row and the whole chain fails verification.",
  },
  {
    icon: KeyRound,
    title: "Role-scoped writes",
    desc: "Owner, Admin, Analyst and Viewer roles gate every mutation path, including tax-profile edits.",
  },
  {
    icon: ShieldCheck,
    title: "Deterministic math",
    desc: "FIFO, CGT bands and WHT are computed in unit-tested code. The model never produces a financial figure.",
  },
];

function Security() {
  return (
    <PageShell
      eyebrow="Security"
      title="Zero-manual-error architecture"
      sub="AuditX is built so that a number can always be traced back to a document, and a document can always be traced back to an unbroken chain."
    >
      <div className="grid gap-6 md:grid-cols-3">
        {pillars.map((p, i) => (
          <Reveal key={p.title} i={i % 3}>
            <Panel className="h-full">
              <p.icon size={22} strokeWidth={1.75} style={{ color: "var(--color-accent)" }} />
              <h3 className="mt-4 text-base font-semibold">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
                {p.desc}
              </p>
            </Panel>
          </Reveal>
        ))}
      </div>

      <Panel className="mt-14">
        <h3 className="text-lg font-semibold">Hash-chain diagram</h3>
        <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center">
          {["genesis", "0x9f2a…c41d", "0x71be…08aa", "0x33c0…9e17"].map((h, i) => (
            <div key={h} className="flex items-center gap-3">
              <div
                className="rounded-xl px-4 py-3 text-xs font-medium"
                style={{
                  background: i === 3 ? "rgba(115,66,226,0.1)" : "var(--color-login-bg)",
                  color: i === 3 ? "var(--color-accent)" : "var(--ink-2)",
                }}
              >
                <span className="tnum">{h}</span>
              </div>
              {i < 3 && <span style={{ color: "var(--ink-3)" }}>→</span>}
            </div>
          ))}
        </div>
        <div className="mt-6">
          <StatusPill tone="ok">Verifiable client-side from /app/audit-trail</StatusPill>
        </div>
      </Panel>

      <div className="mt-14 grid gap-6 md:grid-cols-2">
        <Panel>
          <h3 className="text-base font-semibold">Compliance posture</h3>
          <div className="mt-4 flex flex-wrap gap-2">
            {["SOC 2 Type II (in progress)", "GDPR-aligned", "PCI handled by Stripe"].map((b) => (
              <StatusPill key={b} tone="info">
                {b}
              </StatusPill>
            ))}
          </div>
          <p className="mt-4 text-sm" style={{ color: "var(--ink-2)" }}>
            Data retention follows your plan: 90 days on Free, 2 years on Pro, 7 years on
            Enterprise. Deletion requests purge documents, extractions and derived ledger rows while
            preserving a tamper-evident deletion record.
          </p>
        </Panel>
        <Panel>
          <h3 className="text-base font-semibold">Responsible disclosure</h3>
          <p className="mt-2 text-sm" style={{ color: "var(--ink-2)" }}>
            Found something? We triage security reports within one business day and reward valid
            findings that affect ledger integrity or tenant isolation.
          </p>
          <Btn className="mt-5">Report a vulnerability</Btn>
        </Panel>
      </div>
    </PageShell>
  );
}
