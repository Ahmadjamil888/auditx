import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Panel, Reveal, StatusPill } from "@/components/kit";
import { PageShell } from "@/components/site/PageShell";

export const Route = createFileRoute("/news")({
  head: () => ({
    meta: [
      { title: "AuditX News, Compliance Updates & Release Notes" },
      {
        name: "description",
        content:
          "Product announcements, regional compliance updates and the AuditX release-note timeline for traders on PSX and NSE.",
      },
      { property: "og:title", content: "AuditX News & Changelog" },
      {
        property: "og:description",
        content: "Product, compliance and company updates from the AuditX team.",
      },
    ],
  }),
  component: News,
});

const cats = ["All", "Product", "Compliance Updates", "Company"] as const;

const posts = [
  {
    cat: "Product",
    title: "Confidence-gated posting is now the default",
    date: "12 Jul 2026",
    excerpt:
      "Extractions below 0.75 confidence no longer post automatically — they queue for review with the source document side-by-side.",
  },
  {
    cat: "Compliance Updates",
    title: "PSX filer / non-filer WHT rates refreshed",
    date: "28 Jun 2026",
    excerpt:
      "Updated withholding rates are live in the Pakistan tax profile, with retroactive recomputation available per tax year.",
  },
  {
    cat: "Product",
    title: "NSE contract notes: multi-page parsing",
    date: "09 Jun 2026",
    excerpt:
      "Long contract notes now parse across page breaks, keeping charge summaries attached to the right fills.",
  },
  {
    cat: "Company",
    title: "AuditX opens an early-access program for micro-brokerages",
    date: "21 May 2026",
    excerpt:
      "Multi-client rollups, member directories and reconciliation health leaderboards are in the hands of first design partners.",
  },
  {
    cat: "Compliance Updates",
    title: "India LTCG holding-period tiers configurable per profile",
    date: "02 May 2026",
    excerpt: "Holding-period thresholds moved out of code and into editable tax-profile rules.",
  },
  {
    cat: "Product",
    title: "Verify chain: recompute the audit hash chain in your browser",
    date: "14 Apr 2026",
    excerpt: "The audit trail can now be independently verified client-side, row by row.",
  },
];

const releases = [
  ["v1.7.0", "12 Jul 2026", ["Confidence gating default-on", "Review queue bulk accept", "Faster PDF rasterisation"]],
  ["v1.6.2", "28 Jun 2026", ["PSX WHT rate refresh", "Retroactive tax recompute", "Fix: duplicate ref_id false positives"]],
  ["v1.6.0", "09 Jun 2026", ["Multi-page contract notes", "Dividend voucher template", "Ledger CSV column mapping"]],
] as const;

function News() {
  const [cat, setCat] = useState<(typeof cats)[number]>("All");
  const shown = cat === "All" ? posts : posts.filter((p) => p.cat === cat);

  return (
    <PageShell
      eyebrow="News"
      title="Releases, compliance changes and company notes"
      sub="Tax rules move. So does the product. Everything that changes your numbers is documented here."
    >
      <div className="flex flex-wrap gap-2">
        {cats.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCat(c)}
            className="rounded-full px-4 py-2 text-sm font-medium transition-colors"
            style={
              cat === c
                ? { background: "rgba(115,66,226,0.1)", color: "var(--color-accent)" }
                : { background: "var(--color-login-bg)", color: "var(--ink-2)" }
            }
          >
            {c}
          </button>
        ))}
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-3">
        {shown.map((p, i) => (
          <Reveal key={p.title} i={i % 3}>
            <Panel className="h-full">
              <StatusPill tone={p.cat === "Compliance Updates" ? "warn" : "info"}>{p.cat}</StatusPill>
              <h3 className="mt-4 text-base font-semibold">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
                {p.excerpt}
              </p>
              <p className="tnum mt-4 text-xs" style={{ color: "var(--ink-3)" }}>
                {p.date}
              </p>
            </Panel>
          </Reveal>
        ))}
      </div>

      <h2 className="mt-16 text-xl font-semibold">Latest release notes</h2>
      <div className="mt-6 space-y-4">
        {releases.map(([v, d, items]) => (
          <Panel key={v}>
            <div className="flex flex-wrap items-center gap-3">
              <span className="tnum text-sm font-semibold" style={{ color: "var(--color-accent)" }}>
                {v}
              </span>
              <span className="tnum text-xs" style={{ color: "var(--ink-3)" }}>
                {d}
              </span>
            </div>
            <ul className="mt-3 space-y-1.5 text-sm" style={{ color: "var(--ink-2)" }}>
              {items.map((it) => (
                <li key={it}>— {it}</li>
              ))}
            </ul>
          </Panel>
        ))}
      </div>
    </PageShell>
  );
}
