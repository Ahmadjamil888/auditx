import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, generateText, stepCountIs, streamText, tool, type UIMessage } from "ai";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/lib/database.types";
import { resolveAgentModel } from "@/lib/audit-agent.server";

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
  quality:
    "You are the Quality Control Agent. Independently re-check the supplied findings for arithmetic errors, contradictions, unsupported claims and missing caveats. Return PASS or REVISE with a precise list of corrections.",
} as const;

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
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
        if (!resolved) return new Response("AI configuration is missing", { status: 500 });
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
              "Understand the objective and publish the work plan before doing anything else. Call this first on every non-trivial request.",
            inputSchema: z.object({
              objective: z.string(),
              steps: z.array(z.string()),
              agents_needed: z.array(z.string()),
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
                "quality",
              ]),
              objective: z.string(),
              context: z.string(),
            }),
            execute: async ({ agent, objective, context }) => {
              const { text: findings } = await generateText({
                model,
                system: `${SPECIALISTS[agent]}\n\nReturn compact markdown: findings, figures, evidence references, and a confidence rating (high/medium/low). Never expose hidden reasoning.`,
                prompt: `Objective:\n${objective}\n\nData and context:\n${context.slice(0, 40000)}`,
              });
              return { agent, findings };
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
        };

        const uiMessages = body.messages as UIMessage[];
        const latestUser = [...uiMessages].reverse().find((message) => message.role === "user");
        const latestText = latestUser?.parts.filter((part) => part.type === "text").map((part) => part.text).join(" ") ?? "";
        const title = text(latestText).slice(0, 64) || "Document audit";

        const result = streamText({
          model,
          system: `You are AuditX, the Supervisor Orchestrator of an autonomous financial audit team serving PSX and NSE traders.

How you work:
1. Read the whole conversation, the user's uploaded documents, and their real ledger before deciding anything. Follow-ups build on earlier turns — never ask the user to repeat context you already have.
2. Call plan_task first for any non-trivial objective, naming the specialists you will use.
3. Delegate only the sub-tasks that are actually needed, via delegate_agent: extraction (documents), analysis (performance), reconciliation (matching), compliance (anomalies and risk), evidence (tracing findings to sources), research (background), quality (final validation).
4. Give each specialist all data it needs inside `context`; specialists are stateless.
5. Use `calculate` for every material number. Use get_transactions / get_ledger_summary / get_open_flags for real data — never guess ledger contents.
6. If specialists disagree or a result looks uncertain, delegate again for verification before answering.
7. Before the final answer, run a quality delegation on your findings when the task involved numbers, reconciliation or compliance.

Writes: insert, update, delete and flag actions require explicit user approval. Propose them; never claim success until the tool result confirms it.

Final answer format (skip sections that do not apply):
## Summary
## Key Findings
## Evidence
## Discrepancies
## Risk Areas
## Recommended Actions
## Confidence Level

Mark every figure as verified (with its source) or as an assumption. Use markdown tables for figures. Keep progress narration short and public — never reveal hidden chain-of-thought.`,
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
            const { error: messageError } = await supabase.from("chat_messages").upsert(messages.map((message, index) => ({ thread_id: thread.id, org_id: thread.org_id, user_id: authData.user.id, ai_message_id: message.id, role: message.role, parts: message.parts as never, position: index })), { onConflict: "thread_id,ai_message_id" });
            if (messageError) console.error("[AuditX] Message persistence failed", messageError);
            const { error: updateError } = await supabase.from("chat_threads").update({ title, updated_at: new Date().toISOString() }).eq("id", thread.id).eq("user_id", authData.user.id);
            if (updateError) console.error("[AuditX] Thread update failed", updateError);
          },
        });
      },
    },
  },
});
