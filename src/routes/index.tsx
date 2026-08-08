import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  ArrowRightCircle,
  BadgeCheck,
  Boxes,
  FileCheck2,
  FileSearch,
  Lock,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Upload,
  Wallet,
} from "lucide-react";
import heroBg from "@/assets/hero-bg.jpg";
import { Btn, Container, Panel, Reveal, SectionHead, StatusPill, reveal } from "@/components/kit";
import { Footer } from "@/components/site/Footer";
import { Navbar } from "@/components/site/Navbar";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AuditX — Audit-Grade Trade Reconciliation & Tax Clarity" },
      {
        name: "description",
        content:
          "AuditX turns messy PSX and NSE trade slips into a reconciled, audit-ready ledger with deterministic FIFO capital-gains math.",
      },
      { property: "og:title", content: "AuditX — Audit-Grade Trade Reconciliation" },
      {
        property: "og:description",
        content:
          "AI extraction, deterministic tax math, immutable hash-chained audit logs for regional exchange traders.",
      },
    ],
  }),
  component: Home,
});

const Icon = ({ as: C }: { as: typeof ShieldCheck }) => (
  <C
    size={24}
    strokeWidth={1.75}
    className="relative inline-block"
    style={{ top: -2, color: "#192837" }}
  />
);

const features = [
  {
    icon: FileSearch,
    title: "Multimodal Statement Parser",
    desc: "Drop a PDF, photo, CSV or broker export — every field is extracted with a confidence score.",
    mock: (
      <div className="space-y-2">
        {[
          ["OGDC · BUY 500", "0.96", "ok"],
          ["HBL · SELL 120", "0.88", "warn"],
          ["Dividend voucher", "0.71", "bad"],
        ].map(([a, b, t]) => (
          <div key={a} className="flex items-center justify-between text-xs">
            <span style={{ color: "var(--ink-2)" }}>{a}</span>
            <StatusPill tone={t as "ok"}>{b}</StatusPill>
          </div>
        ))}
      </div>
    ),
  },
  {
    icon: ScanSearch,
    title: "Anomaly & Discrepancy Detector",
    desc: "Deterministic rules catch duplicate fills, fee surcharges and WHT mismatches before filing.",
    mock: (
      <div className="tnum space-y-2 text-xs">
        <div className="flex justify-between">
          <span style={{ color: "var(--ink-2)" }}>Expected fee</span>
          <span style={{ color: "var(--ok)" }}>1,240.00</span>
        </div>
        <div className="flex justify-between">
          <span style={{ color: "var(--ink-2)" }}>Broker charged</span>
          <span style={{ color: "var(--bad)" }}>1,612.50</span>
        </div>
        <StatusPill tone="warn">Fee surcharge flagged</StatusPill>
      </div>
    ),
  },
  {
    icon: TrendingUp,
    title: "Real-Time Tax Optimizer",
    desc: "FIFO lot matching, holding-period tiers and CGT bands computed in code — never guessed.",
    mock: (
      <div className="tnum space-y-2 text-xs">
        <div className="flex justify-between">
          <span style={{ color: "var(--ink-2)" }}>Short-term gain</span>
          <span>PKR 412,900</span>
        </div>
        <div className="flex justify-between">
          <span style={{ color: "var(--ink-2)" }}>Estimated CGT</span>
          <span style={{ color: "var(--color-accent)" }}>PKR 61,935</span>
        </div>
        <StatusPill tone="info">FIFO · Filer</StatusPill>
      </div>
    ),
  },
];

const steps = [
  { icon: Upload, title: "Upload", desc: "Slips, contract notes, vouchers, exports." },
  { icon: Sparkles, title: "Extract", desc: "Multimodal AI with per-field confidence." },
  { icon: ScanSearch, title: "Reconcile", desc: "Rule engine diffs ledger vs broker." },
  { icon: FileCheck2, title: "File", desc: "Exportable CGT summary + audit trail." },
];

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
    items: [
      "Unlimited transactions",
      "PDF tax summary export",
      "Anomaly detection",
      "Tax-loss harvesting",
    ],
  },
  {
    name: "Enterprise",
    price: "$49",
    note: "Brokerages & portfolio managers",
    items: ["Multi-client accounts", "Team roles", "API access", "Priority reconciliation"],
  },
];

const faqs = [
  [
    "How is my financial data secured?",
    "Documents live in a private, per-organisation bucket served only through short-lived signed URLs. Every row is isolated by Postgres row-level security keyed to your organisation membership.",
  ],
  [
    "Which brokers are supported?",
    "AuditX is format-driven, not broker-driven: any PSX or NSE contract note, dividend voucher, CSV or Excel export can be parsed, including photographed slips.",
  ],
  [
    "Is the tax math AI-generated?",
    "No. FIFO lot matching, holding-period tiers, CGT bands and WHT are computed by deterministic code. The model only reads documents and explains results already computed.",
  ],
  [
    "Which jurisdictions are covered?",
    "Pakistan (PSX CGT slabs with Filer/Non-Filer WHT) and India (NSE STCG/LTCG) ship as configurable tax profiles. More jurisdictions are in progress.",
  ],
  [
    "What can I export?",
    "CSV on every plan; PDF tax summaries and full audit-trail reports on Pro and Enterprise.",
  ],
  [
    "How do I know a ledger row wasn't altered?",
    "Every mutation appends a hash-chained audit-log entry. The chain can be recomputed and verified from the audit trail screen.",
  ],
];

function Home() {
  return (
    <div style={{ fontFamily: "var(--font-body)", color: "var(--color-text)" }}>
      {/* HERO */}
      <section className="relative min-h-screen w-full overflow-hidden">
        <img
          src={heroBg}
          alt=""
          width={1920}
          height={1280}
          className="absolute inset-0 size-full object-cover"
        />
        <div className="absolute inset-0" style={{ background: "rgba(242,242,238,0.55)" }} />
        <div className="relative">
          <Navbar />
          <Container style={{}} className="pb-24">
            <div style={{ paddingTop: "clamp(40px, 8vw, 72px)" }} className="max-w-[560px]">
              <motion.h1
                variants={reveal}
                custom={0}
                initial="hidden"
                animate="visible"
                style={{
                  fontFamily: "var(--font-heading)",
                  fontSize: "clamp(1.65rem, 5vw, 3rem)",
                  lineHeight: 1.05,
                  letterSpacing: "-0.01em",
                  marginBottom: 24,
                }}
              >
                <Icon as={ShieldCheck} /> Reconcile Every Trade <Icon as={ScanSearch} /> with
                Audit-Grade Precision <Icon as={FileCheck2} />
              </motion.h1>
              <motion.p
                variants={reveal}
                custom={1}
                initial="hidden"
                animate="visible"
                style={{
                  fontSize: "clamp(0.9rem, 2.5vw, 1.1rem)",
                  lineHeight: 1.65,
                  opacity: 0.8,
                  maxWidth: 560,
                }}
              >
                Zero manual ledger work, total tax clarity. AuditX turns messy trade slips into a
                reconciled, audit-ready book with real-time capital gains and compliance tracking.
              </motion.p>
              <motion.div variants={reveal} custom={2} initial="hidden" animate="visible">
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.04, filter: "brightness(1.1)" }}
                  whileTap={{ scale: 0.96 }}
                  className="mt-8 flex items-center justify-between gap-8"
                  style={{
                    background: "var(--color-accent)",
                    color: "#fff",
                    borderRadius: 50,
                    padding: "17px 24px",
                    fontFamily: "var(--font-body)",
                    fontWeight: 600,
                    fontSize: "clamp(0.9rem, 2vw, 1rem)",
                    boxShadow: "0 4px 24px rgba(115,66,226,0.28)",
                    minWidth: 210,
                  }}
                >
                  Start Free Audit
                  <ArrowRightCircle size={20} strokeWidth={1.75} />
                </motion.button>
              </motion.div>
            </div>
          </Container>
        </div>
      </section>

      {/* TRUST STRIP */}
      <section style={{ background: "#fff" }}>
        <Container className="py-10">
          <p className="text-center text-sm" style={{ color: "var(--ink-2)" }}>
            Trusted by traders and micro-brokerages across PSX &amp; NSE
          </p>
          <div
            className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 text-sm font-semibold"
            style={{ color: "var(--ink-3)" }}
          >
            {["Meridian Capital", "SouthPort Securities", "Karachi Quant", "Nifty Desk", "Ledgerly"].map(
              (n) => (
                <span key={n}>{n}</span>
              ),
            )}
          </div>
        </Container>
      </section>

      {/* FEATURES */}
      <section style={{ background: "var(--color-login-bg)" }}>
        <Container className="py-20">
          <SectionHead
            eyebrow="Capabilities"
            title="Three engines, one reconciled book"
            sub="Extraction, detection and computation are separated on purpose — so every number can be traced back to a source document."
          />
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {features.map((f, i) => (
              <Reveal key={f.title} i={i}>
                <Panel className="h-full">
                  <f.icon size={24} strokeWidth={1.75} style={{ color: "var(--color-accent)" }} />
                  <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
                    {f.desc}
                  </p>
                  <div
                    className="mt-5 rounded-xl p-4"
                    style={{ background: "var(--color-login-bg)" }}
                  >
                    {f.mock}
                  </div>
                </Panel>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      {/* HOW IT WORKS */}
      <section style={{ background: "#fff" }}>
        <Container className="py-20">
          <SectionHead center eyebrow="How it works" title="Upload → Extract → Reconcile → File" />
          <div className="relative mt-14 grid gap-8 md:grid-cols-4">
            <div
              className="absolute top-6 right-8 left-8 hidden h-px md:block"
              style={{ background: "var(--hairline)" }}
            />
            {steps.map((s, i) => (
              <Reveal key={s.title} i={i} className="relative">
                <div
                  className="flex size-12 items-center justify-center rounded-full"
                  style={{ background: "rgba(115,66,226,0.1)" }}
                >
                  <s.icon size={22} strokeWidth={1.75} style={{ color: "var(--color-accent)" }} />
                </div>
                <h3 className="mt-4 text-base font-semibold">
                  {i + 1}. {s.title}
                </h3>
                <p className="mt-1.5 text-sm" style={{ color: "var(--ink-2)" }}>
                  {s.desc}
                </p>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      {/* ARCHITECTURE / TRUST */}
      <section style={{ background: "var(--color-login-bg)" }}>
        <Container className="grid items-center gap-12 py-20 md:grid-cols-2">
          <Reveal>
            <SectionHead
              eyebrow="Architecture"
              title="Immutable by construction, deterministic by design"
              sub="Every mutation to a transaction, flag or tax computation appends a sha256(previous_hash + payload) row to the audit log. Tax math runs as unit-tested TypeScript — the model never produces a number."
            />
            <ul className="mt-6 space-y-3 text-sm" style={{ color: "var(--ink-2)" }}>
              {[
                "Hash-chained audit log, verifiable client-side",
                "FIFO cost basis with holding-period tiers",
                "Confidence gating: < 0.75 routes to review",
                "Per-organisation row-level security",
              ].map((t) => (
                <li key={t} className="flex items-start gap-2.5">
                  <BadgeCheck
                    size={18}
                    strokeWidth={1.75}
                    style={{ color: "var(--color-accent)", flexShrink: 0, marginTop: 1 }}
                  />
                  {t}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal i={1}>
            <Panel className="p-8">
              <div className="space-y-3">
                {["0x9f2a…c41d", "0x71be…08aa", "0x33c0…9e17"].map((h, i) => (
                  <div
                    key={h}
                    className="flex items-center justify-between rounded-xl px-4 py-3"
                    style={{
                      background: i === 0 ? "rgba(115,66,226,0.08)" : "var(--color-login-bg)",
                    }}
                  >
                    <span className="flex items-center gap-2 text-xs font-medium">
                      <Lock size={16} strokeWidth={1.75} /> block #{1042 - i}
                    </span>
                    <span className="tnum text-xs" style={{ color: "var(--ink-2)" }}>
                      {h}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-5">
                <StatusPill tone="ok">Chain verified</StatusPill>
              </div>
            </Panel>
          </Reveal>
        </Container>
      </section>

      {/* PRODUCT PREVIEW */}
      <section style={{ background: "#fff" }}>
        <Container className="py-20">
          <SectionHead center eyebrow="Inside the app" title="Your book, always current" />
          <Reveal>
            <Panel className="mt-12 p-8">
              <div className="grid gap-6 md:grid-cols-4">
                {[
                  ["Portfolio value", "PKR 8,412,900", "+3.2%", "ok"],
                  ["Realized gains YTD", "PKR 612,450", "+8.1%", "ok"],
                  ["Est. tax liability", "PKR 91,867", "-1.4%", "bad"],
                  ["Unreconciled items", "7", "needs review", "warn"],
                ].map(([label, value, delta, tone]) => (
                  <div key={label}>
                    <p className="text-xs" style={{ color: "var(--ink-2)" }}>
                      {label}
                    </p>
                    <p className="tnum mt-1.5 text-xl font-semibold">{value}</p>
                    <div className="mt-2">
                      <StatusPill tone={tone as "ok"}>{delta}</StatusPill>
                    </div>
                  </div>
                ))}
              </div>
              <div
                className="mt-8 h-40 rounded-xl"
                style={{
                  background:
                    "linear-gradient(180deg, rgba(115,66,226,0.14), rgba(115,66,226,0.02))",
                }}
              />
            </Panel>
          </Reveal>
        </Container>
      </section>

      {/* REGIONS */}
      <section style={{ background: "var(--color-login-bg)" }}>
        <Container className="flex flex-wrap items-center justify-center gap-4 py-14">
          {["PSX · Pakistan", "NSE · India"].map((r) => (
            <span
              key={r}
              className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold"
              style={{ border: "1px solid var(--hairline)" }}
            >
              <Boxes
                size={16}
                strokeWidth={1.75}
                className="mr-2 inline"
                style={{ color: "var(--color-accent)" }}
              />
              {r}
            </span>
          ))}
          <span className="text-sm" style={{ color: "var(--ink-3)" }}>
            more jurisdictions coming
          </span>
        </Container>
      </section>

      {/* TESTIMONIALS */}
      <section style={{ background: "#fff" }}>
        <Container className="py-20">
          <SectionHead center eyebrow="Testimonials" title="Reconciliation, minus the weekend" />
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              [
                "Three days of month-end reconciliation collapsed into about twenty minutes.",
                "Sara Klein",
                "Portfolio Manager",
              ],
              [
                "The WHT mismatch flag alone caught a filer-status error worth six figures.",
                "Imran Qureshi",
                "Founder, SouthPort Securities",
              ],
              [
                "My accountant accepted the exported CGT summary without a single follow-up.",
                "Neha Raghavan",
                "Retail trader, NSE",
              ],
            ].map(([quote, name, role], i) => (
              <Reveal key={name} i={i}>
                <Panel className="h-full">
                  <p className="text-sm leading-relaxed">“{quote}”</p>
                  <div className="mt-6 flex items-center gap-3">
                    <div
                      className="flex size-9 items-center justify-center rounded-full text-xs font-semibold"
                      style={{ background: "rgba(115,66,226,0.1)", color: "var(--color-accent)" }}
                    >
                      {name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{name}</p>
                      <p className="text-xs" style={{ color: "var(--ink-3)" }}>
                        {role}
                      </p>
                    </div>
                  </div>
                </Panel>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      {/* PRICING PREVIEW */}
      <section style={{ background: "var(--color-login-bg)" }} id="pricing">
        <Container className="py-20">
          <SectionHead center eyebrow="Pricing" title="Start free, upgrade when your book grows" />
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {tiers.map((t, i) => (
              <Reveal key={t.name} i={i}>
                <Panel
                  className="h-full"
                  style={
                    t.popular
                      ? {
                          border: "2px solid var(--color-accent)",
                          boxShadow: "var(--shadow-hover)",
                        }
                      : undefined
                  }
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold">{t.name}</h3>
                    {t.popular && <StatusPill tone="info">Most popular</StatusPill>}
                  </div>
                  <p className="tnum mt-4 text-3xl font-semibold">
                    {t.price}
                    <span className="text-sm font-normal" style={{ color: "var(--ink-3)" }}>
                      {t.name === "Free" ? "" : "/mo"}
                    </span>
                  </p>
                  <p className="mt-1 text-xs" style={{ color: "var(--ink-3)" }}>
                    {t.note}
                  </p>
                  <ul className="mt-6 space-y-2.5 text-sm" style={{ color: "var(--ink-2)" }}>
                    {t.items.map((it) => (
                      <li key={it} className="flex items-start gap-2">
                        <BadgeCheck
                          size={16}
                          strokeWidth={1.75}
                          style={{ color: "var(--color-accent)", flexShrink: 0, marginTop: 2 }}
                        />
                        {it}
                      </li>
                    ))}
                  </ul>
                  <Btn className="mt-7 w-full" variant={t.popular ? "primary" : "secondary"}>
                    {t.name === "Enterprise" ? "Contact sales" : "Start Free Audit"}
                  </Btn>
                </Panel>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      {/* FAQ */}
      <section style={{ background: "#fff" }}>
        <Container className="py-20">
          <SectionHead center eyebrow="FAQ" title="Questions worth asking" />
          <div className="mx-auto mt-10 max-w-3xl">
            <Accordion type="single" collapsible>
              {faqs.map(([q, a], i) => (
                <AccordionItem key={q} value={`i${i}`} style={{ borderColor: "var(--hairline)" }}>
                  <AccordionTrigger className="text-left text-base font-semibold">
                    {q}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm" style={{ color: "var(--ink-2)" }}>
                    {a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </Container>
      </section>

      {/* FINAL CTA */}
      <section style={{ background: "var(--color-accent)" }}>
        <Container className="py-20 text-center">
          <h2 className="text-white" style={{ fontSize: "clamp(1.6rem,4vw,2.5rem)", lineHeight: 1.1 }}>
            Close your book with evidence, not guesswork
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm" style={{ color: "rgba(255,255,255,0.85)" }}>
            Parse your first 50 transactions free. No card, no broker credentials.
          </p>
          <div className="mt-8 flex justify-center">
            <Btn variant="inverse" className="px-7 py-3.5">
              <Wallet size={18} strokeWidth={1.75} /> Start Free Audit
            </Btn>
          </div>
        </Container>
      </section>

      <Footer />
    </div>
  );
}
