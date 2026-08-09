// ─── AuditX Agent Tool Layer ──────────────────────────────────────────────────
// Exposes Supabase read/write operations as callable tools for Gemini.
// Every write is confirmed by the user before execution.

import { supabase } from "./supabase";

// ── Tool result type ──────────────────────────────────────────────────────────

export interface ToolResult {
  ok:    boolean;
  data?: unknown;
  error?: string;
}

// ── Context needed for every tool call ───────────────────────────────────────

export interface ToolContext {
  orgId:        string;
  userId:       string;
  userEmail:    string;
  jurisdiction: string;
  invalidate:   (keys: string[][]) => void;
}

// ── Tool definitions (schema for Gemini function-calling) ─────────────────────

export const TOOL_DECLARATIONS = [
  {
    name: "get_transactions",
    description: "Read the user's transaction ledger. Use to answer questions about their trades, holdings, or history.",
    parameters: {
      type: "OBJECT",
      properties: {
        ticker: {
          type: "STRING",
          description: "Optional: filter by ticker symbol (e.g. OGDC, TCS)",
        },
        action: {
          type: "STRING",
          description: "Optional: filter by action — BUY, SELL, or DIV",
        },
        limit: {
          type: "NUMBER",
          description: "Max rows to return (default 20)",
        },
      },
    },
  },
  {
    name: "insert_transaction",
    description: "Add a new transaction to the user's ledger. Use after extracting fields from a document and confirming with the user.",
    parameters: {
      type: "OBJECT",
      required: ["ticker", "action", "quantity", "price", "trade_date"],
      properties: {
        ticker:     { type: "STRING", description: "Stock symbol e.g. OGDC" },
        action:     { type: "STRING", description: "BUY, SELL, or DIV" },
        quantity:   { type: "NUMBER", description: "Number of shares" },
        price:      { type: "NUMBER", description: "Price per share" },
        fees:       { type: "NUMBER", description: "Total brokerage fees" },
        wht:        { type: "NUMBER", description: "Withholding tax deducted" },
        trade_date: { type: "STRING", description: "Date in YYYY-MM-DD format" },
        ref_id:     { type: "STRING", description: "Broker reference ID" },
        broker:     { type: "STRING", description: "Broker name" },
        exchange:   { type: "STRING", description: "PSX or NSE" },
      },
    },
  },
  {
    name: "update_transaction",
    description: "Edit an existing transaction. Use when the user wants to correct a field.",
    parameters: {
      type: "OBJECT",
      required: ["id"],
      properties: {
        id:         { type: "STRING", description: "Transaction ID to update" },
        ticker:     { type: "STRING" },
        action:     { type: "STRING" },
        quantity:   { type: "NUMBER" },
        price:      { type: "NUMBER" },
        fees:       { type: "NUMBER" },
        wht:        { type: "NUMBER" },
        trade_date: { type: "STRING" },
        ref_id:     { type: "STRING" },
        broker:     { type: "STRING" },
        exchange:   { type: "STRING" },
        status:     { type: "STRING", description: "posted or needs_review" },
      },
    },
  },
  {
    name: "flag_anomaly",
    description: "Create a reconciliation flag for a suspicious or incorrect transaction.",
    parameters: {
      type: "OBJECT",
      required: ["flag_type", "ticker", "description"],
      properties: {
        flag_type:           { type: "STRING", description: "e.g. Fee Surcharge, WHT Mismatch, Duplicate Entry" },
        severity:            { type: "STRING", description: "ok, warn, or bad" },
        ticker:              { type: "STRING" },
        ref_id:              { type: "STRING" },
        expected:            { type: "NUMBER" },
        actual:              { type: "NUMBER" },
        description:         { type: "STRING" },
        suggested_resolution: { type: "STRING" },
      },
    },
  },
  {
    name: "resolve_flag",
    description: "Mark a reconciliation flag as resolved.",
    parameters: {
      type: "OBJECT",
      required: ["flag_id"],
      properties: {
        flag_id: { type: "STRING", description: "ID of the flag to resolve" },
      },
    },
  },
  {
    name: "get_ledger_summary",
    description: "Get a summary of the user's portfolio — total transactions, unreconciled items, tickers held.",
    parameters: {
      type: "OBJECT",
      properties: {},
    },
  },
] as const;

// ── Tool executor ─────────────────────────────────────────────────────────────

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  try {
    switch (name) {
      case "get_transactions": {
        let q = supabase
          .from("transactions")
          .select("id, ticker, action, quantity, price, fees, wht, trade_date, ref_id, broker, exchange, status, confidence_score")
          .eq("org_id", ctx.orgId)
          .order("trade_date", { ascending: false })
          .limit(typeof args.limit === "number" ? args.limit : 20);

        if (args.ticker) q = q.eq("ticker", String(args.ticker).toUpperCase());
        if (args.action)  q = q.eq("action",  String(args.action).toUpperCase());

        const { data, error } = await q;
        if (error) return { ok: false, error: error.message };
        return { ok: true, data };
      }

      case "insert_transaction": {
        const { data, error } = await supabase.from("transactions").insert({
          org_id:           ctx.orgId,
          ticker:           String(args.ticker ?? "").toUpperCase(),
          action:           String(args.action ?? "BUY").toUpperCase(),
          quantity:         Number(args.quantity ?? 0),
          price:            Number(args.price ?? 0),
          fees:             Number(args.fees ?? 0),
          wht:              Number(args.wht ?? 0),
          trade_date:       String(args.trade_date ?? ""),
          ref_id:           String(args.ref_id ?? `AUTO-${Date.now()}`),
          broker:           String(args.broker ?? ""),
          exchange:         String(args.exchange ?? ctx.jurisdiction),
          confidence_score: 0.95,
          status:           "posted",
          source:           { via: "ai_agent", actor: ctx.userEmail },
        }).select().single();

        if (error) return { ok: false, error: error.message };

        // Invalidate transactions cache
        ctx.invalidate([["transactions", ctx.orgId]]);

        // Write to audit log
        await writeAuditLog(ctx, "ai_insert_transaction", "transaction", data?.id ?? "", args);

        return { ok: true, data };
      }

      case "update_transaction": {
        const id = String(args.id);
        const updates: Record<string, unknown> = {};
        for (const key of ["ticker","action","quantity","price","fees","wht","trade_date","ref_id","broker","exchange","status"]) {
          if (args[key] !== undefined) updates[key] = args[key];
        }
        if (typeof updates.ticker === "string") updates.ticker = updates.ticker.toUpperCase();
        if (typeof updates.action === "string")  updates.action  = updates.action.toUpperCase();

        const { data, error } = await supabase
          .from("transactions")
          .update(updates)
          .eq("id", id)
          .eq("org_id", ctx.orgId)
          .select()
          .single();

        if (error) return { ok: false, error: error.message };

        ctx.invalidate([["transactions", ctx.orgId]]);
        await writeAuditLog(ctx, "ai_update_transaction", "transaction", id, updates);

        return { ok: true, data };
      }

      case "flag_anomaly": {
        const { data, error } = await supabase.from("reconciliation_flags").insert({
          org_id:               ctx.orgId,
          flag_type:            String(args.flag_type ?? "Unknown"),
          severity:             String(args.severity ?? "warn"),
          ticker:               String(args.ticker ?? ""),
          ref_id:               String(args.ref_id ?? ""),
          expected:             args.expected ?? 0,
          actual:               args.actual ?? 0,
          description:          String(args.description ?? ""),
          suggested_resolution: String(args.suggested_resolution ?? ""),
          status:               "open",
        }).select().single();

        if (error) return { ok: false, error: error.message };

        ctx.invalidate([["reconciliation_flags", ctx.orgId]]);
        await writeAuditLog(ctx, "ai_flag_anomaly", "reconciliation_flag", data?.id ?? "", args);

        return { ok: true, data };
      }

      case "resolve_flag": {
        const flagId = String(args.flag_id);
        const { error } = await supabase
          .from("reconciliation_flags")
          .update({ status: "resolved" })
          .eq("id", flagId)
          .eq("org_id", ctx.orgId);

        if (error) return { ok: false, error: error.message };

        ctx.invalidate([["reconciliation_flags", ctx.orgId]]);
        await writeAuditLog(ctx, "ai_resolve_flag", "reconciliation_flag", flagId, {});

        return { ok: true, data: { id: flagId } };
      }

      case "get_ledger_summary": {
        const [txRes, flagRes] = await Promise.all([
          supabase
            .from("transactions")
            .select("id, ticker, action, status")
            .eq("org_id", ctx.orgId),
          supabase
            .from("reconciliation_flags")
            .select("id, severity")
            .eq("org_id", ctx.orgId)
            .eq("status", "open"),
        ]);

        const txns = txRes.data ?? [];
        const flags = flagRes.data ?? [];
        const tickers = [...new Set(txns.map((t) => t.ticker))];
        const needsReview = txns.filter((t) => t.status === "needs_review").length;

        return {
          ok: true,
          data: {
            total_transactions: txns.length,
            unreconciled: needsReview,
            open_flags: flags.length,
            tickers_held: tickers,
          },
        };
      }

      default:
        return { ok: false, error: `Unknown tool: ${name}` };
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ── Audit log writer ──────────────────────────────────────────────────────────

async function writeAuditLog(
  ctx: ToolContext,
  action: string,
  entityType: string,
  entityId: string,
  payload: unknown,
) {
  // Simple hash: sha256 not available client-side without crypto, use timestamp-based
  const hashInput = `${Date.now()}-${action}-${entityId}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(hashInput);
  const hashBuf = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuf));
  const hash = "0x" + hashArray.slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");

  await supabase.from("audit_log").insert({
    org_id:      ctx.orgId,
    actor:       ctx.userEmail,
    action,
    entity_type: entityType,
    entity_id:   entityId,
    payload:     payload as Record<string, unknown>,
    prev_hash:   "",
    hash,
  }).throwOnError().then(() => {}).catch(() => {
    // Audit log failure is non-fatal — don't break the user's action
  });
}
