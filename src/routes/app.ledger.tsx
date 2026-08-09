import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  Filter,
  MoreHorizontal,
  Search,
} from "lucide-react";
import { useState } from "react";
import { StatusPill } from "@/components/kit";
import { useAuth } from "@/lib/auth-context";
import { useTransactions } from "@/lib/data-hooks";
import type { TxAction } from "@/lib/demo-data";

export const Route = createFileRoute("/app/ledger")({
  component: Ledger,
});

type SortKey = "trade_date" | "ticker" | "action" | "quantity" | "price" | "confidence_score";

function ConfidenceBadge({ score }: { score: number }) {
  const tone = score >= 0.9 ? "ok" : score >= 0.75 ? "warn" : "bad";
  return <StatusPill tone={tone}>{score.toFixed(2)}</StatusPill>;
}

function ActionBadge({ action }: { action: TxAction }) {
  const map: Record<TxAction, { tone: "ok" | "bad" | "info"; label: string }> = {
    BUY: { tone: "info", label: "BUY" },
    SELL: { tone: "ok", label: "SELL" },
    DIV: { tone: "warn", label: "DIV" },
  };
  const { tone, label } = map[action];
  return <StatusPill tone={tone}>{label}</StatusPill>;
}

function Ledger() {
  const { profile } = useAuth();
  const { data: DEMO_TRANSACTIONS = [] } = useTransactions(profile?.org_id);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("trade_date");
  const [sortAsc, setSortAsc] = useState(false);
  const [actionFilter, setActionFilter] = useState<TxAction | "ALL">("ALL");
  const [statusFilter, setStatusFilter] = useState<"all" | "posted" | "needs_review">("all");
  const [rowMenu, setRowMenu] = useState<string | null>(null);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  const filtered = DEMO_TRANSACTIONS.filter((t) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      t.ticker.toLowerCase().includes(q) ||
      t.ref_id.toLowerCase().includes(q) ||
      t.broker.toLowerCase().includes(q);
    const matchAction = actionFilter === "ALL" || t.action === actionFilter;
    const matchStatus = statusFilter === "all" || t.status === statusFilter;
    return matchSearch && matchAction && matchStatus;
  });

  const sorted = [...filtered].sort((a, b) => {
    let av: string | number = a[sortKey] as string | number;
    let bv: string | number = b[sortKey] as string | number;
    if (typeof av === "string") av = av.toLowerCase();
    if (typeof bv === "string") bv = bv.toLowerCase();
    if (av < bv) return sortAsc ? -1 : 1;
    if (av > bv) return sortAsc ? 1 : -1;
    return 0;
  });

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return null;
    return sortAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />;
  }

  const th = "px-4 py-3 text-left text-xs font-semibold cursor-pointer select-none";

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "1.5rem" }}>Ledger</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--ink-2)" }}>
            {DEMO_TRANSACTIONS.length} transactions · {DEMO_TRANSACTIONS.filter(t => t.status === "needs_review").length} need review
          </p>
        </div>
        <button
          type="button"
          className="flex items-center gap-2 rounded-full border bg-white px-4 py-2 text-sm font-medium transition-shadow hover:shadow-md"
          style={{ borderColor: "var(--hairline)" }}
        >
          <Download size={15} strokeWidth={1.75} />
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div
        className="flex flex-wrap items-center gap-3 rounded-2xl bg-white p-4"
        style={{ border: "1px solid var(--hairline)" }}
      >
        <div className="flex flex-1 items-center gap-2 rounded-xl border bg-white px-3 py-2" style={{ borderColor: "var(--hairline)", minWidth: 200 }}>
          <Search size={14} strokeWidth={1.75} style={{ color: "var(--ink-3)" }} />
          <input
            type="text"
            placeholder="Search ticker, ref ID, broker…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 text-sm outline-none bg-transparent"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <Filter size={14} strokeWidth={1.75} style={{ color: "var(--ink-3)" }} />
          <span className="text-xs font-medium" style={{ color: "var(--ink-2)" }}>Action:</span>
          {(["ALL", "BUY", "SELL", "DIV"] as const).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setActionFilter(a)}
              className="rounded-full px-2.5 py-1 text-xs font-medium transition-colors"
              style={{
                background: actionFilter === a ? "var(--color-accent)" : "var(--color-login-bg)",
                color: actionFilter === a ? "#fff" : "var(--ink-2)",
              }}
            >
              {a}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium" style={{ color: "var(--ink-2)" }}>Status:</span>
          {(["all", "posted", "needs_review"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className="rounded-full px-2.5 py-1 text-xs font-medium capitalize transition-colors"
              style={{
                background: statusFilter === s ? "var(--color-accent)" : "var(--color-login-bg)",
                color: statusFilter === s ? "#fff" : "var(--ink-2)",
              }}
            >
              {s.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div
        className="overflow-hidden rounded-2xl bg-white"
        style={{ border: "1px solid var(--hairline)" }}
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--hairline)", background: "var(--color-login-bg)" }}>
                <th className={th} onClick={() => toggleSort("ticker")}>
                  <span className="flex items-center gap-1">Ticker <SortIcon col="ticker" /></span>
                </th>
                <th className={th} onClick={() => toggleSort("action")}>
                  <span className="flex items-center gap-1">Action <SortIcon col="action" /></span>
                </th>
                <th className={`${th} text-right`} onClick={() => toggleSort("quantity")}>
                  <span className="flex items-center justify-end gap-1">Qty <SortIcon col="quantity" /></span>
                </th>
                <th className={`${th} text-right`} onClick={() => toggleSort("price")}>
                  <span className="flex items-center justify-end gap-1">Price <SortIcon col="price" /></span>
                </th>
                <th className={`${th} text-right hidden sm:table-cell`}>Fees</th>
                <th className={`${th} text-right hidden sm:table-cell`}>WHT</th>
                <th className={th} onClick={() => toggleSort("trade_date")}>
                  <span className="flex items-center gap-1">Date <SortIcon col="trade_date" /></span>
                </th>
                <th className={`${th} hidden md:table-cell`}>Ref ID</th>
                <th className={th} onClick={() => toggleSort("confidence_score")}>
                  <span className="flex items-center gap-1">Confidence <SortIcon col="confidence_score" /></span>
                </th>
                <th className={th}>Status</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((tx, i) => (
                <motion.tr
                  key={tx.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.03 }}
                  style={{ borderBottom: "1px solid var(--hairline)" }}
                  className="transition-colors hover:bg-violet-50/40"
                >
                  <td className="px-4 py-3 text-sm font-semibold">{tx.ticker}</td>
                  <td className="px-4 py-3"><ActionBadge action={tx.action} /></td>
                  <td className="tnum px-4 py-3 text-right text-sm">{tx.quantity.toLocaleString()}</td>
                  <td className="tnum px-4 py-3 text-right text-sm">
                    {tx.price.toLocaleString("en-PK", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="tnum px-4 py-3 text-right text-sm hidden sm:table-cell" style={{ color: "var(--ink-2)" }}>
                    {tx.fees.toLocaleString()}
                  </td>
                  <td className="tnum px-4 py-3 text-right text-sm hidden sm:table-cell" style={{ color: tx.wht > 0 ? "var(--warn)" : "var(--ink-3)" }}>
                    {tx.wht > 0 ? tx.wht.toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-3 text-sm" style={{ color: "var(--ink-2)" }}>{tx.trade_date}</td>
                  <td className="px-4 py-3 font-mono text-xs hidden md:table-cell" style={{ color: "var(--ink-3)" }}>{tx.ref_id}</td>
                  <td className="px-4 py-3"><ConfidenceBadge score={tx.confidence_score} /></td>
                  <td className="px-4 py-3">
                    <StatusPill tone={tx.status === "posted" ? "ok" : "warn"}>
                      {tx.status === "posted" ? "Posted" : "Review"}
                    </StatusPill>
                  </td>
                  <td className="px-4 py-3 relative">
                    <button
                      type="button"
                      onClick={() => setRowMenu(rowMenu === tx.id ? null : tx.id)}
                      className="rounded-lg p-1.5 transition-colors hover:bg-black/10"
                      aria-label="Row actions"
                    >
                      <MoreHorizontal size={16} strokeWidth={1.75} />
                    </button>
                    {rowMenu === tx.id && (
                      <div
                        className="absolute right-4 top-full z-10 mt-1 w-40 overflow-hidden rounded-xl bg-white shadow-lg"
                        style={{ border: "1px solid var(--hairline)" }}
                      >
                        {[
                          { label: "View detail", icon: ExternalLink },
                          { label: "Edit fields", icon: Filter },
                        ].map(({ label, icon: Ic }) => (
                          <button
                            key={label}
                            type="button"
                            onClick={() => setRowMenu(null)}
                            className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-black/5"
                          >
                            <Ic size={14} strokeWidth={1.75} style={{ color: "var(--ink-3)" }} />
                            {label}
                          </button>
                        ))}
                      </div>
                    )}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>

        {sorted.length === 0 && (
          <div className="py-16 text-center">
            <p className="text-sm" style={{ color: "var(--ink-3)" }}>
              No transactions match your filters.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
