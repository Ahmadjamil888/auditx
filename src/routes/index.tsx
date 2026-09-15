import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  FileSearch,
  GitMerge,
  ScanSearch,
  Shield,
  TrendingUp,
  Upload,
} from "lucide-react";
import { Footer } from "@/components/site/Footer";
import { LandingNavbar } from "@/components/site/LandingNavbar";
import { StatusPill, Container, Reveal, Panel } from "@/components/kit";
import { useAuth } from "@/lib/auth-context";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AuditX — Turn Broker Records into a Reconciled, Tax-Ready Ledger" },
      {
        name: "description",
        content:
          "Upload contract notes, broker statements, CSVs, PDFs, or trade records. AuditX extracts the data, reconciles it against your records, detects discrepancies, and produces a traceable tax-ready ledger.",
      },
      { name: "keywords", content: "PSX CGT calculator, NSE STCG LTCG, trade reconciliation, broker slip parser, capital gains tax Pakistan India, FIFO tax engine, AuditX" },
      { property: "og:title", content: "AuditX — Turn Broker Records into a Reconciled, Tax-Ready Ledger" },
      { property: "og:description", content: "Upload contract notes, broker statements, CSVs, PDFs, or trade records. AuditX extracts the data, reconciles it against your records, detects discrepancies, and produces a traceable tax-ready ledger." },
      { property: "og:url", content: "https://auditx.app/" },
    ],
  }),
  component: Home,
});

// ── Reveal animation ──────────────────────────────────────────────────────────

const reveal = {
  hidden:  { opacity: 0, y: 20 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, delay: i * 0.1, ease: [0.22, 1, 0.36, 1] },
  }),
};

// ── Feature grid ──────────────────────────────────────────────────────────────

const features = [
  {
    icon: FileSearch,
    title: "Multimodal Document Parser",
    desc: "Extract transactions from PDFs, images, CSVs, XLSX files, and broker exports.",
  },
  {
    icon: ScanSearch,
    title: "Anomaly & Discrepancy Detector",
    desc: "Detect duplicate fills, fee mismatches, WHT inconsistencies, missing records, and other discrepancies.",
  },
  {
    icon: TrendingUp,
    title: "FIFO Tax Engine",
    desc: "Calculate cost basis and tax-related values using deterministic code rather than LLM-generated arithmetic.",
  },
  {
    icon: GitMerge,
    title: "Trade Reconciliation",
    desc: "Match transactions against source records and show exact differences.",
  },
  {
    icon: Shield,
    title: "Immutable Audit Log",
    desc: "Preserve a verifiable history of important ledger changes.",
  },
  {
    icon: BarChart3,
    title: "Portfolio Intelligence",
    desc: "Analyze portfolio structure and surface useful financial insights from verified data.",
  },
];

// ── Trust steps ───────────────────────────────────────────────────────────────

const steps = [
  { n: "01", title: "Upload", desc: "Drop broker statements, contract notes, CSVs, PDFs, or images." },
  { n: "02", title: "Extract", desc: "AuditX extracts transaction fields and assigns confidence scores." },
  { n: "03", title: "Reconcile", desc: "Compare extracted records against your ledger and identify exact discrepancies." },
  { n: "04", title: "Verify", desc: "Low-confidence fields and material discrepancies are routed for review." },
  { n: "05", title: "Report", desc: "Generate a traceable, tax-ready report with supporting evidence." },
];

// ── Pricing ───────────────────────────────────────────────────────────────────

const tiers = [
  {
    name: "Free",
    price: "$0",
    note: "For trying AuditX",
    items: ["50 parsed transactions/month", "1 tax profile", "CSV export", "Community support"],
  },
  {
    name: "Pro",
    price: "$9.99",
    note: "For active traders",
    popular: true,
    items: ["Unlimited transactions", "PDF tax reports", "Anomaly detection", "Tax-loss harvesting"],
  },
  {
    name: "Professional",
    price: "$49",
    note: "For professional teams and brokerages",
    items: ["Multi-client accounts", "Team roles", "API access", "Priority reconciliation"],
  },
];

// ── FAQ ───────────────────────────────────────────────────────────────────────

const faqs = [
  ["How is my financial data secured?", "Documents live in a private, per-organisation bucket served only through short-lived signed URLs. Every row is isolated by Postgres row-level security keyed to your organisation membership."],
  ["Which brokers are supported?", "AuditX is format-driven: any PSX or NSE contract note, dividend voucher, CSV or Excel export can be parsed — including photographed slips."],
  ["Is the tax math AI-generated?", "No. FIFO lot matching, holding-period tiers and CGT bands are computed by deterministic code. The AI only reads documents and explains pre-computed results."],
  ["Which jurisdictions are covered?", "Pakistan (PSX CGT slabs with Filer/Non-Filer WHT) and India (NSE STCG/LTCG). More jurisdictions in progress."],
  ["What can I export?", "CSV on every plan. PDF tax summaries and full audit-trail reports on Pro and Professional."],
  ["How do I know a ledger row wasn't altered?", "Every mutation appends a SHA-256 hash-chained audit-log entry. The chain can be recomputed and verified from the Audit Trail screen."],
  ["What happens when extraction confidence is low?", "Fields with confidence scores below 0.75 are automatically routed for manual review. AuditX never silently guesses — it asks you to verify."],
];

// ── Page ──────────────────────────────────────────────────────────────────────

function Home() {
  const { session, loading } = useAuth();
  const ctaTo = !loading && session ? "/app/parser" : "/signup";

  return (
    <div
      style={{
        fontFamily: "var(--font-body)",
        color: "var(--color-text)",
        background: "var(--color-login-bg)",
      }}
    >
      {/* ─── NAVIGATION ─────────────────────────────────────────────────────── */}
      <LandingNavbar />

      {/* ─── HERO ────────────────────────────────────────────────────────────── */}
      <section
        className="relative flex min-h-[100svh] flex-col items-center justify-center overflow-hidden px-4"
        style={{ paddingTop: "80px", paddingBottom: "80px" }}
      >
        {/* Subtle radial glow */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 50% 10%, rgba(115,66,226,0.08) 0%, transparent 70%)",
          }}
        />

        <div className="relative z-10 mx-auto w-full max-w-[800px] text-center">
          {/* Eyebrow */}
          <motion.p
            variants={reveal}
            custom={0}
            initial="hidden"
            animate="visible"
            className="mb-4 text-xs font-semibold uppercase tracking-widest"
            style={{ color: "var(--color-accent)" }}
          >
            AUDIT-GRADE FINANCIAL RECONCILIATION
          </motion.p>

          {/* Headline */}
          <motion.h1
            variants={reveal}
            custom={1}
            initial="hidden"
            animate="visible"
            className="mb-6"
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "clamp(2rem, 5.5vw, 3.5rem)",
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
            }}
          >
            Turn broker records into a
            <br />
            reconciled, tax-ready ledger.
          </motion.h1>

          {/* Sub-headline */}
          <motion.p
            variants={reveal}
            custom={2}
            initial="hidden"
            animate="visible"
            className="mx-auto mb-10 max-w-[560px] text-base leading-relaxed sm:text-lg"
            style={{ color: "var(--ink-2)" }}
          >
            Upload contract notes, broker statements, CSVs, PDFs, or trade records. AuditX extracts the data, reconciles it against your records, detects discrepancies, and produces a traceable tax-ready ledger.
          </motion.p>

          {/* CTAs */}
          <motion.div
            variants={reveal}
            custom={3}
            initial="hidden"
            animate="visible"
            className="mb-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center"
          >
            <Link to={ctaTo}>
              <button
                type="button"
                className="flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white transition-all hover:shadow-md"
                style={{ background: "var(--color-accent)", boxShadow: "0 4px 24px rgba(115,66,226,0.3)" }}
              >
                Start your first audit
                <ArrowRight size={16} strokeWidth={2} />
              </button>
            </Link>
            <Link to="/how-it-works">
              <button
                type="button"
                className="flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition-all hover:shadow-md"
                style={{ border: "1px solid var(--hairline)", color: "var(--ink-2)" }}
              >
                See how it works
              </button>
            </Link>
          </motion.div>

          {/* Supported formats */}
          <motion.div
            variants={reveal}
            custom={4}
            initial="hidden"
            animate="visible"
            className="mb-6 flex items-center justify-center gap-3 text-xs font-medium"
            style={{ color: "var(--ink-3)" }}
          >
            <span>PDF</span>
            <span style={{ color: "var(--hairline)" }}>·</span>
            <span>CSV</span>
            <span style={{ color: "var(--hairline)" }}>·</span>
            <span>XLSX</span>
            <span style={{ color: "var(--hairline)" }}>·</span>
            <span>PNG</span>
          </motion.div>

          {/* Trust statement */}
          <motion.p
            variants={reveal}
            custom={5}
            initial="hidden"
            animate="visible"
            className="text-xs leading-relaxed"
            style={{ color: "var(--ink-3)" }}
          >
            Your calculations are deterministic. AI extracts and explains — it does not invent your tax numbers.
          </motion.p>

          {/* Quick action chips */}
          <motion.div
            variants={reveal}
            custom={6}
            initial="hidden"
            animate="visible"
            className="mt-8 flex flex-wrap justify-center gap-2"
          >
            {[
              { label: "Upload broker statement", link: ctaTo },
              { label: "Calculate tax impact", link: ctaTo },
              { label: "Review discrepancies", link: ctaTo },
            ].map((chip) => (
              <Link key={chip.label} to={chip.link}>
                <button
                  type="button"
                  className="group flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-xs font-medium transition-all hover:border-[rgba(115,66,226,0.3)] hover:shadow-sm sm:text-sm"
                  style={{
                    border: "1px solid var(--hairline)",
                    color: "var(--ink-2)",
                  }}
                >
                  <Upload size={12} strokeWidth={2} style={{ color: "var(--color-accent)" }} />
                  {chip.label}
                </button>
              </Link>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ─── TRUST STRIP ─────────────────────────────────────────────────────── */}
      <section style={{ background: "#fff", borderTop: "1px solid var(--hairline)", borderBottom: "1px solid var(--hairline)" }}>
        <Container className="py-8">
          <p className="text-center text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--ink-3)" }}>
            Designed for traders across
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-sm font-semibold" style={{ color: "var(--ink-3)" }}>
            {["PSX · Pakistan", "NSE · India", "Regional exchanges"].map((n) => (
              <span key={n}>{n}</span>
            ))}
          </div>
        </Container>
      </section>

      {/* ─── FEATURES ────────────────────────────────────────────────────────── */}
      <section style={{ background: "var(--color-login-bg)" }}>
        <Container className="py-24">
          <div className="mb-14 text-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--color-accent)" }}>
              Capabilities
            </p>
            <h2
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: "clamp(1.5rem,3vw,2.25rem)",
                letterSpacing: "-0.01em",
              }}
            >
              Everything a financial audit team does,
              <br className="hidden sm:block" /> automated end-to-end
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f, i) => (
              <Reveal key={f.title} i={i}>
                <div
                  className="h-full rounded-2xl bg-white p-6 transition-shadow hover:shadow-md"
                  style={{ border: "1px solid var(--hairline)" }}
                >
                  <div
                    className="mb-4 flex size-10 items-center justify-center rounded-xl"
                    style={{ background: "rgba(115,66,226,0.08)" }}
                  >
                    <f.icon size={18} strokeWidth={1.75} style={{ color: "var(--color-accent)" }} />
                  </div>
                  <h3 className="mb-2 text-sm font-semibold">{f.title}</h3>
                  <p className="text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
                    {f.desc}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      {/* ─── PRODUCT DEMO ───────────────────────────────────────────────────── */}
      <section style={{ background: "#fff" }}>
        <Container className="py-24">
          <div className="mb-14 text-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--color-accent)" }}>
              Example workflow
            </p>
            <h2
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: "clamp(1.5rem,3vw,2.25rem)",
                letterSpacing: "-0.01em",
              }}
            >
              See AuditX in action
            </h2>
            <p className="mt-3 text-sm" style={{ color: "var(--ink-2)" }}>
              Demo visualization — not actual production data
            </p>
          </div>
          <Reveal>
            <div
              className="mx-auto max-w-3xl rounded-2xl bg-white p-8"
              style={{ border: "1px solid var(--hairline)" }}
            >
              <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="flex size-10 items-center justify-center rounded-lg"
                    style={{ background: "rgba(115,66,226,0.1)" }}
                  >
                    <FileSearch size={18} style={{ color: "var(--color-accent)" }} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Uploaded</p>
                    <p className="text-xs" style={{ color: "var(--ink-3)" }}>broker_statement.pdf</p>
                  </div>
                </div>
                <StatusPill tone="ok">Processed</StatusPill>
              </div>

              <div className="mb-6 grid grid-cols-2 gap-4">
                <div className="rounded-xl p-4" style={{ background: "var(--color-login-bg)", border: "1px solid var(--hairline)" }}>
                  <p className="text-xs font-semibold" style={{ color: "var(--ink-3)" }}>Extracted</p>
                  <p className="tnum mt-1 text-2xl font-bold">1,248</p>
                  <p className="text-xs" style={{ color: "var(--ink-2)" }}>transactions</p>
                </div>
                <div className="rounded-xl p-4" style={{ background: "var(--color-login-bg)", border: "1px solid var(--hairline)" }}>
                  <p className="text-xs font-semibold" style={{ color: "var(--ink-3)" }}>Matched</p>
                  <p className="tnum mt-1 text-2xl font-bold">1,231</p>
                  <p className="text-xs" style={{ color: "var(--ink-2)" }}>against ledger</p>
                </div>
              </div>

              <div className="mb-6 grid grid-cols-3 gap-4">
                <div className="rounded-xl p-4" style={{ background: "rgba(251,146,60,0.08)", border: "1px solid rgba(251,146,60,0.2)" }}>
                  <p className="text-xs font-semibold" style={{ color: "#FB923C" }}>Needs review</p>
                  <p className="tnum mt-1 text-2xl font-bold">11</p>
                  <p className="text-xs" style={{ color: "var(--ink-2)" }}>low confidence</p>
                </div>
                <div className="rounded-xl p-4" style={{ background: "rgba(214,69,69,0.08)", border: "1px solid rgba(214,69,69,0.2)" }}>
                  <p className="text-xs font-semibold" style={{ color: "#D64545" }}>Discrepancies</p>
                  <p className="tnum mt-1 text-2xl font-bold">6</p>
                  <p className="text-xs" style={{ color: "var(--ink-2)" }}>flagged</p>
                </div>
                <div className="rounded-xl p-4" style={{ background: "rgba(115,66,226,0.08)", border: "1px solid rgba(115,66,226,0.2)" }}>
                  <p className="text-xs font-semibold" style={{ color: "var(--color-accent)" }}>Tax calculation</p>
                  <p className="tnum mt-1 text-2xl font-bold">FIFO</p>
                  <p className="text-xs" style={{ color: "var(--ink-2)" }}>deterministic</p>
                </div>
              </div>

              <div className="rounded-xl p-4" style={{ background: "var(--color-login-bg)", border: "1px solid var(--hairline)" }}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold" style={{ color: "var(--ink-3)" }}>Result</p>
                    <p className="mt-1 text-sm">Tax-ready ledger generated with full audit trail</p>
                  </div>
                  <button
                    type="button"
                    className="flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold text-white"
                    style={{ background: "var(--color-accent)" }}
                  >
                    View Report
                  </button>
                </div>
              </div>
            </div>
          </Reveal>
        </Container>
      </section>

      {/* ─── HOW IT WORKS ────────────────────────────────────────────────────── */}
      <section style={{ background: "#fff" }}>
        <Container className="py-24">
          <div className="mb-14 text-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--color-accent)" }}>
              How it works
            </p>
            <h2
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: "clamp(1.5rem,3vw,2.25rem)",
                letterSpacing: "-0.01em",
              }}
            >
              Upload → Extract → Reconcile → Verify → Report
            </h2>
          </div>
          <div className="relative grid gap-10 md:grid-cols-5">
            <div
              className="absolute top-5 right-10 left-10 hidden h-px md:block"
              style={{ background: "var(--hairline)" }}
            />
            {steps.map((s, i) => (
              <Reveal key={s.title} i={i} className="relative">
                <div
                  className="mb-4 flex size-11 items-center justify-center rounded-full text-sm font-bold"
                  style={{
                    background: "rgba(115,66,226,0.08)",
                    color: "var(--color-accent)",
                    border: "1px solid rgba(115,66,226,0.2)",
                  }}
                >
                  {s.n}
                </div>
                <h3 className="mb-1.5 text-sm font-semibold">{s.title}</h3>
                <p className="text-sm" style={{ color: "var(--ink-2)" }}>{s.desc}</p>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      {/* ─── WHY TRUST AUDITX? ─────────────────────────────────────────────────── */}
      <section style={{ background: "var(--color-login-bg)" }}>
        <Container className="grid items-center gap-16 py-24 md:grid-cols-2">
          <Reveal>
            <p className="mb-4 text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--color-accent)" }}>
              Why trust AuditX?
            </p>
            <h2
              className="mb-4"
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: "clamp(1.4rem,2.5vw,2rem)",
                letterSpacing: "-0.01em",
              }}
            >
              Every important financial result
              <br />can be traced back to its source data.
            </h2>
            <p className="mb-6 text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
              AI performs extraction and classification. Deterministic code performs financial/tax calculations. Low-confidence extraction is flagged for review. Reconciliation exposes exact differences. Audit logs preserve the history of important changes. Organization-level security controls isolate customer data.
            </p>
            <ul className="space-y-3">
              {[
                "AI extracts and classifies — it does not invent your tax numbers",
                "Deterministic code performs financial/tax calculations",
                "Low-confidence extraction is flagged for review",
                "Reconciliation exposes exact differences",
                "Audit logs preserve the history of important changes",
                "Organization-level security controls isolate customer data",
              ].map((t) => (
                <li key={t} className="flex items-start gap-2.5 text-sm" style={{ color: "var(--ink-2)" }}>
                  <BadgeCheck size={16} strokeWidth={1.75} style={{ color: "var(--color-accent)", flexShrink: 0, marginTop: 1 }} />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal i={1}>
            <div
              className="rounded-2xl bg-white p-6"
              style={{ border: "1px solid var(--hairline)" }}
            >
              <p className="mb-4 text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--ink-3)" }}>
                Provenance Trail
              </p>
              <div className="space-y-2">
                {[
                  { label: "SOURCE DOCUMENT", arrow: true },
                  { label: "EXTRACTED FIELD", arrow: true },
                  { label: "TRANSACTION", arrow: true },
                  { label: "RECONCILIATION", arrow: true },
                  { label: "CALCULATION", arrow: true },
                  { label: "FINAL REPORT", arrow: false },
                ].map((item, i) => (
                  <div key={item.label}>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium" style={{ color: "var(--color-accent)" }}>
                        {item.label}
                      </span>
                      {item.arrow && (
                        <span style={{ color: "var(--ink-3)" }}>→</span>
                      )}
                    </div>
                    {i < 5 && (
                      <div className="ml-0 h-4 w-px" style={{ background: "var(--hairline)" }} />
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--hairline)" }}>
                <p className="text-xs leading-relaxed" style={{ color: "var(--ink-2)" }}>
                  Every number has a verifiable chain back to the original document.
                </p>
              </div>
            </div>
          </Reveal>
        </Container>
      </section>

      {/* ─── BUILT FOR MESSY REALITY ───────────────────────────────────────────── */}
      <section style={{ background: "#fff" }}>
        <Container className="py-24">
          <div className="mb-14 text-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--color-accent)" }}>
              Built for the messy reality of broker records
            </p>
            <h2
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: "clamp(1.5rem,3vw,2.25rem)",
                letterSpacing: "-0.01em",
              }}
            >
              AuditX handles the problems spreadsheets can't
            </h2>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {[
              { title: "Duplicate fills", desc: "Detect and flag duplicate transactions that inflate your ledger." },
              { title: "Missing trades", desc: "Identify gaps between broker records and your ledger." },
              { title: "Fee mismatches", desc: "Catch brokerage fee discrepancies that affect cost basis." },
              { title: "WHT discrepancies", desc: "Flag withholding tax inconsistencies before filing." },
              { title: "Inconsistent quantities", desc: "Spot quantity differences that break reconciliation." },
              { title: "Incomplete records", desc: "Route low-confidence extractions for manual review." },
            ].map((item, i) => (
              <Reveal key={item.title} i={i}>
                <div
                  className="h-full rounded-2xl bg-white p-6"
                  style={{ border: "1px solid var(--hairline)" }}
                >
                  <div
                    className="mb-4 flex size-10 items-center justify-center rounded-xl"
                    style={{ background: "rgba(115,66,226,0.08)" }}
                  >
                    <ScanSearch size={18} strokeWidth={1.75} style={{ color: "var(--color-accent)" }} />
                  </div>
                  <h3 className="mb-2 text-sm font-semibold">{item.title}</h3>
                  <p className="text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
                    {item.desc}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      {/* ─── PRICING ─────────────────────────────────────────────────────────── */}
      <section style={{ background: "var(--color-login-bg)" }} id="pricing">
        <Container className="py-24">
          <div className="mb-14 text-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--color-accent)" }}>
              Pricing
            </p>
            <h2
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: "clamp(1.5rem,3vw,2.25rem)",
                letterSpacing: "-0.01em",
              }}
            >
              Start free, upgrade when your book grows
            </h2>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {tiers.map((t, i) => (
              <Reveal key={t.name} i={i}>
                <div
                  className="relative h-full rounded-2xl bg-white p-6 transition-shadow hover:shadow-lg"
                  style={{
                    border: t.popular ? "2px solid var(--color-accent)" : "1px solid var(--hairline)",
                    boxShadow: t.popular ? "0 4px 24px rgba(115,66,226,0.12)" : undefined,
                  }}
                >
                  {t.popular && (
                    <div
                      className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-0.5 text-xs font-semibold text-white"
                      style={{ background: "var(--color-accent)" }}
                    >
                      Most popular
                    </div>
                  )}
                  <div className="mb-1 text-sm font-semibold">{t.name}</div>
                  <div className="tnum mb-1 text-3xl font-bold">
                    {t.price}
                    {t.name !== "Free" && (
                      <span className="text-sm font-normal" style={{ color: "var(--ink-3)" }}>/mo</span>
                    )}
                  </div>
                  <div className="mb-5 text-xs" style={{ color: "var(--ink-3)" }}>{t.note}</div>
                  <ul className="mb-6 space-y-2.5 text-sm" style={{ color: "var(--ink-2)" }}>
                    {t.items.map((it) => (
                      <li key={it} className="flex items-start gap-2">
                        <BadgeCheck size={15} strokeWidth={1.75} style={{ color: "var(--color-accent)", flexShrink: 0, marginTop: 1 }} />
                        {it}
                      </li>
                    ))}
                  </ul>
                  <Link to={t.name === "Professional" ? "/contact" : ctaTo}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-center gap-2 rounded-full py-2.5 text-sm font-semibold transition-all hover:shadow-md"
                      style={
                        t.popular
                          ? { background: "var(--color-accent)", color: "#fff" }
                          : { border: "1px solid var(--hairline)", color: "var(--ink-2)" }
                      }
                    >
                      {t.name === "Professional" ? "Contact sales" : session ? "Go to Dashboard" : "Start Free Audit"}
                      <ArrowRight size={14} strokeWidth={2} />
                    </button>
                  </Link>
                </div>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      {/* ─── FAQ ─────────────────────────────────────────────────────────────── */}
      <section style={{ background: "#fff" }}>
        <Container className="py-24">
          <div className="mb-10 text-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--color-accent)" }}>
              FAQ
            </p>
            <h2
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: "clamp(1.5rem,3vw,2.25rem)",
                letterSpacing: "-0.01em",
              }}
            >
              Questions worth asking
            </h2>
          </div>
          <div className="mx-auto max-w-3xl">
            <Accordion type="single" collapsible>
              {faqs.map(([q, a], i) => (
                <AccordionItem key={q} value={`i${i}`} style={{ borderColor: "var(--hairline)" }}>
                  <AccordionTrigger className="text-left text-sm font-semibold">{q}</AccordionTrigger>
                  <AccordionContent className="text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
                    {a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </Container>
      </section>

      {/* ─── FINAL CTA ───────────────────────────────────────────────────────── */}
      <section style={{ background: "var(--color-accent)" }}>
        <Container className="py-20 text-center">
          <h2
            className="mb-4 text-white"
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "clamp(1.5rem,4vw,2.5rem)",
              lineHeight: 1.1,
            }}
          >
            Turn messy broker records into
            <br />a clean, tax-ready ledger
          </h2>
          <p className="mx-auto mb-8 max-w-lg text-sm" style={{ color: "rgba(255,255,255,0.8)" }}>
            Upload your first broker statement. Extract, reconcile, verify, and report with full traceability.
          </p>
          <Link to={ctaTo}>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-semibold transition-opacity hover:opacity-90"
              style={{ color: "var(--color-accent)" }}
            >
              {session ? "Go to Dashboard" : "Start your first audit"}
              <ArrowRight size={16} strokeWidth={2} />
            </button>
          </Link>
          <p className="mt-4 text-xs" style={{ color: "rgba(255,255,255,0.6)" }}>
            AuditX does not provide tax or legal advice.
          </p>
        </Container>
      </section>

      <Footer />
    </div>
  );
}
