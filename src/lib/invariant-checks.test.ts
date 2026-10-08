// ─── Invariant Checks Unit Tests (pure logic, no Supabase) ───────────────────
import { describe, it, expect } from "vitest";

// ── Inline the deterministic logic so tests run without a DB ─────────────────

interface TxRow {
  id:         string;
  ticker:     string;
  action:     "BUY" | "SELL" | "DIV";
  quantity:   number;
  price:      number;
  trade_date: string;
  source?:    Record<string, unknown>;
}

interface LedgerEntry {
  transaction_id: string;
  entry_type:     string;
  amount:         number;
}

function checkQuantitiesPositive(txs: TxRow[]): string[] {
  return txs
    .filter((t) => Number(t.quantity) <= 0)
    .map((t) => `quantity<=0 on ${t.id}`);
}

function checkNoOversell(allTxs: TxRow[]): string[] {
  const inv: Record<string, number> = {};
  for (const tx of allTxs.sort((a, b) => a.trade_date.localeCompare(b.trade_date))) {
    inv[tx.ticker] = (inv[tx.ticker] ?? 0) +
      (tx.action === "BUY" ? tx.quantity : tx.action === "SELL" ? -tx.quantity : 0);
  }
  return Object.entries(inv)
    .filter(([, net]) => net < -0.0001)
    .map(([ticker, net]) => `oversell: ${ticker} net=${net}`);
}

function checkLedgerBalance(entries: LedgerEntry[]): string[] {
  const balances: Record<string, number> = {};
  const debitTypes = ["debit", "purchase", "fee"];
  for (const e of entries) {
    balances[e.transaction_id] = (balances[e.transaction_id] ?? 0) +
      (debitTypes.includes(e.entry_type) ? e.amount : -e.amount);
  }
  return Object.entries(balances)
    .filter(([, bal]) => Math.abs(bal) > 0.01)
    .map(([id, bal]) => `ledger_imbalance: ${id} net=${bal.toFixed(4)}`);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("checkQuantitiesPositive", () => {
  it("passes when all quantities are positive", () => {
    const txs: TxRow[] = [
      { id: "t1", ticker: "OGDC", action: "BUY",  quantity: 100, price: 108, trade_date: "2025-01-01" },
      { id: "t2", ticker: "HBL",  action: "SELL", quantity: 50,  price: 148, trade_date: "2025-01-02" },
    ];
    expect(checkQuantitiesPositive(txs)).toHaveLength(0);
  });

  it("catches a zero-quantity row", () => {
    const txs: TxRow[] = [
      { id: "t1", ticker: "OGDC", action: "BUY", quantity: 0, price: 108, trade_date: "2025-01-01" },
    ];
    const failures = checkQuantitiesPositive(txs);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("t1");
  });

  it("catches a negative-quantity row — triggers rollback scenario", () => {
    const txs: TxRow[] = [
      { id: "t3", ticker: "TCS", action: "BUY", quantity: -10, price: 3990, trade_date: "2025-02-01" },
    ];
    const failures = checkQuantitiesPositive(txs);
    expect(failures).toHaveLength(1);
  });

  it("catches multiple bad rows", () => {
    const txs: TxRow[] = [
      { id: "t1", ticker: "A", action: "BUY",  quantity: -1, price: 100, trade_date: "2025-01-01" },
      { id: "t2", ticker: "B", action: "SELL", quantity:  0, price: 200, trade_date: "2025-01-02" },
      { id: "t3", ticker: "C", action: "BUY",  quantity: 50, price: 300, trade_date: "2025-01-03" },
    ];
    expect(checkQuantitiesPositive(txs)).toHaveLength(2);
  });
});

describe("checkNoOversell", () => {
  it("passes when sells are covered by buys", () => {
    const txs: TxRow[] = [
      { id: "b1", ticker: "OGDC", action: "BUY",  quantity: 200, price: 108, trade_date: "2025-01-01" },
      { id: "s1", ticker: "OGDC", action: "SELL", quantity: 100, price: 112, trade_date: "2025-02-01" },
    ];
    expect(checkNoOversell(txs)).toHaveLength(0);
  });

  it("detects oversell when sell exceeds buy", () => {
    const txs: TxRow[] = [
      { id: "b1", ticker: "OGDC", action: "BUY",  quantity: 50,  price: 108, trade_date: "2025-01-01" },
      { id: "s1", ticker: "OGDC", action: "SELL", quantity: 100, price: 112, trade_date: "2025-02-01" },
    ];
    const failures = checkNoOversell(txs);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("OGDC");
  });

  it("allows exact sell of entire holding", () => {
    const txs: TxRow[] = [
      { id: "b1", ticker: "HBL", action: "BUY",  quantity: 100, price: 148, trade_date: "2025-01-01" },
      { id: "s1", ticker: "HBL", action: "SELL", quantity: 100, price: 152, trade_date: "2025-03-01" },
    ];
    expect(checkNoOversell(txs)).toHaveLength(0);
  });

  it("handles multiple tickers independently", () => {
    const txs: TxRow[] = [
      { id: "b1", ticker: "A", action: "BUY",  quantity: 100, price: 10, trade_date: "2025-01-01" },
      { id: "s1", ticker: "A", action: "SELL", quantity: 150, price: 12, trade_date: "2025-02-01" }, // oversold
      { id: "b2", ticker: "B", action: "BUY",  quantity: 200, price: 20, trade_date: "2025-01-01" },
      { id: "s2", ticker: "B", action: "SELL", quantity: 50,  price: 22, trade_date: "2025-02-01" }, // fine
    ];
    const failures = checkNoOversell(txs);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("A");
  });

  it("ignores DIV transactions in inventory calculation", () => {
    const txs: TxRow[] = [
      { id: "b1", ticker: "OGDC", action: "BUY", quantity: 100, price: 108, trade_date: "2025-01-01" },
      { id: "d1", ticker: "OGDC", action: "DIV", quantity: 500, price: 2,   trade_date: "2025-06-01" },
    ];
    expect(checkNoOversell(txs)).toHaveLength(0);
  });
});

describe("checkLedgerBalance", () => {
  it("passes when entries balance to zero", () => {
    const entries: LedgerEntry[] = [
      { transaction_id: "t1", entry_type: "purchase", amount: 10000 },
      { transaction_id: "t1", entry_type: "credit",   amount: 10000 },
    ];
    expect(checkLedgerBalance(entries)).toHaveLength(0);
  });

  it("detects imbalance greater than 0.01", () => {
    const entries: LedgerEntry[] = [
      { transaction_id: "t2", entry_type: "purchase", amount: 10000 },
      { transaction_id: "t2", entry_type: "credit",   amount: 9990 },  // 10 off
    ];
    const failures = checkLedgerBalance(entries);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("t2");
  });

  it("allows sub-cent floating-point rounding (≤ 0.01 tolerance)", () => {
    const entries: LedgerEntry[] = [
      { transaction_id: "t3", entry_type: "debit",  amount: 10000.005 },
      { transaction_id: "t3", entry_type: "credit", amount: 10000.000 },
    ];
    // Diff = 0.005 ≤ 0.01 → passes
    expect(checkLedgerBalance(entries)).toHaveLength(0);
  });
});
