# AuditX: Clarity First

# AuditX — Master Build Prompt for Lovable
### (Product: AuditX · Visual System: VaultShield's exact design language)

> Copy everything below into a single Lovable prompt. **AuditX is the product being built.** The color palette, typography, component mechanics, and motion system are taken **exactly** from the VaultShield spec (treat that spec as the locked design system, not a separate app) and applied across every AuditX marketing page, auth flow, and dashboard module. Do not build a password manager — build the financial audit/compliance product described in Section 0, skinned entirely in this design system.

---

## 0. Product Framing

Build **AuditX**, an AI-native financial audit and compliance agent for retail traders, micro-brokerages, and portfolio managers trading on regional exchanges (PSX, NSE, and similar emerging-market exchanges). AuditX ingests messy, unstructured trade confirmations (PDFs, photos, CSV/Excel exports, email receipts) and turns them into a clean, reconciled, tax-accurate ledger using multimodal AI extraction plus a deterministic reasoning/tax-computation layer.

**Core value proposition:** replace hours of manual ledger reconciliation and CGT computation with an autonomous, auditable, AI-assisted pipeline that is explainable and exportable for tax filing.

**Monetization (Freemium):**
- Free tier: up to 50 parsed transactions/month, 1 tax profile, CSV export only
- Pro — $9.99/month: unlimited transactions, PDF tax summary export, anomaly detection, tax-loss harvesting recommendations
- Enterprise — $49/month (or custom): multi-account/multi-client management, team roles, API access, priority reconciliation, dedicated audit-trail retention

**Regulatory framing:** configurable tax jurisdictions (PSX/Pakistan CGT slabs + Filer/Non-Filer WHT rates, NSE/India STCG/LTCG rules as a second profile), FIFO cost-basis accounting, holding-period tiers, dividend-withholding reconciliation. Persistent "not tax/legal advice" disclaimer in the tax module footer.

Non-negotiable quality bar: real auth, real persisted multi-tenant data, real interaction states (loading/empty/error/success), real deterministic math for FIFO/CGT/WHT (never LLM-guessed), real multimodal AI extraction with confidence scoring, and a fully wired command-style search + mobile navigation. Nothing is a static mock — every button either does something real or is visibly disabled with a tooltip explaining why.

---

## 1. Locked Design System (verbatim from VaultShield — reused for AuditX, brand copy swapped)

**Fonts**
- Heading font: `Helvetica Now Display Bold`, loaded via `<link>` in `index.html`: `https://db.onlinewebfonts.com/c/04e6981992c0e2e7642af2074ebe3901?family=Helvetica+Now+Display+Bold`
- Body font: `Inter` (weights 300–900), Google Fonts: `https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap`

**CSS variables**
```css
:root {
  --font-heading: 'Helvetica Now Display Bold', sans-serif;
  --font-body: 'Inter', sans-serif;
  --color-text: #192837;      /* primary ink */
  --color-accent: #7342E2;    /* primary purple — CTAs, active states, focus rings */
  --color-login-bg: #F2F2EE;  /* light neutral surface, dashboard app canvas + secondary buttons */
  --color-sheet: #CFC8C5;     /* warm taupe — mobile sheet / elevated nav panel */
}
```

**Derived tokens**
- Dashboard app background `#F2F2EE`, card surfaces white `#FFFFFF`, hairline borders `rgba(25,40,55,0.08)`.
- Accent scale: `#7342E2` primary, `#8F63EA` hover, `#5B2FC0` pressed; `rgba(115,66,226,0.08–0.12)` tints for selected rows/active nav/highlight backgrounds.
- Semantic status colors (financial meaning only, never decorative): green `#1F9D63` = reconciled/gain/healthy, amber `#C98A1A` = needs review/pending, red `#D64545` = discrepancy/loss/critical, blue `#3B6FD1` = informational.
- Text hierarchy: `#192837` primary, `rgba(25,40,55,0.65)` secondary, `rgba(25,40,55,0.4)` muted — no grays outside this family.
- Radius: `10px` inputs/buttons, `16px` cards, `24px` panels/modals, `50px`/pill for primary buttons.
- Shadows: `0 4px 24px rgba(115,66,226,0.12)` interactive hover, `0 2px 12px rgba(25,40,55,0.06)` ambient card shadow. No heavy black drop shadows.
- Numeric/financial data (prices, gains, tax amounts, ref IDs, hashes): Inter with `font-variant-numeric: tabular-nums`, used everywhere in ledger tables, stat cards, and the audit-trail hash column — this is the product's equivalent of VaultShield's mono-numeric convention.

**Logo** — adapt the exact geometric SVG language (32×32, angular constructive mark, `fill="#192837"`) into an AuditX mark; keep the same construction logic (bold angular geometric shape at 32×32, `viewBox 0 0 256 256`) rather than reusing VaultShield's literal path, paired with lowercase **auditx** wordmark, `text-lg font-semibold`, `gap-2` — matching the reference logo+wordmark pairing exactly.

**Full-bleed video hero mechanics (reuse exactly):**
- Full-screen background video: `absolute inset-0`, `object-cover`, `autoPlay muted loop playsInline`
- Container: `relative w-full min-h-screen`, `font-family: var(--font-body)`, `color: var(--color-text)`
- Navbar: max-width 1280px centered, `z-10`, `px-5 sm:px-8 py-4 sm:py-5`, flex items-center justify-between
- Hero content block: max-width 1280px container, `paddingTop: clamp(40px, 8vw, 72px)`, content capped `max-width: 560px`

**Navbar elements (adapted copy for AuditX):**
- Left: logo
- Center (`hidden md:flex`): links — `['Product', 'Pricing', 'Security', 'News', 'Help']`
- Right (desktop): "Start Free Audit" button (`background: #7342E2`, white text, pill, `px-5 py-2.5`) + "Sign In" button (`background: #F2F2EE`, dark text, pill, `px-5 py-2.5`)
- Mobile: hamburger (Menu/X, lucide-react), opens right-side slide-in sheet

**Mobile menu sheet (exact spec, reused everywhere in the app — marketing nav AND dashboard mobile nav):**
- Backdrop: `fixed inset-0`, `rgba(25,40,55,0.35)` + `backdrop-filter: blur(4px)`
- Sheet: `fixed right-0 top-0`, width `min(88vw, 360px)`, height `100dvh`, background `#CFC8C5`, `box-shadow: -12px 0 48px rgba(25,40,55,0.18)`
- Animation: `x: '100%'` → `x: 0`, ease `[0.22, 1, 0.36, 1]`, duration `0.45s`
- Content: logo + close button header, 1px divider, staggered nav links (`delay: 0.18 + i * 0.07`), bottom CTA buttons matching desktop style

**Hero heading treatment (pattern reused, copy changed):**
- Font `var(--font-heading)`, size `clamp(1.65rem, 5vw, 3rem)`, line-height `1.05`, letter-spacing `-0.01em`, color `#192837`, `margin-bottom: 24px`
- Inline Lucide icons at 24px, color `#192837`, `top: -2px` vertical nudge, matching the reference pattern of icons embedded mid-sentence
- AuditX headline: "Reconcile Every Trade with Audit-Grade Precision" — `ShieldCheck` icon before "Reconcile", `ScanSearch` icon between "Trade" and "with", `FileCheck2` icon after "Precision"

**Hero subtext (pattern reused, copy changed):**
- `var(--font-body)`, `clamp(0.9rem, 2.5vw, 1.1rem)`, line-height `1.65`, opacity `0.8`, `max-width: 560px`
- Copy: "Zero manual ledger work, total tax clarity. AuditX turns messy trade slips into a reconciled, audit-ready book with real-time capital gains and compliance tracking."

**CTA button (exact spec):**
- `background: #7342E2`, white text, `border-radius: 50px`, `padding: 17px 24px`, `var(--font-body)` semibold, `clamp(0.9rem, 2vw, 1rem)`, `box-shadow: 0 4px 24px rgba(115,66,226,0.28)`, `min-width: 210px`, flex `justify-between gap-8`
- Text: "Start Free Audit" + `ArrowRightCircle` icon (20px)
- Hover `scale(1.04) brightness(1.1)`, tap `scale(0.96)`

**Motion (Framer Motion, applied globally — every scroll-in section, modal, stat card, and sheet uses this):**
```js
hidden: { opacity: 0, y: 28 }
visible: { opacity: 1, y: 0, transition: { delay: i * 0.15, duration: 0.6, ease: [0.22, 1, 0.36, 1] } }
```
Apply via `whileInView` for scroll sections; apply directly with staggered `custom={i}` for hero heading (delay 0), subtext (0.15s), CTA (0.30s), and for every dashboard stat card on first mount.

**Iconography:** Lucide React exclusively, 18–24px, `strokeWidth={1.75}`, `#192837` default, `--color-accent` when active/selected.

**Core reusable components (build once, use everywhere):**
- Primary button (pill, `#7342E2`, hover/tap states above)
- Secondary button (pill, `#F2F2EE` bg, dark text)
- Ghost/text button (no bg, opacity hover)
- Card (white, `16px` radius, hairline border, ambient shadow)
- Status pill (dot + label, semantic color at 10% bg tint) — used for reconciliation status, tax-computation status, extraction confidence tier
- Dense data table (sticky header, sortable columns, row hover in accent-8% tint, right-aligned tabular-numeric columns, row action menu) — this is the ledger/reconciliation/audit-log table pattern throughout the dashboard
- Modal / slide-in sheet (reuse exact mobile-menu mechanics: backdrop blur `rgba(25,40,55,0.35)`+`blur(4px)`, sheet bg `#CFC8C5` for nav/menu contexts, white sheet for data-editing/document-review contexts)
- Empty state (icon + one sentence + primary action)
- Toast notifications (bottom-right, semantic-colored left border)
- Confidence badge (small pill, green ≥0.9, amber 0.75–0.9, red <0.75 — routes low-confidence rows to review queue)

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT (React SPA)                       │
│  React 18 + TypeScript + Vite + TailwindCSS + shadcn/ui          │
│  (restyled entirely to Section 1 tokens — no default shadcn look)│
│  React Query for server state · Zustand for local UI state       │
│  React Router · Recharts for data viz · Framer Motion            │
│  React Hook Form + Zod for all form validation                   │
└───────────────┬───────────────────────────────────────────────────┘
                │ HTTPS / Supabase JS client
┌───────────────▼───────────────────────────────────────────────────┐
│                     SUPABASE BACKEND (BaaS)                      │
│  ── Auth ── Email/password + magic link, JWT sessions, org RLS   │
│  ── Postgres (RLS) ── organizations · profiles · org_members ·   │
│  tax_profiles · broker_accounts · transactions · ledger_entries ·│
│  reconciliation_flags · tax_computations ·                        │
│  tax_loss_harvest_suggestions · audit_log · subscriptions ·       │
│  documents · notifications                                        │
│  ── Storage ── bucket trade-documents (private, per-org, signed) │
│  ── Edge Functions (Deno, server secrets) ──                     │
│    parse-statement · reconcile-ledger · compute-tax ·             │
│    suggest-tax-loss-harvest · generate-audit-report ·             │
│    stripe-webhook · create-checkout-session                       │
│  ── Realtime ── live ledger updates, live flags, live audit feed │
└───────────────┬───────────────────────────────────────────────────┘
┌───────────────▼───────────────────────────────────────────────────┐
│                  EXTERNAL AI / SERVICES LAYER                    │
│  Multimodal LLM (document understanding) — edge-function only,    │
│  key never exposed client-side · Stripe (billing) · email service │
└─────────────────────────────────────────────────────────────────┘
```

**Rules to enforce:**
1. AI keys live only in edge-function secrets.
2. All tax math (FIFO cost basis, CGT bands, WHT) runs as deterministic TypeScript in `compute-tax` — the LLM never computes numbers, only extracts documents and explains already-computed results.
3. Every AI extraction writes a `confidence_score` per field; anything below 0.75 routes to a "Needs Review" queue instead of auto-posting.
4. Every mutation to `transactions`/`tax_computations`/`reconciliation_flags` writes an immutable, hash-chained row to `audit_log` (`sha256(previous_hash + payload)`).
5. Multi-tenant isolation via `organization_id` + Postgres RLS keyed to `org_members`.

---

## 3. Site Map — Marketing (Public), in the VaultShield visual system

### `/` — Home
1. **Hero** (Section 1 spec, exact mechanics, AuditX copy)
2. **Trust strip** — "Trusted by traders and micro-brokerages across PSX & NSE" + partner/press logo row
3. **Feature grid (3-up)** — Multimodal Statement Parser / Anomaly & Discrepancy Detector / Real-Time Tax Optimizer — icon, heading, 1-line description, mini UI mock per card
4. **How it works (4-step timeline)** — Upload → Extract → Reconcile → File, animated connecting line, Lucide icon per step
5. **Architecture/trust section** — split layout: left copy on immutable hash-chained audit logging and deterministic tax math, right an animated ledger/shield SVG built from the AuditX logo's geometric language
6. **Live product preview section** — mock dashboard card showing a portfolio summary ring + realized-gains sparkline, teasing `/app/overview`
7. **Regional coverage band** — PSX / NSE badges + "more jurisdictions coming" note
8. **Testimonials carousel** — 3–5 cards (avatar, quote, name/role), matching the Stratify/Sara Klein glass-card testimonial pattern but restyled to the white-card system
9. **Pricing preview (3 tiers)** — Free / Pro / Enterprise cards, "Most popular" accent ring on Pro
10. **FAQ accordion** — 6–8 questions (data security, supported brokers, tax accuracy, jurisdictions, export formats)
11. **Final CTA band** — full-width `--color-accent` background, white heading, "Start Free Audit" CTA in white/accent-inverse
12. **Footer** — 4 columns (Product, Company, Resources, Legal) + social icons + logo, on `--color-login-bg`

### `/pricing`
Full plan comparison (Free / Pro / Enterprise), monthly/annual toggle with "Save 20%" badge, row-by-row feature table (sticky feature-name column), plan-specific FAQ, enterprise contact-sales card.

### `/security`
Zero-manual-error architecture explainer: immutable audit-log hash-chain diagram, encryption-at-rest/in-transit specs, SOC2/compliance badge placeholders, data-retention policy, bug-bounty CTA.

### `/how-it-works`
Deep-dive version of the homepage 4-step flow: full walkthrough with screenshots of the parser, reconciliation, and tax engine in action; sample before/after of a messy PDF slip → structured ledger row.

### `/news` — Blog / Changelog
Filterable article grid (Product, Compliance Updates, Company) + a "Latest release notes" timeline feed (version, date, bullet changes).

### `/help` — Help Center
Large centered search bar, category tile grid (Getting Started, Uploading Statements, Reconciliation, Tax & CGT, Billing, Troubleshooting), popular-articles list, contact-support CTA.

### `/about` and `/contact`
About: mission, team grid, values, press mentions. Contact: form (name/email/subject/message, Zod-validated) + contact details.

---

## 4. Auth Flow (VaultShield mechanics, AuditX copy)

- `/signin` — split screen: left brand panel (logo mark large, still frame from hero video or gradient, tagline), right form (email/password, "Continue with Google" button, forgot-password link)
- `/signup` — same shell; form includes organization name + jurisdiction picker (PSX/NSE/Other) at signup
- `/forgot-password`, `/reset-password` — centered card flows
- `/onboarding` — 4-step wizard: (1) confirm org + default tax profile, (2) add first broker account, (3) upload first statement (or "load demo data"), (4) invite team members (optional, skippable) → lands on `/app/overview`

---

## 5. Dashboard (Authenticated App) — Full Site Map

Persistent left sidebar (white on `#F2F2EE` app canvas) with: **Overview, Ledger, Statement Parser, Reconciliation, Tax Center, Audit Trail, Reports, Settings, Billing.** Org switcher pinned top, avatar menu pinned bottom. Top bar: global search opening a `⌘K` command palette, "+ Upload document" quick action, notification bell.

### `/app/overview` — Dashboard Home
- 4 stat cards (Portfolio Value, Realized Gains YTD, Estimated Tax Liability, Unreconciled Items) — tabular-numeric figures, sparkline, delta chip green/red
- Cumulative realized P&L area chart (Recharts, accent-colored series)
- Holdings allocation donut (by ticker/sector)
- "Needs attention" panel — low-confidence extractions + open discrepancy flags, one-click resolve
- Recent activity feed pulled from `audit_log`
- Quick-add tile row: Upload Statement / Add Broker Account / Run Reconciliation / Generate Tax Report

### `/app/ledger` — All Transactions
- Full data table: ticker, action (BUY/SELL/DIV), quantity, price, fees, WHT, trade date, ref ID, confidence badge, status pill, row action menu
- Left filter rail: broker account, date range, action type, status (posted/pending review), favorites/flagged
- Bulk actions: post to ledger, send to review, delete
- Row detail slide-in sheet (white sheet variant): full field view, edit fields, linked source document preview, mini audit history for that row

Sub-views:
- `/app/ledger/positions` — current open positions table (ticker, quantity held, avg cost basis, unrealized P&L, last price)
- `/app/ledger/dividends` — dividend/WHT specific ledger view

### `/app/parser` — Statement Parser (Feature A)
- Large drag-and-drop zone (PDF/PNG/JPG/CSV/XLSX) + 3 "try a sample" buttons (PSX broker slip, NSE contract note, dividend voucher)
- Real-time processing timeline (Uploading → Extracting → Validating → Ready for review), backed by `parse-statement` + realtime status updates
- Extraction review table: every field editable, per-field confidence badge, document preview pane alongside for visual verification
- "Post to Ledger" (disabled until valid) / "Send to Review Queue"

### `/app/reconciliation` — Discrepancy & Anomaly Detector (Feature B)
- Run panel: broker account + date range → "Run Reconciliation" (`reconcile-ledger`)
- Results table: flag type (Unmatched Trade / Duplicate Fill / Fee Surcharge / WHT Mismatch), severity pill, expected vs actual (tabular-numeric, diffed red/green), suggested resolution
- Row expand → parsed slip vs ledger entry side-by-side, mismatched fields highlighted
- Bulk actions: apply suggested fix, mark as expected, escalate

### `/app/tax` — Tax & Ledger Optimizer (Feature C)
- Tax year + jurisdiction/tax-profile selector
- Summary cards: Short-term gains, Long-term gains, Dividend WHT withheld, Estimated tax due (from `compute-tax`, deterministic FIFO)
- Realized gains table: FIFO lot matching per row (buy lot → sell → holding period → gain → tax band)
- Tax-Loss Harvesting panel: AI-ranked open losing positions with potential offset + one-line rationale, validated against real position data before render
- "Generate Tax Report" → `generate-audit-report` → PDF + CSV
- Persistent "not tax/legal advice" footer disclaimer

### `/app/audit-trail` — Immutable Audit Log
- Chronological, filterable table (actor, action type, entity, date range)
- Each row: timestamp, actor (user or "AuditX Agent"), action, entity, short hash + "Verify chain" button that recomputes and confirms the hash chain client-side

### `/app/reports`
Saved/scheduled report library, export history, download links (signed URLs), report scheduling (weekly/monthly digest toggle).

### `/app/settings`
Sub-tabs: **Organization** (name, jurisdiction default, logo), **Tax Profiles** (add/edit jurisdiction rules — CGT bands, WHT rates, holding-period tiers), **Broker Accounts** (add/edit/remove, currency, external ref), **Team & Roles** (Owner/Admin/Analyst/Viewer, invite flow), **Notifications**, **API Keys** (Enterprise), **Danger Zone** (delete org, double-confirm modal).

### `/app/billing`
Current plan card + usage meter (transactions this month vs plan limit), plan comparison/upgrade via Stripe Checkout, payment method card, invoice history table.

### `/app/admin` (Enterprise plan only, role-gated)
Org-wide policy settings, multi-client/multi-account rollup view, member directory with bulk role management, org-wide reconciliation health leaderboard, API usage dashboard.

---

## 6. Data Model (Supabase Postgres + RLS)

```sql
organizations (id, name, jurisdiction_default, created_at)
profiles (id, org_id, user_id, full_name, role) -- owner|admin|analyst|viewer
tax_profiles (id, org_id, jurisdiction, cgt_rules jsonb, wht_rules jsonb, holding_period_tiers jsonb)
broker_accounts (id, org_id, name, broker_name, currency, external_ref)
documents (id, org_id, broker_account_id, storage_path, doc_type, status, uploaded_by, created_at)
transactions (id, org_id, broker_account_id, document_id, ticker, action, quantity, price,
              fees, wht, trade_date, ref_id, confidence_score, status, source jsonb)
ledger_entries (id, org_id, broker_account_id, transaction_id, entry_type, amount, balance_after)
reconciliation_flags (id, org_id, broker_account_id, flag_type, severity, expected jsonb,
                       actual jsonb, status, resolution jsonb, created_at)
tax_computations (id, org_id, tax_profile_id, tax_year, short_term_gain, long_term_gain,
                   dividend_wht, estimated_tax_due, computed_at, breakdown jsonb)
tax_loss_harvest_suggestions (id, org_id, position_ticker, unrealized_loss, potential_offset,
                               rationale, status)
audit_log (id, org_id, actor, action, entity_type, entity_id, payload jsonb,
           prev_hash, hash, created_at)
subscriptions (id, org_id, plan, status, stripe_customer_id, stripe_subscription_id,
               current_period_end)
notifications (id, org_id, user_id, type, message, read, created_at)
```
RLS on every table: `org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())`, role-gated writes (e.g., only admin/owner edits tax profiles; viewer read-only).

---

## 7. AI / ML Pipeline

**`parse-statement`:** multimodal model call with strict JSON-schema response (`transaction_date, ticker, action, quantity, price, commission, wht, ref_id` + per-field `field_confidence`); Zod-validated server-side, retry once on schema failure; insert `pending_review` if any confidence < 0.75, else `posted` + cascade `ledger_entries`; write `audit_log` row.

**`reconcile-ledger`:** deterministic rule engine (no LLM) — diff-matches transactions against cash-balance ledger entries by ref_id/date/amount tolerance; flags unmatched trades, duplicate ref_ids, fees above configured broker tariff, WHT mismatches vs filer/non-filer status.

**`compute-tax`:** deterministic FIFO lot-matching engine in TypeScript — per-ticker FIFO buy-lot queue, match sells against oldest lots, compute holding period per match, apply the org's `cgt_rules` bands, sum short/long-term gains, track dividend WHT already withheld. Unit-testable, zero model calls.

**`suggest-tax-loss-harvest`:** takes the real computed open-positions/unrealized-P&L dataset, sends to the LLM only to rank/explain in natural language, then validates every referenced ticker/number against the source dataset before returning — discard any suggestion referencing a value not present in the input.

---

## 8. Build Order for Lovable

1. Lock design tokens (Section 1) into Tailwind config + global CSS; build the core reusable component set.
2. Build the marketing hero exactly per Section 1/3 mechanics with AuditX copy, then all remaining `/` sections.
3. Build `/pricing`, `/security`, `/how-it-works`, `/news`, `/help`, `/about`, `/contact`.
4. Build auth flow + onboarding wizard (Section 4).
5. Build Supabase schema + RLS (Section 6) and auth wiring.
6. Build dashboard shell: sidebar, top bar, search, `⌘K` command palette, org switcher, mobile nav sheet (reusing exact VaultShield sheet mechanics).
7. Build `/app/parser` + `parse-statement` edge function + Storage bucket wiring.
8. Build `/app/overview` and `/app/ledger` (+ sub-views) wired to real transaction/ledger data.
9. Build `/app/reconciliation` + `reconcile-ledger` edge function.
10. Build `/app/tax` + `compute-tax` (FIFO engine) + `suggest-tax-loss-harvest`.
11. Build `/app/audit-trail` with hash-chain logging wired into every mutation above.
12. Build `/app/billing` (Stripe Checkout + Customer Portal + `stripe-webhook`) and usage metering.
13. Build `/app/settings` (all sub-tabs) and `/app/reports`.
14. Build `/app/admin`, role-gated to Enterprise plan.
15. Seed realistic demo data (demo org, 2 broker accounts, ~60 transactions across PSX/NSE, a few pre-flagged discrepancies, one completed tax computation) behind a "Load demo data" onboarding option.
16. Final polish: empty/loading/error states everywhere, responsive QA, keyboard nav, motion consistency pass against Section 1.

Build this as one cohesive, production-quality product in the exact VaultShield visual language — not a generic dashboard template and not a second app. Every screen should look and move like it belongs to the same design system as the reference hero.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/5357fa68-f4af-40d8-9c7a-388f4085158d).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
