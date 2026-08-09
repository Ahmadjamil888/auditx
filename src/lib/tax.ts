// ─── Deterministic FIFO tax engine ───────────────────────────────────────────
// No AI is involved here. All numbers are computed from first principles.

import type { Transaction } from "./demo-data";

// ── Tax profile types ─────────────────────────────────────────────────────────

export type Jurisdiction = "PSX" | "NSE";

export interface TaxProfile {
  jurisdiction: Jurisdiction;
  filerStatus: "Filer" | "Non-Filer"; // PSX only
  taxYear: string; // e.g. "2025"
}

// ── Result types ──────────────────────────────────────────────────────────────

export interface FifoLot {
  buyDate: string;
  sellDate: string;
  ticker: string;
  quantity: number;
  costBasis: number; // per unit
  salePrice: number; // per unit
  holdingDays: number;
  gain: number; // total PKR / INR
  isShortTerm: boolean;
  taxRate: number; // 0-1
  taxDue: number;
}

export interface TaxComputation {
  jurisdiction: Jurisdiction;
  taxYear: string;
  filerStatus: string;
  lots: FifoLot[];
  shortTermGain: number;
  longTermGain: number;
  totalGain: number;
  dividendWHT: number;
  shortTermTax: number;
  longTermTax: number;
  estimatedTaxDue: number;
  computedAt: string;
}

// ── PSX CGT rules (FY2025) ────────────────────────────────────────────────────
// Per Finance Act 2024 Pakistan schedule:
// Holding < 12 months → 15% CGT
// Holding 12-24 months → 12.5% CGT
// Holding > 24 months → 0%
function psxCgtRate(holdingDays: number): number {
  if (holdingDays < 365) return 0.15;
  if (holdingDays < 730) return 0.125;
  return 0;
}

// ── NSE CGT rules (FY2025) ────────────────────────────────────────────────────
// India: STCG (< 12 months) → 20%, LTCG (> 12 months) → 12.5% (post Budget 2024)
function nseCgtRate(holdingDays: number): number {
  if (holdingDays < 365) return 0.2;
  return 0.125;
}

// ── Core FIFO engine ──────────────────────────────────────────────────────────

export function computeTax(txs: Transaction[], profile: TaxProfile): TaxComputation {
  // Filter to the relevant tax year (calendar year for simplicity)
  const yearTxs = txs.filter((t) => t.trade_date.startsWith(profile.taxYear));

  // Build FIFO buy queues per ticker
  const buyQueues: Record<string, Array<{ date: string; qty: number; price: number }>> = {};

  // Process ALL buy transactions in chronological order
  const allBuys = [...txs]
    .filter((t) => t.action === "BUY")
    .sort((a, b) => a.trade_date.localeCompare(b.trade_date));

  for (const tx of allBuys) {
    if (!buyQueues[tx.ticker]) buyQueues[tx.ticker] = [];
    buyQueues[tx.ticker]!.push({ date: tx.trade_date, qty: tx.quantity, price: tx.price });
  }

  // Match sells against buy lots using FIFO
  const lots: FifoLot[] = [];
  const sellTxs = yearTxs
    .filter((t) => t.action === "SELL")
    .sort((a, b) => a.trade_date.localeCompare(b.trade_date));

  for (const sell of sellTxs) {
    let remaining = sell.quantity;
    const queue = buyQueues[sell.ticker] ?? [];

    while (remaining > 0 && queue.length > 0) {
      const lot = queue[0]!;
      const matched = Math.min(remaining, lot.qty);

      const sellDate = new Date(sell.trade_date);
      const buyDate = new Date(lot.date);
      const holdingDays = Math.floor(
        (sellDate.getTime() - buyDate.getTime()) / (1000 * 60 * 60 * 24),
      );

      const gain = (sell.price - lot.price) * matched;
      const taxRate =
        profile.jurisdiction === "PSX" ? psxCgtRate(holdingDays) : nseCgtRate(holdingDays);

      lots.push({
        buyDate: lot.date,
        sellDate: sell.trade_date,
        ticker: sell.ticker,
        quantity: matched,
        costBasis: lot.price,
        salePrice: sell.price,
        holdingDays,
        gain,
        isShortTerm: holdingDays < 365,
        taxRate,
        taxDue: Math.max(0, gain * taxRate),
      });

      remaining -= matched;
      lot.qty -= matched;
      if (lot.qty === 0) queue.shift();
    }
  }

  // Aggregate dividend WHT
  const dividendWHT = yearTxs
    .filter((t) => t.action === "DIV")
    .reduce((sum, t) => sum + t.wht, 0);

  // Aggregate gains
  const shortTermGain = lots.filter((l) => l.isShortTerm).reduce((s, l) => s + l.gain, 0);
  const longTermGain = lots.filter((l) => !l.isShortTerm).reduce((s, l) => s + l.gain, 0);
  const shortTermTax = lots.filter((l) => l.isShortTerm).reduce((s, l) => s + l.taxDue, 0);
  const longTermTax = lots.filter((l) => !l.isShortTerm).reduce((s, l) => s + l.taxDue, 0);

  return {
    jurisdiction: profile.jurisdiction,
    taxYear: profile.taxYear,
    filerStatus: profile.filerStatus ?? "Filer",
    lots,
    shortTermGain,
    longTermGain,
    totalGain: shortTermGain + longTermGain,
    dividendWHT,
    shortTermTax,
    longTermTax,
    estimatedTaxDue: shortTermTax + longTermTax,
    computedAt: new Date().toISOString(),
  };
}

// ── Tax-loss harvesting suggestions ──────────────────────────────────────────

export interface HarvestSuggestion {
  ticker: string;
  exchange: "PSX" | "NSE";
  unrealizedLoss: number;
  potentialOffset: number;
  holdingDays: number;
  rationale: string;
}

// Open positions with current prices (demo — in production these come from a market feed)
const CURRENT_PRICES: Record<string, number> = {
  OGDC: 108.0,
  HBL: 148.5,
  TCS: 3990.0,
  INFY: 1480.0,
  PPL: 74.0,
  UBL: 182.0,
  LUCK: 415.0,
  ENGRO: 258.0,
};

export function suggestHarvesting(txs: Transaction[], realizedGain: number): HarvestSuggestion[] {
  // Build open positions (net buy qty)
  const positions: Record<string, { qty: number; avgCost: number; exchange: "PSX" | "NSE"; firstBuy: string }> = {};

  for (const tx of txs.sort((a, b) => a.trade_date.localeCompare(b.trade_date))) {
    if (!positions[tx.ticker]) {
      positions[tx.ticker] = { qty: 0, avgCost: 0, exchange: tx.exchange, firstBuy: tx.trade_date };
    }
    const p = positions[tx.ticker]!;
    if (tx.action === "BUY") {
      const totalCost = p.avgCost * p.qty + tx.price * tx.quantity;
      p.qty += tx.quantity;
      p.avgCost = totalCost / p.qty;
    } else if (tx.action === "SELL") {
      p.qty -= tx.quantity;
    }
  }

  const suggestions: HarvestSuggestion[] = [];

  for (const [ticker, pos] of Object.entries(positions)) {
    if (pos.qty <= 0) continue;
    const currentPrice = CURRENT_PRICES[ticker];
    if (!currentPrice) continue;

    const unrealizedLoss = (currentPrice - pos.avgCost) * pos.qty;
    if (unrealizedLoss >= 0) continue; // only suggest losers

    const potentialOffset = Math.min(Math.abs(unrealizedLoss), realizedGain);
    const holdingDays = Math.floor(
      (Date.now() - new Date(pos.firstBuy).getTime()) / (1000 * 60 * 60 * 24),
    );

    suggestions.push({
      ticker,
      exchange: pos.exchange,
      unrealizedLoss,
      potentialOffset,
      holdingDays,
      rationale: `Selling ${pos.qty} ${ticker} @ ${currentPrice} locks in a loss of ${Math.abs(unrealizedLoss).toLocaleString("en-PK", { maximumFractionDigits: 0 })} which could offset an equivalent portion of your ${realizedGain > 0 ? "realized gain" : "future gains"}.`,
    });
  }

  return suggestions.sort((a, b) => a.unrealizedLoss - b.unrealizedLoss);
}
