<div align="center">

<img src="public/favicon.svg" width="64" height="64" alt="AuditX Logo" />

# AuditX

### AI-Native Financial Audit & Compliance Agent for Regional Exchange Traders

**Reconcile every trade with audit-grade precision.**

[![License: MIT](https://img.shields.io/badge/License-MIT-7342E2.svg?style=flat-square)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6.svg?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB.svg?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E.svg?style=flat-square&logo=supabase&logoColor=white)](https://supabase.com/)
[![Gemini AI](https://img.shields.io/badge/Google-Gemini_2.0-4285F4.svg?style=flat-square&logo=google&logoColor=white)](https://aistudio.google.com/)
[![Vite](https://img.shields.io/badge/Vite-8.x-646CFF.svg?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)

[**Live Demo**](https://auditx-beta.vercel.app) · [**Documentation**](#-documentation) · [**Quick Start**](#-quick-start) · [**Report a Bug**](https://github.com/Ahmadjamil888/auditx/issues)

---

> AuditX turns messy PSX and NSE trade slips into a clean, reconciled, tax-accurate ledger
> using multimodal AI extraction and deterministic FIFO tax computation —
> replacing days of manual spreadsheet work with minutes.

</div>

---

## Table of Contents

- [Why AuditX](#-why-auditx)
- [Features](#-features)
- [Architecture](#-architecture)
- [Tech Stack](#-tech-stack)
- [Quick Start](#-quick-start)
- [Environment Variables](#-environment-variables)
- [Database Setup](#-database-setup)
- [Project Structure](#-project-structure)
- [AI Pipeline](#-ai-pipeline)
- [Tax Engine](#-tax-engine)
- [Roadmap](#-roadmap)
- [Contributing](#-contributing)
- [License](#-license)

---

## Why AuditX

Most accounting software is built for Western markets. **PSX, NSE, and regional exchange traders** face unique challenges:

| Pain Point | What AuditX Does |
|---|---|
| Broker slips in PDF, photo, CSV formats | Multimodal AI extracts every field with confidence scoring |
| Manual CGT calculation across FIFO lots | Deterministic TypeScript engine — never AI-guessed |
| Unknown WHT deductions & fee surcharges | Automated reconciliation against PSX/NSE tariff tables |
| No audit trail for tax filing | Immutable sha256 hash-chained ledger for every mutation |
| Separate spreadsheets per broker | Single reconciled book across unlimited broker accounts |

---

## Features

### Multimodal Statement Parser
Drop a **PDF, photo, CSV, or XLSX** broker export. Gemini 2.0 Flash extracts:
- Transaction date, ticker symbol, action (BUY/SELL/DIV)
- Execution price, quantity, brokerage fees, WHT
- Reference ID, broker name, exchange

Every field gets a **confidence score** (0–1). Anything below `0.75` routes to a review queue instead of auto-posting — the model never silently guesses.

### Discrepancy & Anomaly Detector
A deterministic rule engine (no AI) diffs your ledger against broker statements:
- Fee surcharges above SECP/NSE tariff rates
- WHT mismatches between filer/non-filer status
- Duplicate reference IDs, unmatched fills
- Gemini AI explains each flag in plain English on demand

### Real-Time Tax Optimizer
Full **FIFO lot matching** engine in TypeScript:
- Holding-period tiers (Short < 12m → 15%, Mid 12-24m → 12.5%, Long > 24m → 0% for PSX)
- NSE STCG (20%) / LTCG (12.5%) computation per Finance Act 2024
- Dividend WHT tracking (filer 10% / non-filer 12.5%)
- AI-ranked tax-loss harvesting suggestions validated against real positions
- Exportable PDF + CSV tax summary reports

### Immutable Audit Trail
Every mutation (parse, post, reconcile, compute) writes a `sha256(prev_hash + payload)` row. The chain can be verified client-side — any tampering breaks it instantly.

### Multi-Broker, Multi-Jurisdiction
- **PSX Pakistan** — CGT slabs, WHT rates, filer/non-filer status
- **NSE India** — STCG/LTCG per Budget 2024 rules
- Add unlimited broker accounts per organisation
- Configurable tax profiles per jurisdiction

### Team Roles & Multi-Tenancy
- Owner / Admin / Analyst / Viewer roles
- Row-level security: every table is isolated by `org_id`
- Invite team members, manage permissions

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     CLIENT (React SPA)                        │
│  TanStack Start · React 19 · Tailwind CSS v4 · Framer Motion │
│  TanStack Query · React Hook Form · Zod · Recharts            │
└──────────────────────┬───────────────────────────────────────┘
                       │ HTTPS / Supabase JS
┌──────────────────────▼───────────────────────────────────────┐
│                   SUPABASE BACKEND                            │
│  Auth (email + Google OAuth) · PostgreSQL + RLS               │
│  Storage (private trade-documents bucket)                     │
│  Realtime subscriptions                                       │
└──────────────────────┬───────────────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────────────┐
│                  GOOGLE AI LAYER                              │
│  Gemini 2.0 Flash — document parsing + anomaly narration      │
│  Gemini 2.0 Flash — tax explanation + portfolio analysis      │
│  All AI keys server-side only (never exposed to browser)      │
└──────────────────────────────────────────────────────────────┘
```

**Non-negotiable architecture rules:**
1. AI keys live in `.env` — never in client bundles for production
2. All tax math runs as deterministic TypeScript — LLM never computes numbers
3. Every extraction writes a `confidence_score`; anything < 0.75 → review queue
4. Every mutation appends to the immutable hash-chained `audit_log`
5. Multi-tenant isolation via `org_id` + Postgres RLS on every table

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend Framework | React 19 + TanStack Start (SSR) |
| Routing | TanStack Router (file-based) |
| Styling | Tailwind CSS v4 + custom design tokens |
| Animation | Framer Motion |
| Data Fetching | TanStack Query |
| Forms | React Hook Form + Zod |
| Charts | Recharts |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth (email + Google OAuth) |
| Storage | Supabase Storage |
| AI / ML | Google Gemini 2.0 Flash (`@google/genai` v2) |
| Build Tool | Vite 8 + Rolldown |
| Type Safety | TypeScript 5.8 |
| Icons | Lucide React |

---

## Quick Start

### Prerequisites
- Node.js ≥ 20
- npm ≥ 10
- A [Supabase](https://supabase.com) project
- A [Google AI Studio](https://aistudio.google.com/app/apikey) API key

### 1. Clone & install

```bash
git clone https://github.com/Ahmadjamil888/auditx.git
cd auditx
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Fill in your values — see Environment Variables below
```

### 3. Set up the database

Open your Supabase project → **SQL Editor** → **New query**.
Paste the entire contents of `supabase/schema.sql` and click **Run**.

This creates all 13 tables, RLS policies, the storage bucket, and the auto-provision trigger.

### 4. Enable Google OAuth (optional)

1. [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials → Create OAuth 2.0 Client ID
2. Add `http://localhost:8080` to Authorized JavaScript origins
3. Add `https://YOUR_PROJECT.supabase.co/auth/v1/callback` to Authorized redirect URIs
4. Supabase Dashboard → **Auth → Providers → Google** → enable, paste Client ID + Secret

### 5. Run locally

```bash
npm run dev
# → http://localhost:8080
```

### 6. Build for production

```bash
npm run build
npm run preview
```

---

## Environment Variables

Create a `.env` file at the project root (copy from `.env.example`):

```env
# Supabase — https://supabase.com/dashboard → Project Settings → API
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here

# Google AI Studio — https://aistudio.google.com/app/apikey
# For production: move to server-side env only (remove VITE_ prefix)
VITE_GOOGLE_AI_API_KEY=your-gemini-api-key-here

# Google OAuth Client ID
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com

# App URL
VITE_APP_URL=http://localhost:8080

# Stripe (optional)
# VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
# STRIPE_SECRET_KEY=sk_test_...
```

> **Security note:** `.env` is in `.gitignore`. Never commit real keys. For production deployments, inject secrets via your host's environment variable panel.

---

## Database Setup

The single file `supabase/schema.sql` is a **full reset + rebuild** script:

1. Drops all existing tables, triggers, and functions (safe to re-run)
2. Creates 13 tables in dependency order
3. Enables Row Level Security on every table
4. Creates `user_org_ids()` and `user_role_in_org()` RLS helper functions
5. Sets up the private `trade-documents` storage bucket
6. Installs the `on_auth_user_created` trigger (auto-provisions org + profile + subscription on signup)

**Tables:**

```
organizations          — multi-tenant root
profiles               — user ↔ org membership + role
tax_profiles           — per-jurisdiction CGT/WHT rules
broker_accounts        — PSX / NSE broker connections
documents              — uploaded statement files
transactions           — parsed + posted trade records
ledger_entries         — double-entry cash movements
reconciliation_flags   — detected discrepancies
tax_computations       — FIFO CGT computation results
tax_loss_harvest_suggestions
audit_log              — immutable hash-chained event log
subscriptions          — Stripe billing plan
notifications          — in-app alert feed
```

---

## Project Structure

```
auditx/
├── public/
│   ├── favicon.svg          # AuditX geometric mark (purple)
│   └── robots.txt
├── src/
│   ├── components/
│   │   ├── app/
│   │   │   └── AppShell.tsx       # Dashboard sidebar + topbar
│   │   ├── brand/
│   │   │   └── Logo.tsx           # SVG logo mark + wordmark
│   │   ├── site/
│   │   │   ├── Navbar.tsx         # Marketing nav
│   │   │   ├── Footer.tsx
│   │   │   └── PageShell.tsx
│   │   ├── ui/                    # shadcn/ui primitives
│   │   └── kit.tsx                # Btn, Panel, StatusPill, Reveal…
│   ├── lib/
│   │   ├── supabase.ts            # Supabase client + auth helpers
│   │   ├── auth-context.tsx       # React auth context (real session)
│   │   ├── ai-service.ts          # Gemini 2.0 Flash integration
│   │   ├── tax.ts                 # Deterministic FIFO tax engine
│   │   ├── data-hooks.ts          # TanStack Query hooks → Supabase
│   │   ├── demo-data.ts           # Fallback demo transactions
│   │   └── database.types.ts      # Supabase type stubs
│   ├── routes/
│   │   ├── index.tsx              # / — Marketing homepage
│   │   ├── signin.tsx             # /signin
│   │   ├── signup.tsx             # /signup
│   │   ├── forgot-password.tsx    # /forgot-password
│   │   ├── app.tsx                # /app — Auth guard + layout
│   │   ├── app.overview.tsx       # /app/overview
│   │   ├── app.ledger.tsx         # /app/ledger
│   │   ├── app.parser.tsx         # /app/parser — AI extraction
│   │   ├── app.reconciliation.tsx # /app/reconciliation
│   │   ├── app.tax.tsx            # /app/tax — FIFO engine
│   │   ├── app.audit-trail.tsx    # /app/audit-trail
│   │   ├── app.reports.tsx        # /app/reports
│   │   ├── app.settings.tsx       # /app/settings
│   │   ├── app.billing.tsx        # /app/billing
│   │   ├── pricing.tsx            # /pricing
│   │   ├── security.tsx           # /security
│   │   └── …                      # about, contact, help, news
│   └── styles.css                 # Design tokens + Tailwind config
├── supabase/
│   └── schema.sql                 # Full reset + rebuild schema
├── .env.example                   # Safe-to-commit env template
└── README.md
```

---

## AI Pipeline

AuditX uses Google Gemini 2.0 Flash for three distinct, bounded tasks:

### Document Parsing
```
User uploads PDF/image/CSV
        ↓
Gemini extracts 10 fields as structured JSON
        ↓
Zod validates schema server-side
        ↓
confidence_score < 0.75 → needs_review
confidence_score ≥ 0.75 → auto-post to ledger
        ↓
audit_log row appended (sha256 chained)
```

### Anomaly Explanation
The reconciliation engine flags discrepancies using **pure deterministic rules** (no AI). Gemini is then optionally invoked only to explain the pre-computed flag in plain English for the user.

### Tax Narration
FIFO math runs entirely in TypeScript (`src/lib/tax.ts`). Gemini is called afterward only to translate the computed numbers into a plain-English summary. It never produces or modifies a number.

---

## Tax Engine

The FIFO engine in `src/lib/tax.ts` supports:

**PSX — Pakistan (Finance Act 2024)**
- Short-term (< 365 days): **15% CGT**
- Mid-term (365–730 days): **12.5% CGT**
- Long-term (> 730 days): **0% CGT**
- Dividend WHT: **10% Filer / 12.5% Non-Filer**

**NSE — India (Budget 2024)**
- Short-term (< 365 days): **20% STCG**
- Long-term (≥ 365 days): **12.5% LTCG**

The engine is a pure function with zero side effects — fully unit-testable and auditable.

---

## Pricing

| Plan | Price | Transactions | Key Features |
|---|---|---|---|
| **Free** | $0 / mo | 50 / month | CSV export, 1 tax profile |
| **Pro** | $9.99 / mo | Unlimited | PDF reports, anomaly detection, tax-loss harvesting |
| **Enterprise** | $49 / mo | Unlimited | Multi-client, team roles, API access, priority support |

---

## Roadmap

- [x] Multimodal statement parser (PDF, image, CSV)
- [x] FIFO tax engine (PSX + NSE)
- [x] Immutable hash-chained audit log
- [x] Supabase Auth + Google OAuth
- [x] Multi-tenant RLS isolation
- [x] Tax-loss harvesting suggestions
- [x] Gemini AI anomaly explanations
- [ ] Stripe billing integration
- [ ] Scheduled PDF digest emails
- [ ] Broker API connections (CDC, CDSL)
- [ ] SECP / SEBI regulatory update webhooks
- [ ] Mobile app (React Native)
- [ ] Saudi Tadawul + SGX jurisdiction profiles
- [ ] Batch import via email parsing

---

## Contributing

Pull requests are welcome. For major changes, please open an issue first.

```bash
# Fork → clone → branch
git checkout -b feature/your-feature

# Make changes, ensure no TS errors
npx tsc --noEmit

# Build passes
npm run build

# Submit PR against main
```

Please follow the existing code style (Prettier + ESLint config included).

---

## License

MIT © AuditX Contributors

---

## Disclaimer

AuditX does not provide tax or legal advice. All computations are indicative only. Always consult a qualified tax professional before filing your returns.

---

<div align="center">

**Built for PSX · NSE · and every regional exchange trader who deserves better tooling.**

[Website](https://auditx.app) · [Twitter](https://twitter.com/auditxapp) · [LinkedIn](https://linkedin.com/company/auditx)

</div>
