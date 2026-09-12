import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, generateText, stepCountIs, streamText, tool, type UIMessage } from "ai";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/lib/database.types";
import {
  resolveAgentModel,
  getModelCascade,
  isQuotaError,
  FREE_MODELS,
} from "@/lib/audit-agent.server";
import { computeTax } from "@/lib/tax";
import { computePortfolioSummary } from "@/lib/financial-intelligence";
import type { Transaction } from "@/lib/demo-data";

type ChatBody = { id?: unknown; messages?: unknown };

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

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

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      // ── DELETE /api/chat?threadId=xxx — clear a chat thread ──────────────
      DELETE: async ({ request }) => {
        const authorization = request.headers.get("authorization") ?? "";
        if (!authorization.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });

        const url2 = new URL(request.url);
        const threadId = url2.searchParams.get("threadId");
        if (!threadId) return new Response("threadId is required", { status: 400 });

        const supabaseUrl = process.env["SUPABASE_URL"] ?? (import.meta.env["VITE_SUPABASE_URL"] as string | undefined);
        const supabaseKey = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? (import.meta.env["VITE_SUPABASE_ANON_KEY"] as string | undefined);
        if (!supabaseUrl || !supabaseKey) return new Response("Database configuration is missing", { status: 500 });

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
          (import.meta.env["VITE_SUPABASE_ANON_KEY"] as string | undefined);
        const approvalSecret = process.env["TOOL_APPROVAL_SECRET"] ?? "auditx-tool-approval";
        if (!url || !key) return new Response("Database configuration is missing", { status: 500 });

        const resolved = await resolveAgentModel();
        if (!resolved) {
          return new Response(
            JSON.stringify({ code: "ai_not_configured", message: "AI is not configured — add OPENROUTER_API_KEY to your environment variables." }),
            { status: 500, headers: { "Content-Type": "application/json" } },
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

        // ── Quota check ───────────────────────────────────────────────────────
        const DAILY_LIMITS: Record<string, number> = { free: 20, pro: 100, enterprise: 500 };

        const { data: subData } = await supabase
          .from("subscriptions")
          .select("plan")
          .eq("org_id", thread.org_id)
          .maybeSingle();
        const plan = (subData?.plan as string | undefined) ?? "free";
        const dailyLimit = DAILY_LIMITS[plan] ?? DAILY_LIMITS["free"]!;

        const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: usageRows } = await supabase
          .from("ai_usage")
          .select("credits_used")
          .eq("user_id", authData.user.id)
          .eq("status", "ok")
          .gte("created_at", since24h);

        const creditsUsedToday = (usageRows ?? []).reduce((s, r) => s + (r.credits_used ?? 0), 0);

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

        // Track this request (record created before streaming; update on finish)
        const usageId = crypto.randomUUID();
        await supabase.from("ai_usage").insert({
          id:                 usageId,
          user_id:            authData.user.id,
          org_id:             thread.org_id,
          plan,
          thread_id:          thread.id,
          model:              resolved.modelId,
          inference_requests: 1,
          credits_used:       1,
          status:             "ok",
        } as never);

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
              // Use model cascade for specialist sub-tasks: try each free model
              // in order until one succeeds, to maximise free-tier availability.
              const openRouterKey = process.env["OPENROUTER_API_KEY"] ?? "";
              const cascade = openRouterKey ? getModelCascade(openRouterKey) : [{ id: FREE_MODELS[0], model }];
              let lastError: unknown;
              for (const { id: modelId, model: cascadeModel } of cascade) {
                try {
                  const { text: findings } = await generateText({
                    model: cascadeModel,
                    system: `${SPECIALISTS[agent]}\n\nReturn compact markdown: findings, figures, evidence references, and a confidence rating (high/medium/low). Never expose hidden reasoning.`,
                    prompt: `Objective:\n${objective}\n\nData and context:\n${context.slice(0, 40000)}`,
                  });
                  return { agent, findings, model_used: modelId };
                } catch (e) {
                  lastError = e;
                  if (!isQuotaError(e)) throw e; // non-quota errors should bubble up
                  console.warn(`[AuditX delegate_agent] Quota on ${modelId}, trying next…`);
                }
              }
              throw lastError ?? new Error("All free models quota-exhausted for specialist task.");
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
            description: "Create a transaction in the real ledger. Always present this action for user approval before execution.",
            inputSchema: z.object({ ticker: z.string(), action: z.string(), quantity: z.number(), price: z.number(), fees: z.number().nullable(), wht: z.number().nullable(), trade_date: z.string(), ref_id: z.string().nullable(), broker: z.string().nullable(), exchange: z.string().nullable() }),
            execute: async (input) => {
              const action = input.action.toUpperCase();
              if (!(["BUY", "SELL", "DIV"] as string[]).includes(action)) throw new Error("Action must be BUY, SELL, or DIV");
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
        const latestUser = [...uiMessages].reverse().find((message) => message.role === "user");
        const latestText = latestUser?.parts.filter((part) => part.type === "text").map((part) => part.text).join(" ") ?? "";
        const title = text(latestText).slice(0, 64) || "Document audit";

        const result = streamText({
          model,
          system: `You are AuditX, the Supervisor Orchestrator of an autonomous financial audit team serving PSX and NSE traders.

━━ HOW YOU WORK ━━
1. Read the full conversation, all uploaded documents, the real ledger, and unfinished records before making any decision. Follow-ups build on earlier turns — never ask the user to repeat information you already have.
2. For any non-trivial task, call plan_task first (with objective, steps, agents_needed, public_stage), then call report_progress as your work moves between stages.
   Public stages (use exactly these strings): "Understanding your task" | "Extracting financial data" | "Running reconciliation" | "Verifying evidence" | "Checking calculations" | "Preparing findings"
3. Delegate sub-tasks via delegate_agent only when genuinely needed:
   - extraction   → read documents, broker slips, invoices, spreadsheets
   - analysis     → portfolio performance, holdings, cost basis, cash flows
   - reconciliation → match transaction sets, compute deltas, list mismatches
   - compliance   → detect anomalies, duplicates, fee surcharges, WHT mismatches, policy risks
   - evidence     → trace every finding to a specific source row, document or reference
   - research     → relevant market, tax-rule or broker-format background (from supplied context only)
   - calculation  → recompute every material figure from explicit arithmetic; never estimate
   - quality      → re-check findings for errors, contradictions, unsupported claims before answering
4. Pass every piece of data a specialist needs inside its context field — specialists are stateless.
5. Use calculate for ALL material numbers (fees, tax, gains, deltas). Never compute mentally.
6. Use get_transactions / get_ledger_summary / get_open_flags / get_unfinished_records / get_tax_computation / get_portfolio_analysis for real data. Never guess ledger contents.

━━ UNFINISHED RECORDS WORKFLOW ━━
When the user asks to update/fix/complete unfinished records:
1. Call get_unfinished_records → present a clear summary table of what is incomplete.
2. Call propose_unfinished_fixes → identify which rows can be posted (all required fields present) vs. which still have missing data.
3. For ready rows: request update_transaction approval for each one.
4. For rows with missing required fields: do NOT invent ticker, quantity, price or date. Tell the user exactly which fields are missing and offer to export them.
5. After completing the update flow, call prepare_spreadsheet(kind="template") to give the user a blank template for new records, and prepare_spreadsheet(kind="unfinished") for any remaining incomplete rows.

━━ SPREADSHEET WORKFLOW ━━
When the user asks for a spreadsheet/CSV:
- kind="unfinished" → export rows still needing work
- kind="ledger"     → export full ledger
- kind="template"   → blank template for new entries
- kind="custom"     → custom headers + rows you supply
Always tell the user the file will download automatically.

━━ NOTIFICATIONS ━━
After completing a significant task (multi-step analysis, saving a report, detecting anomalies), call create_notification to alert the user with a clear title, message, severity and relevant link. Always notify on: task completion, approval required, anomalies found, errors encountered.

━━ WRITES REQUIRE APPROVAL ━━
insert_transaction, update_transaction, delete_transaction, flag_anomaly, resolve_flag all require explicit user approval. Propose clearly; never claim success until the tool result confirms it.

━━ QUALITY GATE ━━
Before the final answer on any task involving numbers, reconciliation or compliance, run a quality delegation to catch arithmetic errors, contradictions or unsupported claims. If quality returns REVISE, fix the issues before replying.

━━ FINAL ANSWER FORMAT ━━
Use only the sections that apply (skip empty ones):

## Summary
## Key Findings
## Evidence
## Discrepancies
## Risk Areas
## Recommended Actions
## Confidence Level

Rules for the final answer:
- Mark every figure as verified (source: field name, reference ID, or document) or clearly labelled as an assumption.
- Use markdown tables for financial figures.
- Never reveal hidden chain-of-thought or internal agent communications.
- Close with a one-line disclaimer that results are indicative and should be verified before filing.`,
          messages: await convertToModelMessages(uiMessages),
          tools,
          toolApproval: {
            insert_transaction: "user-approval",
            update_transaction: "user-approval",
            delete_transaction: "user-approval",
            flag_anomaly: "user-approval",
            resolve_flag: "user-approval",
          },
          experimental_toolApprovalSecret: approvalSecret,
          stopWhen: stepCountIs(50),
        });

        return result.toUIMessageStreamResponse({
          originalMessages: uiMessages,
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
    },
  },
});
