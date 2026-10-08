// ─── AuditX Agent Runner — Supabase Edge Function ────────────────────────────
// Deno runtime. Dequeues one job, runs it, handles retries and invariant checks.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { computeTax } from "../../src/lib/tax.ts";
import { suggestHarvesting } from "../../src/lib/tax.ts";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENROUTER_KEY   = Deno.env.get("OPENROUTER_API_KEY") ?? "";
const OPENROUTER_MODEL = Deno.env.get("OPENROUTER_MODEL") ?? "openai/gpt-4o-mini";

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── Extraction JSON schema for structured outputs ─────────────────────────────
const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    transaction_date: { type: ["string", "null"] },
    ticker:           { type: ["string", "null"] },
    action:           { type: ["string", "null"], enum: ["BUY", "SELL", "DIV", null] },
    quantity:         { type: ["number", "null"] },
    price:            { type: ["number", "null"] },
    fees:             { type: ["number", "null"] },
    wht:              { type: ["number", "null"] },
    ref_id:           { type: ["string", "null"] },
    broker:           { type: ["string", "null"] },
    exchange:         { type: ["string", "null"] },
    field_confidences: { type: "object" },
  },
  required: ["field_confidences"],
};

// ── Call OpenRouter with JSON schema enforcement ──────────────────────────────
async function callLLM(
  systemPrompt: string,
  userContent:  string,
  schema?:      Record<string, unknown>,
): Promise<unknown> {
  if (!OPENROUTER_KEY) throw new Error("OPENROUTER_API_KEY not set");

  const body: Record<string, unknown> = {
    model:       OPENROUTER_MODEL,
    messages:    [
      { role: "system", content: systemPrompt },
      { role: "user",   content: userContent  },
    ],
    temperature: 0.1,
    max_tokens:  1024,
  };

  if (schema) {
    body["response_format"] = {
      type:        "json_schema",
      json_schema: { name: "extraction", strict: true, schema },
    };
  }

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method:  "POST",
    headers: {
      Authorization:  `Bearer ${OPENROUTER_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://auditx.app",
      "X-Title":      "AuditX",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => res.statusText);
    throw new Error(`OpenRouter ${res.status}: ${txt}`);
  }

  const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  const raw  = data.choices?.[0]?.message?.content ?? "{}";

  try { return JSON.parse(raw); }
  catch { return raw; }
}

// ── Deterministic CSV row extractor (no LLM) ──────────────────────────────────
function extractCSVRows(csv: string): Array<Record<string, string>> {
  const lines   = csv.trim().split("\n").filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0]!.split(",").map((h) => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_"));
  return lines.slice(1).map((line) => {
    const vals = line.split(",").map((v) => v.trim());
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? ""]));
  });
}

// ── Invariant checks (plain code) ─────────────────────────────────────────────
async function checkInvariants(orgId: string, runId: string): Promise<string[]> {
  const failures: string[] = [];

  const { data: txs } = await db
    .from("transactions")
    .select("id, ticker, action, quantity")
    .eq("org_id", orgId)
    .filter("source->>'agent_run_id'", "eq", runId);

  for (const tx of txs ?? []) {
    if (Number(tx.quantity) <= 0) failures.push(`quantity<=0 on ${tx.id}`);
  }

  // Inventory check
  const { data: all } = await db
    .from("transactions")
    .select("ticker, action, quantity")
    .eq("org_id", orgId)
    .order("trade_date");

  const inv: Record<string, number> = {};
  for (const tx of all ?? []) {
    inv[tx.ticker as string] = (inv[tx.ticker as string] ?? 0) +
      (tx.action === "BUY" ? Number(tx.quantity) : tx.action === "SELL" ? -Number(tx.quantity) : 0);
  }
  for (const [ticker, net] of Object.entries(inv)) {
    if (net < -0.0001) failures.push(`oversell: ${ticker} net=${net}`);
  }

  return failures;
}

// ── Loop-prevention: did the agent cause this source change? ──────────────────
async function wasAgentWrite(orgId: string, sourceHash: string): Promise<boolean> {
  // Check if any recently completed job for this org produced a transaction
  // whose source.agent_run_id is known — if the hash matches, skip.
  const { data: recent } = await db
    .from("agent_jobs")
    .select("run_id, result_summary")
    .eq("org_id", orgId)
    .eq("status", "done")
    .gte("updated_at", new Date(Date.now() - 5 * 60 * 1000).toISOString())
    .limit(10);

  for (const job of recent ?? []) {
    const summary = job.result_summary as Record<string, unknown> | null;
    if (summary?.["output_hash"] === sourceHash) return true;
  }
  return false;
}

// ── Post a notification ───────────────────────────────────────────────────────
async function notify(
  orgId:    string,
  type:     string,
  title:    string,
  message:  string,
  severity: "info" | "success" | "warning" | "error" = "info",
  link?:    string,
): Promise<void> {
  // Get first owner user_id for this org
  const { data: profile } = await db
    .from("profiles")
    .select("user_id")
    .eq("org_id", orgId)
    .eq("role", "owner")
    .maybeSingle();

  if (!profile) return;

  await db.from("notifications").insert({
    org_id:   orgId,
    user_id:  profile.user_id,
    type,
    title,
    message,
    severity,
    link:     link ?? null,
  } as never);
}

// ── Handle: nightly reconciliation ────────────────────────────────────────────
async function handleNightlyReconcile(orgId: string, runId: string): Promise<Record<string, unknown>> {
  const { data: txs } = await db
    .from("transactions")
    .select("id, ticker, action, quantity, price, fees, wht, trade_date, ref_id, broker, exchange, status")
    .eq("org_id", orgId)
    .order("trade_date");

  if (!txs?.length) return { processed: 0, flags: 0 };

  // Detect duplicates: same (ticker, trade_date, quantity, price, action)
  const seen = new Map<string, string>();
  let flagCount = 0;

  for (const tx of txs) {
    const key = `${tx.ticker}|${tx.trade_date}|${tx.quantity}|${tx.price}|${tx.action}`;
    if (seen.has(key)) {
      // Flag the duplicate
      const { error } = await db.from("reconciliation_flags").insert({
        org_id:               orgId,
        flag_type:            "Duplicate Entry",
        severity:             "warn",
        ticker:               tx.ticker,
        ref_id:               tx.ref_id ?? "",
        expected:             { ref_id: seen.get(key) } as never,
        actual:               { ref_id: tx.id } as never,
        description:          `Duplicate transaction detected: ${tx.ticker} ${tx.action} ${tx.quantity} @ ${tx.price} on ${tx.trade_date}`,
        suggested_resolution: "Review and remove one of the duplicate entries.",
        status:               "open",
      } as never);

      if (!error) flagCount++;
    } else {
      seen.set(key, tx.id);
    }
  }

  // Mark unreconciled rows that are missing key fields
  const missingRef = txs.filter((t) => !t.ref_id || t.ref_id === "");
  for (const tx of missingRef) {
    await db
      .from("transactions")
      .update({ status: "needs_review" } as never)
      .eq("id", tx.id);
  }

  await notify(
    orgId,
    "reconciliation_complete",
    "Nightly reconciliation done",
    `Processed ${txs.length} transactions, found ${flagCount} flag(s).`,
    flagCount > 0 ? "warning" : "success",
    "/app/reconciliation",
  );

  return { processed: txs.length, flags: flagCount };
}

// ── Handle: monthly tax run ───────────────────────────────────────────────────
async function handleMonthlyTaxRun(orgId: string): Promise<Record<string, unknown>> {
  const { data: txRows } = await db
    .from("transactions")
    .select("id,ticker,action,quantity,price,fees,wht,trade_date,ref_id,confidence_score,status,broker,exchange")
    .eq("org_id", orgId);

  const { data: org } = await db
    .from("organizations")
    .select("jurisdiction_default")
    .eq("id", orgId)
    .maybeSingle();

  const jurisdiction = (org?.jurisdiction_default ?? "PSX") as "PSX" | "NSE";
  const taxYear      = String(new Date().getFullYear());
  const txs          = (txRows ?? []).map((r) => ({
    id:               r.id,
    ticker:           r.ticker,
    action:           r.action as "BUY" | "SELL" | "DIV",
    quantity:         Number(r.quantity),
    price:            Number(r.price),
    fees:             Number(r.fees ?? 0),
    wht:              Number(r.wht ?? 0),
    trade_date:       r.trade_date,
    ref_id:           r.ref_id,
    confidence_score: Number(r.confidence_score ?? 1),
    status:           r.status as "posted" | "needs_review",
    broker:           r.broker,
    exchange:         (r.exchange === "NSE" ? "NSE" : "PSX") as "PSX" | "NSE",
  }));

  const tax = computeTax(txs, { jurisdiction, filerStatus: "Filer", taxYear });

  await db.from("tax_computations").insert({
    org_id:            orgId,
    tax_year:          taxYear,
    jurisdiction,
    filer_status:      "Filer",
    short_term_gain:   tax.shortTermGain,
    long_term_gain:    tax.longTermGain,
    dividend_wht:      tax.dividendWHT,
    estimated_tax_due: tax.estimatedTaxDue,
    breakdown:         { lots: tax.lots.slice(0, 50) } as never,
  } as never);

  // Harvesting suggestions
  const suggestions = suggestHarvesting(txs, tax.totalGain);
  for (const s of suggestions.slice(0, 10)) {
    await db.from("tax_loss_harvest_suggestions").insert({
      org_id:           orgId,
      position_ticker:  s.ticker,
      exchange:         s.exchange,
      unrealized_loss:  s.unrealizedLoss,
      potential_offset: s.potentialOffset,
      holding_days:     s.holdingDays,
      rationale:        s.rationale,
      status:           "pending",
    } as never).then(() => undefined, () => undefined);
  }

  await notify(
    orgId,
    "tax_run_complete",
    "Monthly tax computation complete",
    `Est. tax due: ${jurisdiction === "PSX" ? "PKR" : "INR"} ${tax.estimatedTaxDue.toLocaleString()}`,
    "info",
    "/app/tax",
  );

  return { tax_year: taxYear, estimated_tax_due: tax.estimatedTaxDue, lots: tax.lots.length };
}

// ── Handle: document/CSV ingestion ───────────────────────────────────────────
async function handleIngestion(
  orgId:   string,
  runId:   string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const csvContent = payload["csv"] as string | undefined;
  if (!csvContent) return { processed: 0 };

  const rows = extractCSVRows(csvContent);
  let inserted = 0;

  for (const row of rows) {
    const ticker     = (row["ticker"] ?? row["symbol"] ?? "").toUpperCase();
    const action     = ((row["action"] ?? row["type"] ?? "BUY") as string).toUpperCase() as "BUY" | "SELL" | "DIV";
    const quantity   = parseFloat(row["quantity"] ?? row["qty"] ?? "0");
    const price      = parseFloat(row["price"] ?? "0");
    const trade_date = row["date"] ?? row["trade_date"] ?? "";
    const ref_id     = row["ref_id"] ?? row["reference"] ?? `INGESTED-${Date.now()}`;
    const confidence = ticker && quantity > 0 && price > 0 && trade_date ? 0.92 : 0.6;

    if (!ticker || quantity <= 0 || price <= 0) continue;

    const { error } = await db.from("transactions").insert({
      org_id:          orgId,
      ticker,
      action,
      quantity,
      price,
      fees:            parseFloat(row["fees"] ?? row["commission"] ?? "0"),
      wht:             parseFloat(row["wht"] ?? row["tax"] ?? "0"),
      trade_date,
      ref_id,
      broker:          row["broker"] ?? "",
      exchange:        row["exchange"] ?? "PSX",
      confidence_score: confidence,
      status:          confidence >= 0.9 ? "posted" : "needs_review",
      source:          { via: "agent_ingestion", agent_run_id: runId } as never,
    } as never);

    if (!error) inserted++;
  }

  return { processed: rows.length, inserted };
}

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization,content-type" },
    });
  }

  try {
    // Dequeue one pending job
    const { data: job, error: dqErr } = await db.rpc("dequeue_agent_job", { p_worker_id: "edge-fn" });
    if (dqErr || !job) {
      return new Response(JSON.stringify({ message: "no jobs" }), { status: 200 });
    }

    const orgId   = job.org_id   as string;
    const jobId   = job.id       as string;
    const runId   = job.run_id   as string;
    const trigger = job.trigger_type as string;
    const payload = (job.trigger_payload ?? {}) as Record<string, unknown>;

    // Check feature flag (unless cron or system trigger)
    if (!["cron_nightly", "cron_monthly"].includes(trigger)) {
      const { data: flags } = await db
        .from("org_feature_flags")
        .select("autonomous_agent")
        .eq("org_id", orgId)
        .maybeSingle();

      if (!flags?.autonomous_agent) {
        await db.rpc("complete_agent_job", { p_job_id: jobId, p_status: "done", p_result: { skipped: "autonomous_agent_disabled" } });
        return new Response(JSON.stringify({ skipped: true }), { status: 200 });
      }
    }

    let result: Record<string, unknown> = {};

    switch (trigger) {
      case "cron_nightly":
        result = await handleNightlyReconcile(orgId, runId);
        break;
      case "cron_monthly":
        result = await handleMonthlyTaxRun(orgId);
        break;
      case "ingestion":
      case "upload":
      case "sheet_change":
        result = await handleIngestion(orgId, runId, payload);
        break;
      default:
        result = { message: `unhandled trigger: ${trigger}` };
    }

    // Invariant checks
    const failures = await checkInvariants(orgId, runId);
    if (failures.length > 0) {
      await db.rpc("revert_run", { p_run_id: runId });
      await db.rpc("complete_agent_job", {
        p_job_id: jobId,
        p_status: "failed_invariant",
        p_error:  failures.join("; "),
        p_result: { failures },
      });
      return new Response(JSON.stringify({ failed_invariant: true, failures }), { status: 200 });
    }

    await db.rpc("complete_agent_job", { p_job_id: jobId, p_status: "done", p_result: result });
    return new Response(JSON.stringify({ ok: true, result }), { status: 200 });

  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    console.error("[agent-runner]", msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
});
