// ─── AuditX Invariant Checks ──────────────────────────────────────────────────
// Runs after every agent run. Pure TypeScript — no LLM involved.
// If any check fails the whole run must be rolled back.

import { supabase } from "./supabase";

export interface InvariantResult {
  passed:   boolean;
  failures: InvariantFailure[];
}

export interface InvariantFailure {
  check:      string;
  detail:     string;
  entity_id?: string;
}

// ── Run all invariants for an org after a run ─────────────────────────────────

export async function checkInvariants(
  orgId:  string,
  runId:  string,
): Promise<InvariantResult> {
  const failures: InvariantFailure[] = [];

  // Fetch transactions touched in this run
  const { data: txs, error: txErr } = await supabase
    .from("transactions")
    .select("id, ticker, action, quantity, price, trade_date, source")
    .eq("org_id", orgId)
    .filter("source->>'agent_run_id'", "eq", runId);

  if (txErr) {
    return { passed: false, failures: [{ check: "fetch", detail: txErr.message }] };
  }

  const rows = txs ?? [];

  // ── Check 1: no quantity ≤ 0 ──────────────────────────────────────────────
  for (const row of rows) {
    if (Number(row.quantity) <= 0) {
      failures.push({
        check:     "quantity_positive",
        detail:    `Transaction ${row.id} has quantity ${row.quantity} ≤ 0`,
        entity_id: row.id,
      });
    }
  }

  // ── Check 2: no SELL exceeds available buy inventory per ticker ───────────
  // Build net inventory from the full ledger (not just this run)
  const { data: allTxs } = await supabase
    .from("transactions")
    .select("id, ticker, action, quantity, trade_date")
    .eq("org_id", orgId)
    .order("trade_date", { ascending: true });

  const inventory: Record<string, number> = {};
  for (const tx of allTxs ?? []) {
    const ticker = tx.ticker as string;
    if (!inventory[ticker]) inventory[ticker] = 0;
    if (tx.action === "BUY")  inventory[ticker] += Number(tx.quantity);
    if (tx.action === "SELL") inventory[ticker] -= Number(tx.quantity);
  }

  for (const [ticker, net] of Object.entries(inventory)) {
    if (net < 0) {
      failures.push({
        check:  "no_oversell",
        detail: `Ticker ${ticker} has net quantity ${net.toFixed(4)} (oversold)`,
      });
    }
  }

  // ── Check 3: ledger_entries balance per transaction (if entries exist) ────
  const { data: entries } = await supabase
    .from("ledger_entries")
    .select("transaction_id, entry_type, amount")
    .eq("org_id", orgId)
    .in("transaction_id", rows.map((r) => r.id));

  const balances: Record<string, number> = {};
  for (const entry of entries ?? []) {
    const txId = entry.transaction_id as string;
    if (!balances[txId]) balances[txId] = 0;
    // Debit types increase, credit types decrease — simplified double-entry
    if (["debit", "purchase", "fee"].includes(entry.entry_type as string)) {
      balances[txId] += Number(entry.amount);
    } else {
      balances[txId] -= Number(entry.amount);
    }
  }
  // Entries should sum to ≈ 0 (within floating-point tolerance)
  for (const [txId, balance] of Object.entries(balances)) {
    if (Math.abs(balance) > 0.01) {
      failures.push({
        check:     "ledger_balance",
        detail:    `Transaction ${txId} ledger entries don't balance: net = ${balance.toFixed(4)}`,
        entity_id: txId,
      });
    }
  }

  // ── Check 4: no orphan reconciliation_flags pointing to deleted transactions
  const { data: flags } = await supabase
    .from("reconciliation_flags")
    .select("id, ref_id, ticker")
    .eq("org_id", orgId)
    .eq("status", "open");

  // We check that flags with a non-empty ref_id have a matching transaction
  if (flags && flags.length > 0) {
    const { data: refTxs } = await supabase
      .from("transactions")
      .select("ref_id")
      .eq("org_id", orgId);

    const knownRefs = new Set((refTxs ?? []).map((t) => t.ref_id as string).filter(Boolean));

    for (const flag of flags) {
      const ref = flag.ref_id as string;
      if (ref && ref.length > 0 && !knownRefs.has(ref)) {
        failures.push({
          check:     "no_orphan_flags",
          detail:    `Flag ${flag.id} references unknown ref_id '${ref}' (${flag.ticker})`,
          entity_id: flag.id,
        });
      }
    }
  }

  return { passed: failures.length === 0, failures };
}
