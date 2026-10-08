// ─── useLedgerContext ─────────────────────────────────────────────────────────
// Single source of truth for jurisdiction, currency, and current tax year.
// Detects exchange from real transaction data rather than relying on the org
// profile default (which may be "PSX" even for NSE holdings).

import { useMemo } from "react";
import { useAuth } from "./auth-context";
import { useTransactions } from "./data-hooks";

export type Jurisdiction = "PSX" | "NSE";

export interface LedgerContext {
  jurisdiction: Jurisdiction;
  currency:     "PKR" | "INR";
  taxYear:      string;       // current calendar year as string
  isLoading:    boolean;
}

export function useLedgerContext(): LedgerContext {
  const { profile } = useAuth();
  const { data: transactions = [], isLoading } = useTransactions(profile?.org_id);

  const { jurisdiction, currency } = useMemo(() => {
    if (!transactions.length) {
      // No data yet — fall back to org profile default
      const orgJ = (profile?.jurisdiction as Jurisdiction | undefined) ?? "PSX";
      return { jurisdiction: orgJ, currency: orgJ === "NSE" ? "INR" as const : "PKR" as const };
    }
    const nseCount = transactions.filter((t) => t.exchange === "NSE").length;
    const j: Jurisdiction = nseCount > transactions.length / 2 ? "NSE" : "PSX";
    return { jurisdiction: j, currency: j === "NSE" ? "INR" as const : "PKR" as const };
  }, [transactions, profile?.jurisdiction]);

  const taxYear = String(new Date().getFullYear());

  return { jurisdiction, currency, taxYear, isLoading };
}
