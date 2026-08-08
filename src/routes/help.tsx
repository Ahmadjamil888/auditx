import { createFileRoute } from "@tanstack/react-router";
import {
  BookOpen,
  CreditCard,
  FileSearch,
  LifeBuoy,
  ScanSearch,
  Search,
  TrendingUp,
} from "lucide-react";
import { useState } from "react";
import { Btn, Panel, Reveal } from "@/components/kit";
import { PageShell } from "@/components/site/PageShell";

export const Route = createFileRoute("/help")({
  head: () => ({
    meta: [
      { title: "AuditX Help Center — Guides, Parsing & Tax Support" },
      {
        name: "description",
        content:
          "Search AuditX guides on uploading statements, reconciliation, capital-gains computation, billing and troubleshooting.",
      },
      { property: "og:title", content: "AuditX Help Center" },
      {
        property: "og:description",
        content: "Guides and answers for parsing, reconciliation, tax profiles and billing.",
      },
    ],
  }),
  component: Help,
});

const cats = [
  { icon: BookOpen, title: "Getting Started", desc: "Set up your org, jurisdiction and first broker account." },
  { icon: FileSearch, title: "Uploading Statements", desc: "Supported formats, bulk uploads and sample documents." },
  { icon: ScanSearch, title: "Reconciliation", desc: "Flag types, tolerances and resolution workflows." },
  { icon: TrendingUp, title: "Tax & CGT", desc: "FIFO lots, holding periods, WHT and jurisdiction rules." },
  { icon: CreditCard, title: "Billing", desc: "Plans, usage metering, invoices and upgrades." },
  { icon: LifeBuoy, title: "Troubleshooting", desc: "Low-confidence extractions and failed parses." },
];

const popular = [
  "Why did my extraction land in the review queue?",
  "How AuditX matches FIFO lots across broker accounts",
  "Setting filer vs non-filer status for PSX withholding",
  "Exporting a tax summary your accountant will accept",
  "Fixing a duplicate fill flagged during reconciliation",
];

function Help() {
  const [q, setQ] = useState("");
  const filtered = popular.filter((p) => p.toLowerCase().includes(q.toLowerCase()));

  return (
    <PageShell
      eyebrow="Help center"
      title="Find an answer, fast"
      sub="Guides written against the actual pipeline — extraction, reconciliation and the tax engine."
    >
      <div className="mx-auto max-w-2xl">
        <div
          className="flex items-center gap-3 rounded-xl bg-white px-4 py-3"
          style={{ border: "1px solid var(--hairline)", boxShadow: "var(--shadow-card)" }}
        >
          <Search size={20} strokeWidth={1.75} style={{ color: "var(--ink-3)" }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search help articles…"
            className="w-full bg-transparent text-sm outline-none"
          />
        </div>
      </div>

      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {cats.map((c, i) => (
          <Reveal key={c.title} i={i % 3}>
            <Panel className="h-full">
              <c.icon size={22} strokeWidth={1.75} style={{ color: "var(--color-accent)" }} />
              <h3 className="mt-4 text-base font-semibold">{c.title}</h3>
              <p className="mt-2 text-sm" style={{ color: "var(--ink-2)" }}>
                {c.desc}
              </p>
            </Panel>
          </Reveal>
        ))}
      </div>

      <h2 className="mt-16 text-xl font-semibold">Popular articles</h2>
      <Panel className="mt-5 p-0">
        {filtered.length === 0 ? (
          <div className="p-10 text-center">
            <Search size={24} strokeWidth={1.75} style={{ color: "var(--ink-3)" }} className="mx-auto" />
            <p className="mt-3 text-sm" style={{ color: "var(--ink-2)" }}>
              No articles match “{q}”. Try a broader term or contact support.
            </p>
          </div>
        ) : (
          <ul>
            {filtered.map((p) => (
              <li
                key={p}
                className="px-6 py-4 text-sm transition-colors hover:bg-[rgba(115,66,226,0.06)]"
                style={{ borderBottom: "1px solid var(--hairline)" }}
              >
                {p}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel className="mt-10 flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h3 className="text-lg font-semibold">Still stuck?</h3>
          <p className="mt-1.5 text-sm" style={{ color: "var(--ink-2)" }}>
            Send us the document reference and we'll trace it through the pipeline with you.
          </p>
        </div>
        <Btn>Contact support</Btn>
      </Panel>
    </PageShell>
  );
}
