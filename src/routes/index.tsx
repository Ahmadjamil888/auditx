import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  FileSearch,
  GitMerge,
  Lock,
  ScanSearch,
  Shield,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { LandingComposer } from "@/components/site/LandingComposer";
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
      { title: "AuditX — AI Financial Audit & Trade Reconciliation for PSX and NSE" },
      {
        name: "description",
        content:
          "Upload your PSX or NSE broker slips. AuditX's agentic AI analyzes, reconciles, and computes your capital gains tax with full evidence trails. Free for 50 transactions/month.",
      },
      { name: "keywords", content: "PSX CGT calculator, NSE STCG LTCG, trade reconciliation, broker slip parser, capital gains tax Pakistan India, FIFO tax engine, AuditX" },
      { property: "og:title", content: "AuditX — AI Financial Audit & Trade Reconciliation" },
      { property: "og:description", content: "Stop spending weekends on spreadsheets. AuditX reconciles PSX and NSE trades in minutes with agentic AI, deterministic FIFO tax math, and evidence-backed findings." },
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
    desc: "Drop any PDF, photo, CSV or broker export. Every field is extracted with a per-field confidence score — nothing invented.",
  },
  {
    icon: ScanSearch,
    title: "Anomaly & Discrepancy Detector",
    desc: "Rule-based engine catches duplicate fills, fee surcharges and WHT mismatches before they reach your filing.",
  },
  {
    icon: TrendingUp,
    title: "FIFO Tax Engine",
    desc: "Holding-period tiers, CGT bands and WHT computed by deterministic code. The AI reads; the engine calculates.",
  },
  {
    icon: GitMerge,
    title: "Trade Reconciliation",
    desc: "Compare transactions against broker records, match on reference, date and quantity, and list every delta.",
  },
  {
    icon: Shield,
    title: "Immutable Audit Log",
    desc: "Every mutation appends a SHA-256 hash-chained row. The chain can be independently verified client-side.",
  },
  {
    icon: BarChart3,
    title: "Portfolio Intelligence",
    desc: "Cost-basis holding views, concentration risk, and an AI-generated health narrative from your real data.",
  },
];

// ── Trust steps ───────────────────────────────────────────────────────────────

const steps = [
  { n: "01", title: "Upload", desc: "Slips, contract notes, vouchers, exports — any format." },
  { n: "02", title: "Extract", desc: "AI reads every field with per-field confidence scoring." },
  { n: "03", title: "Reconcile", desc: "Engine diffs ledger versus broker with precise deltas." },
  { n: "04", title: "File", desc: "Exportable CGT summary and immutable audit trail." },
];

// ── Pricing ───────────────────────────────────────────────────────────────────

const tiers = [
  {
    name: "Free",
    price: "$0",
    note: "50 parsed transactions / month",
    items: ["1 tax profile", "CSV export", "Community support"],
  },
  {
    name: "Pro",
    price: "$9.99",
    note: "For active retail traders",
    popular: true,
    items: ["Unlimited transactions", "PDF tax summary export", "Anomaly detection", "Tax-loss harvesting"],
  },
  {
    name: "Enterprise",
    price: "$49",
    note: "Brokerages & portfolio managers",
    items: ["Multi-client accounts", "Team roles", "API access", "Priority reconciliation"],
  },
];

// ── FAQ ───────────────────────────────────────────────────────────────────────

const faqs = [
  ["How is my financial data secured?", "Documents live in a private, per-organisation bucket served only through short-lived signed URLs. Every row is isolated by Postgres row-level security keyed to your organisation membership."],
  ["Which brokers are supported?", "AuditX is format-driven: any PSX or NSE contract note, dividend voucher, CSV or Excel export can be parsed — including photographed slips."],
  ["Is the tax math AI-generated?", "No. FIFO lot matching, holding-period tiers and CGT bands are computed by deterministic code. The AI only reads documents and explains pre-computed results."],
  ["Which jurisdictions are covered?", "Pakistan (PSX CGT slabs with Filer/Non-Filer WHT) and India (NSE STCG/LTCG). More jurisdictions in progress."],
  ["What can I export?", "CSV on every plan. PDF tax summaries and full audit-trail reports on Pro and Enterprise."],
  ["How do I know a ledger row wasn't altered?", "Every mutation appends a SHA-256 hash-chained audit-log entry. The chain can be recomputed and verified from the Audit Trail screen."],
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
          <motion.div
            variants={reveal}
            custom={0}
            initial="hidden"
            animate="visible"
            className="mb-6 inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold"
            style={{
              background: "rgba(115,66,226,0.08)",
              border: "1px solid rgba(115,66,226,0.18)",
              color: "var(--color-accent)",
            }}
          >
            <Sparkles size={12} strokeWidth={2} />
            Agentic AI · Evidence-backed · Deterministic Math
          </motion.div>

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
            What can I analyze
            <br />
            for you today?
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
            A full AI audit team — extraction, reconciliation, compliance and tax —
            working from your real data, asking before writing.
          </motion.p>

          {/* Composer — the primary focal point */}
          <motion.div
            variants={reveal}
            custom={3}
            initial="hidden"
            animate="visible"
          >
            <LandingComposer />
          </motion.div>
        </div>
      </section>

      {/* ─── TRUST STRIP ─────────────────────────────────────────────────────── */}
      <section style={{ background: "#fff", borderTop: "1px solid var(--hairline)", borderBottom: "1px solid var(--hairline)" }}>
        <Container className="py-8">
          <p className="text-center text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--ink-3)" }}>
            Trusted by traders across
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-sm font-semibold" style={{ color: "var(--ink-3)" }}>
            {["PSX · Pakistan", "NSE · India", "Meridian Capital", "SouthPort Securities", "Karachi Quant"].map((n) => (
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
              Upload → Extract → Reconcile → File
            </h2>
          </div>
          <div className="relative grid gap-10 md:grid-cols-4">
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

      {/* ─── ARCHITECTURE ────────────────────────────────────────────────────── */}
      <section style={{ background: "var(--color-login-bg)" }}>
        <Container className="grid items-center gap-16 py-24 md:grid-cols-2">
          <Reveal>
            <p className="mb-4 text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--color-accent)" }}>
              Architecture
            </p>
            <h2
              className="mb-4"
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: "clamp(1.4rem,2.5vw,2rem)",
                letterSpacing: "-0.01em",
              }}
            >
              Immutable by construction,
              <br />deterministic by design
            </h2>
            <p className="mb-6 text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
              Every mutation appends a SHA-256 hash-chained row to the audit log. Tax math runs as
              unit-tested TypeScript — the model never produces a number.
            </p>
            <ul className="space-y-3">
              {[
                "Hash-chained audit log, verifiable client-side",
                "FIFO cost basis with holding-period tiers",
                "Confidence gating: &lt;0.75 routes to review",
                "Per-organisation row-level security",
              ].map((t) => (
                <li key={t} className="flex items-start gap-2.5 text-sm" style={{ color: "var(--ink-2)" }}>
                  <BadgeCheck size={16} strokeWidth={1.75} style={{ color: "var(--color-accent)", flexShrink: 0, marginTop: 1 }} />
                  <span dangerouslySetInnerHTML={{ __html: t }} />
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal i={1}>
            <div
              className="rounded-2xl bg-white p-6"
              style={{ border: "1px solid var(--hairline)" }}
            >
              <div className="space-y-3">
                {["0x9f2a…c41d", "0x71be…08aa", "0x33c0…9e17"].map((h, i) => (
                  <div
                    key={h}
                    className="flex items-center justify-between rounded-xl px-4 py-3"
                    style={{
                      background: i === 0 ? "rgba(115,66,226,0.07)" : "var(--color-login-bg)",
                      border: i === 0 ? "1px solid rgba(115,66,226,0.18)" : "1px solid var(--hairline)",
                    }}
                  >
                    <span className="flex items-center gap-2 text-xs font-medium">
                      <Lock size={13} strokeWidth={1.75} style={{ color: "var(--ink-3)" }} />
                      block #{1042 - i}
                    </span>
                    <span className="tnum text-xs" style={{ color: "var(--ink-3)" }}>{h}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <StatusPill tone="ok">Chain verified</StatusPill>
              </div>
            </div>
          </Reveal>
        </Container>
      </section>

      {/* ─── TESTIMONIALS ────────────────────────────────────────────────────── */}
      <section style={{ background: "#fff" }}>
        <Container className="py-24">
          <div className="mb-14 text-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--color-accent)" }}>
              Testimonials
            </p>
            <h2
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: "clamp(1.5rem,3vw,2.25rem)",
                letterSpacing: "-0.01em",
              }}
            >
              Reconciliation, minus the weekend
            </h2>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {[
              ["Three days of month-end reconciliation collapsed into about twenty minutes.", "Sara Klein", "Portfolio Manager"],
              ["The WHT mismatch flag alone caught a filer-status error worth six figures.", "Imran Qureshi", "Founder, SouthPort Securities"],
              ["My accountant accepted the exported CGT summary without a single follow-up.", "Neha Raghavan", "Retail trader, NSE"],
            ].map(([quote, name, role], i) => (
              <Reveal key={name} i={i}>
                <div
                  className="h-full rounded-2xl bg-white p-6"
                  style={{ border: "1px solid var(--hairline)" }}
                >
                  <p className="mb-6 text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
                    &ldquo;{quote}&rdquo;
                  </p>
                  <div className="flex items-center gap-3">
                    <div
                      className="flex size-9 items-center justify-center rounded-full text-xs font-semibold"
                      style={{ background: "rgba(115,66,226,0.1)", color: "var(--color-accent)" }}
                    >
                      {String(name).charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{name}</p>
                      <p className="text-xs" style={{ color: "var(--ink-3)" }}>{role}</p>
                    </div>
                  </div>
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
                  <Link to={t.name === "Enterprise" ? "/contact" : ctaTo}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-center gap-2 rounded-full py-2.5 text-sm font-semibold transition-all hover:shadow-md"
                      style={
                        t.popular
                          ? { background: "var(--color-accent)", color: "#fff" }
                          : { border: "1px solid var(--hairline)", color: "var(--ink-2)" }
                      }
                    >
                      {t.name === "Enterprise" ? "Contact sales" : session ? "Go to Dashboard" : "Start Free Audit"}
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
            Close your book with evidence,
            <br />not guesswork
          </h2>
          <p className="mx-auto mb-8 max-w-lg text-sm" style={{ color: "rgba(255,255,255,0.8)" }}>
            Parse your first 50 transactions free. No card, no broker credentials required.
          </p>
          <Link to={ctaTo}>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-semibold transition-opacity hover:opacity-90"
              style={{ color: "var(--color-accent)" }}
            >
              {session ? "Go to Dashboard" : "Start Free Audit"}
              <ArrowRight size={16} strokeWidth={2} />
            </button>
          </Link>
        </Container>
      </section>

      <Footer />
    </div>
  );
}
