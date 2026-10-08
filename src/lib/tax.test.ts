// ─── FIFO Tax Engine Determinism Tests ───────────────────────────────────────
import { describe, it, expect } from "vitest";
import { computeTax } from "./tax";
import type { Transaction } from "./demo-data";

function tx(overrides: Partial<Transaction> & Pick<Transaction, "id" | "ticker" | "action" | "quantity" | "price" | "trade_date">): Transaction {
  return {
    fees:             0,
    wht:              0,
    ref_id:           overrides.id,
    confidence_score: 1,
    status:           "posted",
    broker:           "TestBroker",
    exchange:         "PSX",
    ...overrides,
  };
}

const BASE_PROFILE = { jurisdiction: "PSX" as const, filerStatus: "Filer" as const, taxYear: "2025" };

describe("computeTax — determinism", () => {
  it("produces identical output when called twice with the same input", () => {
    const txs: Transaction[] = [
      tx({ id: "b1", ticker: "OGDC", action: "BUY",  quantity: 100, price: 100, trade_date: "2024-01-15" }),
      tx({ id: "s1", ticker: "OGDC", action: "SELL", quantity: 100, price: 120, trade_date: "2025-03-10" }),
    ];
    const r1 = computeTax(txs, BASE_PROFILE);
    const r2 = computeTax(txs, BASE_PROFILE);
    expect(r1.estimatedTaxDue).toBe(r2.estimatedTaxDue);
    expect(r1.shortTermGain).toBe(r2.shortTermGain);
    expect(r1.longTermGain).toBe(r2.longTermGain);
    expect(r1.lots.length).toBe(r2.lots.length);
  });

  it("shuffling input order does not change FIFO output", () => {
    const txs: Transaction[] = [
      tx({ id: "b2", ticker: "HBL", action: "BUY",  quantity: 50, price: 140, trade_date: "2024-02-01" }),
      tx({ id: "b1", ticker: "HBL", action: "BUY",  quantity: 50, price: 130, trade_date: "2024-01-01" }),
      tx({ id: "s1", ticker: "HBL", action: "SELL", quantity: 60, price: 150, trade_date: "2025-01-15" }),
    ];
    const shuffled = [...txs].reverse();
    const r1 = computeTax(txs,     BASE_PROFILE);
    const r2 = computeTax(shuffled, BASE_PROFILE);
    expect(r1.estimatedTaxDue).toBeCloseTo(r2.estimatedTaxDue, 2);
  });
});

describe("computeTax — PSX CGT rates", () => {
  it("applies 15% CGT for holding < 365 days", () => {
    const txs: Transaction[] = [
      tx({ id: "b1", ticker: "A", action: "BUY",  quantity: 100, price: 100, trade_date: "2025-01-01" }),
      tx({ id: "s1", ticker: "A", action: "SELL", quantity: 100, price: 200, trade_date: "2025-06-01" }),
    ];
    const r = computeTax(txs, BASE_PROFILE);
    expect(r.lots[0]?.isShortTerm).toBe(true);
    expect(r.lots[0]?.taxRate).toBeCloseTo(0.15);
    expect(r.estimatedTaxDue).toBeCloseTo(10000 * 0.15); // gain=10000, tax=1500
  });

  it("applies 12.5% CGT for holding 12-24 months", () => {
    const txs: Transaction[] = [
      tx({ id: "b1", ticker: "B", action: "BUY",  quantity: 100, price: 100, trade_date: "2023-06-01" }),
      tx({ id: "s1", ticker: "B", action: "SELL", quantity: 100, price: 200, trade_date: "2025-01-01" }),
    ];
    const r = computeTax(txs, { ...BASE_PROFILE, taxYear: "2025" });
    const lot = r.lots[0];
    expect(lot?.holdingDays).toBeGreaterThanOrEqual(365);
    expect(lot?.holdingDays).toBeLessThan(730);
    expect(lot?.taxRate).toBeCloseTo(0.125);
  });

  it("applies 0% CGT for holding > 24 months", () => {
    const txs: Transaction[] = [
      tx({ id: "b1", ticker: "C", action: "BUY",  quantity: 100, price: 100, trade_date: "2022-01-01" }),
      tx({ id: "s1", ticker: "C", action: "SELL", quantity: 100, price: 300, trade_date: "2025-02-01" }),
    ];
    const r = computeTax(txs, BASE_PROFILE);
    expect(r.lots[0]?.taxRate).toBe(0);
    expect(r.estimatedTaxDue).toBe(0);
  });
});

describe("computeTax — NSE CGT rates", () => {
  it("applies 20% STCG for holding < 365 days", () => {
    const txs: Transaction[] = [
      tx({ id: "b1", ticker: "TCS", action: "BUY",  quantity: 10, price: 3500, trade_date: "2025-01-01", exchange: "NSE" }),
      tx({ id: "s1", ticker: "TCS", action: "SELL", quantity: 10, price: 4000, trade_date: "2025-06-01", exchange: "NSE" }),
    ];
    const r = computeTax(txs, { jurisdiction: "NSE", filerStatus: "Filer", taxYear: "2025" });
    expect(r.lots[0]?.taxRate).toBeCloseTo(0.20);
  });

  it("applies 12.5% LTCG for holding > 365 days", () => {
    const txs: Transaction[] = [
      tx({ id: "b1", ticker: "INFY", action: "BUY",  quantity: 20, price: 1400, trade_date: "2024-01-01", exchange: "NSE" }),
      tx({ id: "s1", ticker: "INFY", action: "SELL", quantity: 20, price: 1600, trade_date: "2025-02-01", exchange: "NSE" }),
    ];
    const r = computeTax(txs, { jurisdiction: "NSE", filerStatus: "Filer", taxYear: "2025" });
    expect(r.lots[0]?.taxRate).toBeCloseTo(0.125);
  });
});

describe("computeTax — FIFO lot matching", () => {
  it("matches earliest lot first (FIFO)", () => {
    const txs: Transaction[] = [
      tx({ id: "b1", ticker: "X", action: "BUY",  quantity: 50, price: 100, trade_date: "2024-01-01" }),
      tx({ id: "b2", ticker: "X", action: "BUY",  quantity: 50, price: 200, trade_date: "2024-06-01" }),
      tx({ id: "s1", ticker: "X", action: "SELL", quantity: 50, price: 250, trade_date: "2025-02-01" }),
    ];
    const r = computeTax(txs, BASE_PROFILE);
    // Should match the first buy at price=100, gain = (250-100)*50 = 7500
    expect(r.lots[0]?.costBasis).toBe(100);
    expect(r.lots[0]?.gain).toBeCloseTo(7500);
  });

  it("splits a sell across two lots when first lot is partially sufficient", () => {
    const txs: Transaction[] = [
      tx({ id: "b1", ticker: "Y", action: "BUY",  quantity: 30, price: 100, trade_date: "2024-01-01" }),
      tx({ id: "b2", ticker: "Y", action: "BUY",  quantity: 70, price: 150, trade_date: "2024-03-01" }),
      tx({ id: "s1", ticker: "Y", action: "SELL", quantity: 80, price: 200, trade_date: "2025-01-15" }),
    ];
    const r = computeTax(txs, BASE_PROFILE);
    expect(r.lots.length).toBe(2); // split across two buy lots
    const totalMatched = r.lots.reduce((s, l) => s + l.quantity, 0);
    expect(totalMatched).toBe(80);
  });

  it("dividend WHT is accumulated correctly", () => {
    const txs: Transaction[] = [
      tx({ id: "d1", ticker: "OGDC", action: "DIV", quantity: 1000, price: 2, trade_date: "2025-06-01", wht: 300 }),
      tx({ id: "d2", ticker: "OGDC", action: "DIV", quantity: 1000, price: 2, trade_date: "2025-09-01", wht: 250 }),
    ];
    const r = computeTax(txs, BASE_PROFILE);
    expect(r.dividendWHT).toBe(550);
    expect(r.estimatedTaxDue).toBe(0); // no sells
  });

  it("returns zero tax when there are no sells in the tax year", () => {
    const txs: Transaction[] = [
      tx({ id: "b1", ticker: "Z", action: "BUY", quantity: 100, price: 100, trade_date: "2025-01-01" }),
    ];
    const r = computeTax(txs, BASE_PROFILE);
    expect(r.estimatedTaxDue).toBe(0);
    expect(r.lots.length).toBe(0);
  });
});
