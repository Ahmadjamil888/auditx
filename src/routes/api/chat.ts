import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, stepCountIs, streamText, tool, type UIMessage } from "ai";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { resolveAgentModel, AI_PROVIDER_OPTIONS } from "@/lib/audit-agent.server";
import { computeTax } from "@/lib/tax";
import { computePortfolioSummary } from "@/lib/financial-intelligence";
import type { Transaction } from "@/lib/demo-data";

type ChatBody = { id?: unknown; messages?: unknown };

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const SHEET_RE = /\.(xlsx|xls|csv|txt|tsv)$/i;
const SHEET_TYPES = ["spreadsheetml", "ms-excel", "text/csv", "text/plain", "tab-separated"];

/** Convert Excel/CSV/text file parts into text parts the model can read. */
async function spreadsheetsToText(messages: UIMessage[]): Promise<UIMessage[]> {
  let XLSX: typeof import("xlsx") | null = null;
  return Promise.all(
    messages.map(async (m) => {
      if (m.role !== "user") return m;
      const parts = await Promise.all(
        m.parts.map(async (p) => {
          if (p.type !== "file") return p;
          const name = p.filename ?? "file";
          const isSheet = SHEET_RE.test(name) || SHEET_TYPES.some((t) => p.mediaType?.includes(t));
          if (!isSheet || !p.url.startsWith("data:")) return p;
          try {
            const b64 = p.url.slice(p.url.indexOf(",") + 1);
            const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
            let body: string;
            if (/\.(xlsx|xls)$/i.test(name) || p.mediaType?.includes("sheet") || p.mediaType?.includes("excel")) {
              XLSX ??= await import("xlsx");
              const wb = XLSX.read(bytes, { type: "array" });
              body = wb.SheetNames.map((s) => `### Sheet: ${s}\n${XLSX!.utils.sheet_to_csv(wb.Sheets[s]!)}`).join("\n\n");
            } else {
              body = new TextDecoder().decode(bytes);
            }
            return { type: "text" as const, text: `Attached file "${name}":\n\`\`\`\n${body.slice(0, 60000)}\n\`\`\`` };
          } catch {
            return { type: "text" as const, text: `Attached file "${name}" could not be read.` };
          }
        }),
      );
      return { ...m, parts } as UIMessage;
    }),
  );
}

/** Safe arithmetic evaluator (no eval — Workers forbid it). */
function evaluateExpression(input: string): number {
  const tokens = input.match(/\d+(\.\d+)?|[+\-*/()%]/g);
  if (!tokens || tokens.join("") !== input.replace(/\s+/g, "")) {
    throw new Error("Expression may only contain numbers and + - * / % ( )");
  }
  let pos = 0;
  const peek = () => tokens[pos];
  const parseExpr = (): number => {
    let value = parseTerm();
    while (peek() === "+" || peek() === "-") {
      const op = tokens[pos++];
      const rhs = parseTerm();
      value = op === "+" ? value + rhs : value - rhs;
    }
    return value;
  };
  const parseTerm = (): number => {
    let value = parseFactor();
    while (peek() === "*" || peek() === "/" || peek() === "%") {
      const op = tokens[pos++];
      const rhs = parseFactor();
      if (op === "*") value *= rhs;
      else if (op === "/") value /= rhs;
      else value = (value * rhs) / 100;
    }
    return value;
  };
  const parseFactor = (): number => {
    const token = tokens[pos];
    if (token === "(") {
      pos++;
      const value = parseExpr();
      if (tokens[pos] !== ")") throw new Error("Unbalanced parentheses");
      pos++;
      return value;
    }
    if (token === "-") {
      pos++;
      return -parseFactor();
    }
    pos++;
    const value = Number(token);
    if (Number.isNaN(value)) throw new Error(`Unexpected token: ${token}`);
    return value;
  };
  const result = parseExpr();
  if (pos !== tokens.length) throw new Error("Could not parse expression");
  return result;
}

const SPECIALISTS = {
  extraction:
    "You are the Data Extraction Agent. Read documents, statements, invoices, contract notes and spreadsheets supplied in the objective/context. Return every field you can support (ticker, action, quantity, price, fees, WHT, date, reference, broker, exchange, totals) with a per-field confidence 0-1 and the exact source line/label you read it from. Never invent a value; write UNKNOWN instead.",
  analysis:
    "You are the Financial Analysis Agent. Analyse holdings, performance, exposure, cost basis and cash flows from the supplied data only. Quantify everything and state the arithmetic you relied on.",
  reconciliation:
    "You are the Reconciliation Agent. Compare two or more sets of records, match on reference/date/quantity/price, and list matched, unmatched and partially matched items with exact deltas.",
  compliance:
    "You are the Audit & Compliance Agent. Test the data for anomalies, duplicates, fee surcharges, WHT mismatches, out-of-sequence dates, missing references and policy risks. Rate each finding low/medium/high.",
  evidence:
    "You are the Evidence & Verification Agent. For every claim supplied to you, name the specific source document, row, reference id or ledger record that supports it, and mark anything unsupported as ASSUMPTION.",
  research:
    "You are the Research Agent. Using only the context supplied (no browsing), summarise relevant market, tax-rule or broker-format knowledge, and clearly label anything that is general knowledge rather than user data.",
  calculation:
    "You are the Calculation Agent. Recompute every material figure from the supplied numbers using explicit arithmetic. Return labelled values, the expression used, and flag any missing inputs. Never estimate.",
  quality:
    "You are the Quality Control Agent. Independently re-check the supplied findings for arithmetic errors, contradictions, unsupported claims and missing caveats. Return PASS or REVISE with a precise list of corrections.",
} as const;

const LEDGER_TEMPLATE_COLUMNS = [
  "ticker",
  "action",
  "quantity",
  "price",
  "fees",
  "wht",
  "trade_date",
  "ref_id",
  "broker",
  "exchange",
] as const;

function csvEscape(value: string | number | null | undefined) {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(headers: string[], rows: Array<Array<string | number | null | undefined>>) {
  return [headers.map(csvEscape).join(","), ...rows.map((row) => row.map(csvEscape).join(","))].join("\n");
}

function asTransaction(row: {
  id: string;
  ticker: string;
  action: string;
  quantity: number;
  price: number;
  fees: number;
  wht: number;
  trade_date: string;
  ref_id: string;
  confidence_score: number;
  status: string;
  broker: string;
  exchange: string;
}): Transaction {
  return {
    id: row.id,
    ticker: row.ticker,
    action: row.action as Transaction["action"],
    quantity: Number(row.quantity),
    price: Number(row.price),
    fees: Number(row.fees ?? 0),
    wht: Number(row.wht ?? 0),
    trade_date: row.trade_date,
    ref_id: row.ref_id,
    confidence_score: Number(row.confidence_score ?? 0),
    status: row.status as Transaction["status"],
    broker: row.broker,
    exchange: row.exchange === "NSE" ? "NSE" : "PSX",
  };
}

function missingFields(row: {
  ticker: string;
  action: string;
  quantity: number;
  price: number;
  trade_date: string;
  ref_id: string;
}) {
  const missing: string[] = [];
  if (!row.ticker || row.ticker === "UNKNOWN") missing.push("ticker");
  if (!["BUY", "SELL", "DIV"].includes(row.action)) missing.push("action");
  if (!row.quantity) missing.push("quantity");
  if (!row.price) missing.push("price");
  if (!row.trade_date) missing.push("trade_date");
  if (!row.ref_id) missing.push("ref_id");
  return missing;
}

// Lets sites hosted elsewhere (e.g. psxl.live on Vercel) use the Lovable-hosted
// AI endpoint. Callers are still authenticated by their bearer token.
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, x-requested-with",
  "Access-Control-Expose-Headers": "*",
};
type Handler = (ctx: { request: Request }) => Promise<Response>;
function withCors(handlers: Record<string, Handler>) {
  const wrapped: Record<string, Handler> = {
    OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
  };
  for (const [method, fn] of Object.entries(handlers)) {
    wrapped[method] = async (ctx) => {
      const res = await fn(ctx);
      const headers = new Headers(res.headers);
      for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
    };
  }
  return wrapped;
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: withCors({
      // ── DELETE /api/chat?threadId=xxx — clear a chat thread ──────────────
      DELETE: async ({ request }) => {
        const authorization = request.headers.get("authorization") ?? "";
        if (!authorization.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });

        const url2 = new URL(request.url);
        const threadId = url2.searchParams.get("threadId");
        if (!threadId) return new Response("threadId is required", { status: 400 });

        const supabaseUrl = process.env["SUPABASE_URL"] ?? (import.meta.env["VITE_SUPABASE_URL"] as string | undefined);
        const supabaseKey = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? ((import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? import.meta.env["VITE_SUPABASE_ANON_KEY"]) as string | undefined);
        if (!supabaseUrl || !supabaseKey) return new Response("Database configuration is missing: set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY", { status: 500 });

        const db = createClient<Database>(supabaseUrl, supabaseKey, {
          global: { headers: { Authorization: authorization } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: authData, error: authError } = await db.auth.getUser();
        if (authError || !authData.user) return new Response("Unauthorized", { status: 401 });

        // Verify ownership
        const { data: thread } = await db
          .from("chat_threads")
          .select("id")
          .eq("id", threadId)
          .eq("user_id", authData.user.id)
          .maybeSingle();
        if (!thread) return new Response("Thread not found", { status: 404 });

        // Delete messages first (FK), then thread
        await db.from("chat_messages").delete().eq("thread_id", threadId);
        const { error: delErr } = await db
          .from("chat_threads")
          .delete()
          .eq("id", threadId)
          .eq("user_id", authData.user.id);
        if (delErr) return new Response(delErr.message, { status: 500 });

        return new Response(JSON.stringify({ deleted: true, threadId }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },

      POST: async ({ request }) => {
        const authorization = request.headers.get("authorization") ?? "";
        if (!authorization.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });

        const body = (await request.json()) as ChatBody;
        if (typeof body.id !== "string" || !Array.isArray(body.messages)) {
          return new Response("A thread id and messages are required", { status: 400 });
        }

        const url = process.env["SUPABASE_URL"] ?? (import.meta.env["VITE_SUPABASE_URL"] as string | undefined);
        const key =
          process.env["SUPABASE_PUBLISHABLE_KEY"] ??
          ((import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? import.meta.env["VITE_SUPABASE_ANON_KEY"]) as string | undefined);
        const approvalSecret = process.env["TOOL_APPROVAL_SECRET"] ?? "auditx-tool-approval";
        if (!url || !key) return new Response("Database configuration is missing: set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY", { status: 500 });

        // Get env from global storage (set in server.ts)
        const env = (globalThis as any).__VERCEL_ENV__;
        console.log("[AuditX Chat] env from global:", env ? "exists" : "undefined");
        if (env) {
          console.log("[AuditX Chat] env keys:", Object.keys(env));
        }

        const resolved = await resolveAgentModel(env);
        if (!resolved) {
          // Key is missing or placeholder — tell the operator exactly what to do
          console.warn(
            "[AuditX] AI not configured. " +
            "Create a .env file with OPENROUTER_API_KEY to enable AI features.",
          );
          return new Response(
            JSON.stringify({
              code: "ai_not_configured",
              message:
                "AI is not configured on this server. " +
                "Add OPENROUTER_API_KEY (or GROQ_API_KEY) to your hosting environment variables and redeploy.",
            }),
            { status: 503, headers: { "Content-Type": "application/json" } },
          );
        }
        const model = resolved.model;

        const supabase = createClient<Database>(url, key, {
          global: { headers: { Authorization: authorization } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData.user) return new Response("Unauthorized", { status: 401 });

        const { data: thread, error: threadError } = await supabase
          .from("chat_threads")
          .select("id, org_id")
          .eq("id", body.id)
          .eq("user_id", authData.user.id)
          .single();
        if (threadError || !thread) return new Response("Thread not found", { status: 404 });

        // ── Quota check (graceful — ai_usage table may not exist yet) ────────
        const DAILY_LIMITS: Record<string, number> = { free: 20, pro: 100, enterprise: 500 };
        const STEP_LIMITS: Record<string, number> = { free: 10, pro: 18, enterprise: 28 };
        const MONTHLY_TX_LIMITS: Record<string, number | null> = { free: 50, pro: null, enterprise: null };

        const { data: subData } = await supabase
          .from("subscriptions")
          .select("plan, status")
          .eq("org_id", thread.org_id)
          .maybeSingle();
        // Paid features only apply while billing is in good standing.
        const billingOk = !subData?.status || ["active", "trialing"].includes(subData.status as string);
        const plan = billingOk ? ((subData?.plan as string | undefined) ?? "free") : "free";
        const dailyLimit = DAILY_LIMITS[plan] ?? DAILY_LIMITS["free"]!;
        const maxSteps = STEP_LIMITS[plan] ?? STEP_LIMITS["free"]!;
        const monthlyTxLimit = MONTHLY_TX_LIMITS[plan] ?? 50;

        let creditsUsedToday = 0;
        try {
          const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
          const { data: usageRows } = await supabase
            .from("ai_usage")
            .select("credits_used")
            .eq("user_id", authData.user.id)
            .eq("status", "ok")
            .gte("created_at", since24h);
          creditsUsedToday = (usageRows ?? []).reduce((s, r) => s + (r.credits_used ?? 0), 0);
        } catch {
          // Table not migrated yet — skip quota check, don't block the request
          console.warn("[AuditX] ai_usage table not available yet; skipping quota check.");
        }

        if (creditsUsedToday >= dailyLimit) {
          const planLabel = plan.charAt(0).toUpperCase() + plan.slice(1);
          const msg =
            plan === "free"
              ? `You've reached today's AI limit. Your Free plan includes ${dailyLimit} AI requests per day. Your limit will reset in the next 24 hours.`
              : `You've used all ${dailyLimit} AI credits available today on your ${planLabel} plan. Your limit resets in 24 hours.`;
          return new Response(
            JSON.stringify({ code: "quota_exceeded", plan, daily_limit: dailyLimit, credits_used: creditsUsedToday, message: msg }),
            { status: 429, headers: { "Content-Type": "application/json" } },
          );
        }

        // Track this request — fire-and-forget, never block the stream
        const usageId = crypto.randomUUID();
        supabase.from("ai_usage").insert({
          id:                 usageId,
          user_id:            authData.user.id,
          org_id:             thread.org_id,
          plan,
          thread_id:          thread.id,
          model:              resolved.modelId,
          inference_requests: 1,
          credits_used:       1,
          status:             "ok",
        } as never).then(
          () => undefined,
          (err: unknown) => console.warn("[AuditX] ai_usage insert failed (table may not exist yet):", err),
        );

        const audit = async (action: string, entityId: string, payload: Record<string, unknown>) => {
          const encoded = new TextEncoder().encode(`${Date.now()}-${action}-${entityId}-${authData.user.id}`);
          const digest = await crypto.subtle.digest("SHA-256", encoded);
          const hash = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
          const { error } = await supabase.from("audit_log").insert({
            org_id: thread.org_id,
            actor: authData.user.email ?? authData.user.id,
            action,
            entity_type: "transaction",
            entity_id: entityId,
            payload: payload as never,
            prev_hash: "",
            hash,
          });
          if (error) console.error("[AuditX] Audit log failed", error);
        };

        const tools = {
          plan_task: tool({
            description:
              "Understand the objective and publish the work plan before doing anything else. Call this first on every non-trivial request. Also use it to surface a public progress stage.",
            inputSchema: z.object({
              objective: z.string(),
              steps: z.array(z.string()),
              agents_needed: z.array(z.string()),
              public_stage: z
                .enum([
                  "Understanding your task",
                  "Extracting financial data",
                  "Running reconciliation",
                  "Verifying evidence",
                  "Checking calculations",
                  "Preparing findings",
                ])
                .nullable(),
            }),
            execute: async (input) => ({ ...input, accepted: true }),
          }),
          delegate_agent: tool({
            description:
              "Delegate a focused sub-task to a specialist agent (extraction, analysis, reconciliation, compliance, evidence, research, quality). Pass all data the specialist needs inside `context` — specialists cannot see the conversation.",
            inputSchema: z.object({
              agent: z.enum([
                "extraction",
                "analysis",
                "reconciliation",
                "compliance",
                "evidence",
                "research",
                "calculation",
                "quality",
              ]),
              objective: z.string(),
              context: z.string(),
            }),
            execute: async ({ agent, objective, context }) => {
              const sub = streamText({
                model,
                providerOptions: AI_PROVIDER_OPTIONS as never,
                system: `${SPECIALISTS[agent]}\n\nReturn compact markdown (under 400 words): findings, figures, evidence references, and a confidence rating (high/medium/low). Never expose hidden reasoning.`,
                prompt: `Objective:\n${objective}\n\nData and context:\n${context.slice(0, 40000)}`,
              });
              const findings = await sub.text;
              return { agent, findings, model_used: resolved.modelId };
            },
          }),
          calculate: tool({
            description:
              "Perform exact arithmetic. Use this for every financial number instead of computing mentally.",
            inputSchema: z.object({
              items: z.array(z.object({ label: z.string(), expression: z.string() })),
            }),
            execute: async ({ items }) =>
              items.map((item) => {
                try {
                  return { label: item.label, expression: item.expression, value: evaluateExpression(item.expression) };
                } catch (cause) {
                  return {
                    label: item.label,
                    expression: item.expression,
                    error: cause instanceof Error ? cause.message : "Invalid expression",
                  };
                }
              }),
          }),
          get_transactions: tool({
            description: "Read the signed-in user's real transaction ledger before answering questions about trades, holdings, fees, or tax.",
            inputSchema: z.object({ ticker: z.string().nullable(), action: z.string().nullable(), limit: z.number().nullable() }),
            execute: async ({ ticker, action, limit }) => {
              let query = supabase.from("transactions").select("id,ticker,action,quantity,price,fees,wht,trade_date,ref_id,broker,exchange,status").eq("org_id", thread.org_id).order("trade_date", { ascending: false }).limit(Math.min(Math.max(limit ?? 30, 1), 100));
              if (ticker) query = query.eq("ticker", ticker.toUpperCase());
              if (action) query = query.eq("action", action.toUpperCase() as "BUY" | "SELL" | "DIV");
              const { data, error } = await query;
              if (error) throw new Error(error.message);
              return data;
            },
          }),
          get_ledger_summary: tool({
            description: "Read a compact real-data summary of the user's ledger and open reconciliation flags.",
            inputSchema: z.object({}),
            execute: async () => {
              const [transactions, flags] = await Promise.all([
                supabase.from("transactions").select("id,ticker,status").eq("org_id", thread.org_id),
                supabase.from("reconciliation_flags").select("id,severity").eq("org_id", thread.org_id).eq("status", "open"),
              ]);
              if (transactions.error) throw new Error(transactions.error.message);
              if (flags.error) throw new Error(flags.error.message);
              return { totalTransactions: transactions.data.length, needsReview: transactions.data.filter((row) => row.status === "needs_review").length, openFlags: flags.data.length, tickers: [...new Set(transactions.data.map((row) => row.ticker))] };
            },
          }),
          get_open_flags: tool({
            description: "Read the open reconciliation flags with full detail so findings can cite them as evidence.",
            inputSchema: z.object({}),
            execute: async () => {
              const { data, error } = await supabase
                .from("reconciliation_flags")
                .select("id,flag_type,severity,ticker,ref_id,expected,actual,description,suggested_resolution,status")
                .eq("org_id", thread.org_id)
                .eq("status", "open");
              if (error) throw new Error(error.message);
              return data;
            },
          }),
          insert_transaction: tool({
            description: "Create a transaction in the real ledger. Runs immediately and is audited.",
            inputSchema: z.object({ ticker: z.string(), action: z.string(), quantity: z.number(), price: z.number(), fees: z.number().nullable(), wht: z.number().nullable(), trade_date: z.string(), ref_id: z.string().nullable(), broker: z.string().nullable(), exchange: z.string().nullable() }),
            execute: async (input) => {
              const action = input.action.toUpperCase();
              if (!(["BUY", "SELL", "DIV"] as string[]).includes(action)) throw new Error("Action must be BUY, SELL, or DIV");
              if (monthlyTxLimit !== null) {
                const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
                const { count } = await supabase.from("transactions").select("id", { count: "exact", head: true }).eq("org_id", thread.org_id).gte("created_at", monthStart);
                if ((count ?? 0) >= monthlyTxLimit) throw new Error(`Your ${plan} plan allows ${monthlyTxLimit} transactions per month. Upgrade to Pro on the Billing page to add more.`);
              }
              if (input.quantity <= 0 || input.price <= 0) throw new Error("Quantity and price must be positive");
              const payload = { org_id: thread.org_id, ticker: input.ticker.toUpperCase(), action: action as "BUY" | "SELL" | "DIV", quantity: input.quantity, price: input.price, fees: input.fees ?? 0, wht: input.wht ?? 0, trade_date: input.trade_date, ref_id: input.ref_id ?? `AI-${Date.now()}`, broker: input.broker ?? "", exchange: input.exchange ?? "PSX", confidence_score: 0.95, status: "posted" as const, source: { via: "auditx_agent", thread_id: thread.id } };
              const { data, error } = await supabase.from("transactions").insert(payload).select().single();
              if (error) throw new Error(error.message);
              await audit("ai_insert_transaction", data.id, payload);
              return data;
            },
          }),
          update_transaction: tool({
            description: "Edit a real ledger transaction after the user reviews the proposed fields.",
            inputSchema: z.object({ id: z.string(), ticker: z.string().nullable(), action: z.string().nullable(), quantity: z.number().nullable(), price: z.number().nullable(), fees: z.number().nullable(), wht: z.number().nullable(), trade_date: z.string().nullable(), ref_id: z.string().nullable(), broker: z.string().nullable(), exchange: z.string().nullable(), status: z.string().nullable() }),
            execute: async ({ id, ...input }) => {
              const updates = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== null));
              if (typeof updates["ticker"] === "string") updates["ticker"] = updates["ticker"].toUpperCase();
              if (typeof updates["action"] === "string") updates["action"] = updates["action"].toUpperCase();
              const { data, error } = await supabase.from("transactions").update(updates as never).eq("id", id).eq("org_id", thread.org_id).select().single();
              if (error) throw new Error(error.message);
              await audit("ai_update_transaction", id, updates);
              return data;
            },
          }),
          delete_transaction: tool({
            description: "Delete a ledger transaction. Requires explicit user approval.",
            inputSchema: z.object({ id: z.string() }),
            execute: async ({ id }) => {
              const { error } = await supabase.from("transactions").delete().eq("id", id).eq("org_id", thread.org_id);
              if (error) throw new Error(error.message);
              await audit("ai_delete_transaction", id, {});
              return { id, deleted: true };
            },
          }),
          flag_anomaly: tool({
            description: "Record a real reconciliation anomaly after the user approves it.",
            inputSchema: z.object({ flag_type: z.string(), severity: z.string().nullable(), ticker: z.string(), ref_id: z.string().nullable(), expected: z.number().nullable(), actual: z.number().nullable(), description: z.string(), suggested_resolution: z.string().nullable() }),
            execute: async (input) => {
              const { data, error } = await supabase.from("reconciliation_flags").insert({ org_id: thread.org_id, flag_type: input.flag_type, severity: (input.severity ?? "warn") as "ok" | "warn" | "bad", ticker: input.ticker.toUpperCase(), ref_id: input.ref_id ?? "", expected: input.expected ?? 0, actual: input.actual ?? 0, description: input.description, suggested_resolution: input.suggested_resolution ?? "", status: "open" }).select().single();
              if (error) throw new Error(error.message);
              return data;
            },
          }),
          resolve_flag: tool({
            description: "Mark a reconciliation flag as resolved after the user approves it.",
            inputSchema: z.object({ flag_id: z.string() }),
            execute: async ({ flag_id }) => {
              const { error } = await supabase
                .from("reconciliation_flags")
                .update({ status: "resolved" })
                .eq("id", flag_id)
                .eq("org_id", thread.org_id);
              if (error) throw new Error(error.message);
              return { id: flag_id, status: "resolved" };
            },
          }),
          report_progress: tool({
            description:
              "Publish a short public progress update for the user. Call this as work moves between stages. Never include hidden reasoning.",
            inputSchema: z.object({
              stage: z.enum([
                "Understanding your task",
                "Extracting financial data",
                "Running reconciliation",
                "Verifying evidence",
                "Checking calculations",
                "Preparing findings",
              ]),
              detail: z.string().nullable(),
            }),
            execute: async (input) => input,
          }),
          get_unfinished_records: tool({
            description:
              "Read incomplete or needs-review ledger rows so they can be completed, posted, or exported. Use this whenever the user asks to update unfinished records.",
            inputSchema: z.object({}),
            execute: async () => {
              const { data, error } = await supabase
                .from("transactions")
                .select(
                  "id,ticker,action,quantity,price,fees,wht,trade_date,ref_id,broker,exchange,status,confidence_score",
                )
                .eq("org_id", thread.org_id)
                .order("trade_date", { ascending: false })
                .limit(200);
              if (error) throw new Error(error.message);
              const unfinished = (data ?? []).filter((row) => {
                const gaps = missingFields(row);
                return row.status === "needs_review" || row.confidence_score < 0.75 || gaps.length > 0;
              });
              return unfinished.map((row) => ({
                ...row,
                missing_fields: missingFields(row),
                can_post: missingFields(row).length === 0,
              }));
            },
          }),
          propose_unfinished_fixes: tool({
            description:
              "Propose conservative completions for unfinished records using only existing ledger values. Does not write. Follow with update_transaction for each change the user should approve.",
            inputSchema: z.object({}),
            execute: async () => {
              const { data, error } = await supabase
                .from("transactions")
                .select(
                  "id,ticker,action,quantity,price,fees,wht,trade_date,ref_id,broker,exchange,status,confidence_score",
                )
                .eq("org_id", thread.org_id)
                .limit(200);
              if (error) throw new Error(error.message);
              return (data ?? [])
                .filter((row) => row.status === "needs_review" || missingFields(row).length > 0)
                .map((row) => {
                  const missing = missingFields(row);
                  const proposed: Record<string, unknown> = { id: row.id };
                  if (row.fees == null) proposed["fees"] = 0;
                  if (row.wht == null) proposed["wht"] = 0;
                  if (!row.exchange) proposed["exchange"] = "PSX";
                  if (missing.length === 0) proposed["status"] = "posted";
                  return {
                    id: row.id,
                    ticker: row.ticker,
                    missing_fields: missing,
                    proposed_updates: proposed,
                    assumption:
                      missing.length === 0
                        ? "Required fields are present; posting is a status change only."
                        : "Required fields are still missing — do not invent values. Export a spreadsheet for the user to complete.",
                    ready_to_post: missing.length === 0,
                  };
                });
            },
          }),
          get_tax_computation: tool({
            description: "Run the deterministic FIFO CGT engine on the user's real ledger. Never invent tax numbers.",
            inputSchema: z.object({
              jurisdiction: z.enum(["PSX", "NSE"]).nullable(),
              tax_year: z.string().nullable(),
            }),
            execute: async ({ jurisdiction, tax_year }) => {
              const { data, error } = await supabase
                .from("transactions")
                .select(
                  "id,ticker,action,quantity,price,fees,wht,trade_date,ref_id,confidence_score,status,broker,exchange",
                )
                .eq("org_id", thread.org_id);
              if (error) throw new Error(error.message);
              const txs = (data ?? []).map(asTransaction);
              const year = tax_year || String(new Date().getFullYear());
              const market = jurisdiction ?? (txs.find((t) => t.exchange === "NSE") ? "NSE" : "PSX");
              const tax = computeTax(txs, { jurisdiction: market, filerStatus: "Filer", taxYear: year });
              return {
                source: "DETERMINISTIC_FIFO",
                jurisdiction: market,
                taxYear: year,
                shortTermGain: tax.shortTermGain,
                longTermGain: tax.longTermGain,
                estimatedTaxDue: tax.estimatedTaxDue,
                dividendWHT: tax.dividendWHT,
                lots: tax.lots.slice(0, 40),
              };
            },
          }),
          get_portfolio_analysis: tool({
            description: "Compute a deterministic portfolio summary from the ledger (cost-basis proxy, not live prices).",
            inputSchema: z.object({ jurisdiction: z.enum(["PSX", "NSE"]).nullable() }),
            execute: async ({ jurisdiction }) => {
              const { data, error } = await supabase
                .from("transactions")
                .select(
                  "id,ticker,action,quantity,price,fees,wht,trade_date,ref_id,confidence_score,status,broker,exchange",
                )
                .eq("org_id", thread.org_id);
              if (error) throw new Error(error.message);
              const txs = (data ?? []).map(asTransaction);
              const market = jurisdiction ?? (txs.find((t) => t.exchange === "NSE") ? "NSE" : "PSX");
              return computePortfolioSummary(txs, market, String(new Date().getFullYear()));
            },
          }),
          prepare_spreadsheet: tool({
            description:
              "Build a downloadable CSV. Use kind=unfinished for rows that still need work, kind=ledger for the full book, kind=template for a blank sheet to add new records, or kind=custom with explicit rows.",
            inputSchema: z.object({
              kind: z.enum(["unfinished", "ledger", "template", "custom"]),
              filename: z.string().nullable(),
              headers: z.array(z.string()).nullable(),
              rows: z.array(z.array(z.string())).nullable(),
            }),
            execute: async ({ kind, filename, headers, rows }) => {
              const stamp = new Date().toISOString().slice(0, 10);
              if (kind === "template") {
                const cols = headers?.length ? headers : [...LEDGER_TEMPLATE_COLUMNS];
                return {
                  filename: filename || `auditx-new-records-${stamp}.csv`,
                  csv: toCsv(cols, [cols.map(() => "")]),
                  kind,
                  note: "Blank template for new transactions. Required columns: ticker, action, quantity, price, trade_date.",
                };
              }
              if (kind === "custom") {
                const cols = headers?.length ? headers : [...LEDGER_TEMPLATE_COLUMNS];
                return {
                  filename: filename || `auditx-export-${stamp}.csv`,
                  csv: toCsv(cols, rows ?? []),
                  kind,
                };
              }
              const { data, error } = await supabase
                .from("transactions")
                .select(
                  "id,ticker,action,quantity,price,fees,wht,trade_date,ref_id,broker,exchange,status,confidence_score",
                )
                .eq("org_id", thread.org_id)
                .order("trade_date", { ascending: false });
              if (error) throw new Error(error.message);
              const selected =
                kind === "unfinished"
                  ? (data ?? []).filter(
                      (row) => row.status === "needs_review" || missingFields(row).length > 0 || row.confidence_score < 0.75,
                    )
                  : (data ?? []);
              const cols = [...LEDGER_TEMPLATE_COLUMNS, "status", "confidence_score", "id"];
              const csvRows = selected.map((row) => [
                row.ticker,
                row.action,
                row.quantity,
                row.price,
                row.fees,
                row.wht,
                row.trade_date,
                row.ref_id,
                row.broker,
                row.exchange,
                row.status,
                row.confidence_score,
                row.id,
              ]);
              return {
                filename:
                  filename ||
                  (kind === "unfinished" ? `auditx-unfinished-${stamp}.csv` : `auditx-ledger-${stamp}.csv`),
                csv: toCsv(cols, csvRows),
                kind,
                row_count: csvRows.length,
              };
            },
          }),
          // ── create_notification: agent can push a real in-app notification ──
          create_notification: tool({
            description: "Send a persistent in-app notification to the user. Use after completing a significant task, finding anomalies, or needing to alert the user. Always include a meaningful title and message.",
            inputSchema: z.object({
              type: z.string().describe("Notification type: task_complete | approval_required | anomaly | error | info"),
              title: z.string().describe("Short title, max 60 chars"),
              message: z.string().describe("Full message body, 1-2 sentences"),
              severity: z.enum(["info", "success", "warning", "error"]).default("info"),
              link: z.string().nullable().describe("Optional app route to link to, e.g. /app/ledger"),
            }),
            execute: async ({ type, title, message, severity, link }) => {
              await supabase.from("notifications").insert({
                org_id: thread.org_id,
                user_id: authData.user.id,
                type,
                title,
                message,
                severity,
                link: link ?? null,
              });
              return { sent: true, title, type };
            },
          }),
          get_account_overview: tool({
            description: "Read the user's profile, organisation, plan/billing status, tax profile and record counts.",
            inputSchema: z.object({}),
            execute: async () => {
              const [prof, org, tax, txCount, flagCount, brokers] = await Promise.all([
                supabase.from("profiles").select("*").eq("user_id", authData.user.id).maybeSingle(),
                supabase.from("organizations").select("*").eq("id", thread.org_id).maybeSingle(),
                supabase.from("tax_profiles").select("*").eq("org_id", thread.org_id).maybeSingle(),
                supabase.from("transactions").select("id", { count: "exact", head: true }).eq("org_id", thread.org_id),
                supabase.from("reconciliation_flags").select("id", { count: "exact", head: true }).eq("org_id", thread.org_id).eq("status", "open"),
                supabase.from("broker_accounts").select("id", { count: "exact", head: true }).eq("org_id", thread.org_id),
              ]);
              return {
                email: authData.user.email,
                profile: prof.data,
                organisation: org.data,
                tax_profile: tax.data,
                plan,
                monthly_transaction_limit: monthlyTxLimit,
                transactions: txCount.count ?? 0,
                open_flags: flagCount.count ?? 0,
                broker_accounts: brokers.count ?? 0,
              };
            },
          }),
          read_google_sheet: tool({
            description: "Read a Google Sheet from a link (sheet must be shared as 'Anyone with the link'). Returns CSV text.",
            inputSchema: z.object({ url: z.string() }),
            execute: async ({ url }) => {
              const m = url.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
              if (!m) throw new Error("That isn't a Google Sheets link.");
              const gid = url.match(/[#&?]gid=(\d+)/)?.[1] ?? "0";
              const res = await fetch(`https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv&gid=${gid}`, { redirect: "follow" });
              if (!res.ok || !(res.headers.get("content-type") ?? "").includes("csv")) {
                throw new Error("Couldn't open the sheet. In Google Sheets choose Share → 'Anyone with the link' and try again.");
              }
              const csv = await res.text();
              return { csv: csv.slice(0, 60000), truncated: csv.length > 60000 };
            },
          }),
          // ── get_broker_accounts: read broker accounts ─────────────────────
          get_broker_accounts: tool({
            description: "Read the user's connected broker accounts.",
            inputSchema: z.object({}),
            execute: async () => {
              const { data, error } = await supabase
                .from("broker_accounts")
                .select("id,name,broker_name,currency,exchange,external_ref,created_at")
                .eq("org_id", thread.org_id)
                .order("created_at", { ascending: false });
              if (error) throw new Error(error.message);
              return data ?? [];
            },
          }),
        };

        const uiMessages = body.messages as UIMessage[];
        const lastUser = [...uiMessages].reverse().find((m) => m.role === "user");
        const latestText = (lastUser?.parts ?? []).map((p) => (p.type === "text" ? p.text : "")).join(" ");
        const title = text(latestText).slice(0, 64) || "Document audit";
        // Spreadsheets/text files can't go to the model as files — turn them into text tables.
        const modelMessages = await convertToModelMessages(await spreadsheetsToText(uiMessages));

        // Sanitize messages to remove reasoning_content which Groq doesn't support
        const cleanedMessages = modelMessages.map((message) => {
          if (message.role !== "assistant") {
            return message;
          }

          return {
            ...message,
            content: Array.isArray(message.content)
              ? message.content.filter((part) => part.type !== "reasoning")
              : message.content,
          };
        });

        // tries the next free model whenever a provider/quota error is thrown
        // during the initial connection (before any bytes are streamed).

        const modelCascade = resolved.cascade;

        const SYSTEM_PROMPT = `You are AuditX, a fast, precise financial audit agent for PSX and NSE traders. You are connected to the user's real ledger, portfolio, profile, account, broker accounts, tax figures and reconciliation flags.

━━ SPEED AND EFFICIENCY (most important) ━━
- Answer greetings, definitions and general questions directly with NO tools.
- Use the fewest tools possible. Call independent read tools together in one step. Never call the same tool twice with the same input.
- Only use delegate_agent for large multi-document audits that truly need a specialist. Never delegate simple questions.
- Keep answers concise. Use the structured report sections only for real audits/analysis; otherwise answer in a few short paragraphs or a table.
- Always finish with a complete written answer.

━━ DATA ━━
- Account/profile/plan/organisation → get_account_overview
- Ledger rows → get_transactions; totals → get_ledger_summary; holdings/portfolio → get_portfolio_analysis
- Tax → get_tax_computation; issues → get_open_flags; incomplete rows → get_unfinished_records; brokers → get_broker_accounts
- Google Sheets link in the message → read_google_sheet, then analyse or import the rows
- Uploaded Excel/CSV files arrive as text tables in the message — read them directly.
- Use calculate for material numbers. Never guess ledger contents.

━━ ACTING ━━
- Act directly. Do NOT ask "should I proceed?" — when the user asks to add, import, update, flag or resolve, just do it and report what changed.
- insert_transaction, update_transaction, flag_anomaly and resolve_flag run immediately and are recorded in the audit trail.
- Only delete_transaction asks the user to confirm (the app shows the button). Never ask for confirmation in text.
- Never invent missing ticker, quantity, price or date — say which fields are missing.
- Spreadsheet exports: prepare_spreadsheet (downloads a CSV that opens in Excel and Google Sheets).

━━ AUDIT REPORT FORMAT (only for real analysis) ━━
## Summary / ## Key Findings / ## Discrepancies / ## Recommended Actions / ## Confidence Level
Mark figures as verified (with source) or assumption. Use markdown tables. Never reveal hidden reasoning.`;

        const STREAM_OPTS = {
          system: SYSTEM_PROMPT,
          messages: cleanedMessages,
          tools,
          // Only destructive deletes need a confirmation; everything else is audited.
          toolApproval: {
            delete_transaction: "user-approval" as const,
          },
          experimental_toolApprovalSecret: approvalSecret,
          stopWhen: stepCountIs(50),
          // After the plan's tool budget, tools switch off so the model must
          // write its final answer instead of stopping mid-way.
          prepareStep: ({ stepNumber }: { stepNumber: number }) =>
            stepNumber >= maxSteps ? { toolChoice: "none" as const } : {},
          providerOptions: AI_PROVIDER_OPTIONS as never,
        };

        // No abortSignal: the answer finishes and is saved even if the
        // browser connection drops mid-response.
        const result = streamText({ model, ...STREAM_OPTS });
        void result.consumeStream();
        return result.toUIMessageStreamResponse({
          sendReasoning: true,
          originalMessages: uiMessages,
          onError: (e) => {
            console.error("[AuditX] AI stream error", e);
            const st = (e as { statusCode?: number })?.statusCode;
            if (st === 402) return "AI credits are used up. Add credits in your workspace settings to continue.";
            if (st === 429) return "AuditX AI is busy right now. Please try again in a moment.";
            return "AuditX AI hit an error. Your data was not changed — please try again.";
          },
          onFinish: async ({ messages }) => {
            // Deduplicate by ai_message_id — keep the last occurrence of each
            // (the full message array re-sends history on every turn, so the
            // same id can appear twice and cause a Postgres 21000 conflict).
            const seen = new Map<string, typeof messages[number] & { position: number }>();
            messages.forEach((message, index) => {
              seen.set(message.id, { ...message, position: index });
            });
            const deduped = Array.from(seen.values());

            const { error: messageError } = await supabase.from("chat_messages").upsert(
              deduped.map((message) => ({
                thread_id:    thread.id,
                org_id:       thread.org_id,
                user_id:      authData.user.id,
                ai_message_id: message.id,
                role:         message.role,
                parts:        message.parts as never,
                position:     message.position,
              })),
              { onConflict: "thread_id,ai_message_id" },
            );
            if (messageError) console.error("[AuditX] Message persistence failed", messageError);
            const { error: updateError } = await supabase.from("chat_threads").update({ title, updated_at: new Date().toISOString() }).eq("id", thread.id).eq("user_id", authData.user.id);
            if (updateError) console.error("[AuditX] Thread update failed", updateError);
          },
        });
      },
    }) as never,
  },
});
