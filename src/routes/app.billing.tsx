import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowUpRight, BadgeCheck, CreditCard, Download, Zap } from "lucide-react";
import { Btn, Panel, StatusPill, reveal } from "@/components/kit";
import { useAuth } from "@/lib/auth-store";

export const Route = createFileRoute("/app/billing")({
  component: Billing,
});

const plans = [
  {
    name: "Free",
    price: "$0",
    note: "50 parsed transactions / month",
    items: ["1 tax profile", "CSV export", "Community support"],
  },
  {
    name: "Pro",
    price: "$9.99",
    note: "For active retail traders",
    popular: true,
    items: [
      "Unlimited transactions",
      "PDF tax summary export",
      "Anomaly detection",
      "Tax-loss harvesting",
    ],
  },
  {
    name: "Enterprise",
    price: "$49",
    note: "Brokerages & portfolio managers",
    items: [
      "Multi-client accounts",
      "Team roles & SSO",
      "API access",
      "Priority reconciliation",
      "Dedicated audit retention",
    ],
  },
];

const invoices = [
  { id: "INV-2025-08", date: "Aug 1, 2025", amount: "$9.99", status: "Paid" },
  { id: "INV-2025-07", date: "Jul 1, 2025", amount: "$9.99", status: "Paid" },
  { id: "INV-2025-06", date: "Jun 1, 2025", amount: "$9.99", status: "Paid" },
];

function Billing() {
  const { user } = useAuth();

  const usedTx = 31;
  const limitTx = user?.plan === "free" ? 50 : null;

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div>
        <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "1.5rem" }}>Billing</h1>
        <p className="mt-0.5 text-sm" style={{ color: "var(--ink-2)" }}>
          Manage your plan, usage and payment details.
        </p>
      </div>

      {/* Current plan */}
      <Panel>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium" style={{ color: "var(--ink-3)" }}>CURRENT PLAN</p>
            <div className="mt-1 flex items-center gap-2">
              <p className="text-xl font-semibold capitalize">{user?.plan ?? "Pro"}</p>
              <StatusPill tone={user?.plan === "free" ? "warn" : "ok"}>
                {user?.plan === "free" ? "Free" : user?.plan === "pro" ? "Active" : "Enterprise"}
              </StatusPill>
            </div>
            <p className="mt-1 text-sm" style={{ color: "var(--ink-2)" }}>
              {user?.plan === "free" ? "Free forever, 50 tx/mo limit" : "Renews Sep 1, 2025 · $9.99/mo"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Btn variant="secondary">
              <CreditCard size={15} strokeWidth={1.75} />
              Manage payment
            </Btn>
            {user?.plan === "free" && (
              <Btn>
                <Zap size={15} strokeWidth={1.75} />
                Upgrade to Pro
              </Btn>
            )}
          </div>
        </div>

        {/* Usage meter */}
        {limitTx && (
          <div className="mt-6">
            <div className="flex justify-between text-xs" style={{ color: "var(--ink-2)" }}>
              <span>Transactions parsed this month</span>
              <span className="tnum font-medium">
                {usedTx} / {limitTx}
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full" style={{ background: "var(--color-login-bg)" }}>
              <motion.div
                className="h-full rounded-full"
                style={{ background: usedTx / limitTx > 0.8 ? "var(--warn)" : "var(--color-accent)" }}
                initial={{ width: 0 }}
                animate={{ width: `${(usedTx / limitTx) * 100}%` }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
          </div>
        )}
      </Panel>

      {/* Plan comparison */}
      <div>
        <p className="mb-4 text-sm font-semibold">Available Plans</p>
        <div className="grid gap-4 md:grid-cols-3">
          {plans.map((plan, i) => (
            <motion.div
              key={plan.name}
              variants={reveal}
              custom={i}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
            >
              <Panel
                style={
                  plan.popular
                    ? { border: "2px solid var(--color-accent)", boxShadow: "var(--shadow-hover)" }
                    : {}
                }
              >
                <div className="flex items-center justify-between">
                  <p className="font-semibold">{plan.name}</p>
                  {plan.popular && <StatusPill tone="info">Most popular</StatusPill>}
                </div>
                <p className="tnum mt-3 text-2xl font-semibold">
                  {plan.price}
                  {plan.name !== "Free" && (
                    <span className="text-sm font-normal" style={{ color: "var(--ink-3)" }}>
                      /mo
                    </span>
                  )}
                </p>
                <p className="mt-1 text-xs" style={{ color: "var(--ink-3)" }}>{plan.note}</p>
                <ul className="mt-4 space-y-2 text-sm" style={{ color: "var(--ink-2)" }}>
                  {plan.items.map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <BadgeCheck size={15} strokeWidth={1.75} style={{ color: "var(--color-accent)", flexShrink: 0, marginTop: 1 }} />
                      {item}
                    </li>
                  ))}
                </ul>
                <Btn
                  variant={
                    (user?.plan ?? "pro") === plan.name.toLowerCase()
                      ? "secondary"
                      : plan.popular
                        ? "primary"
                        : "secondary"
                  }
                  className="mt-5 w-full"
                  disabled={(user?.plan ?? "pro") === plan.name.toLowerCase()}
                >
                  {(user?.plan ?? "pro") === plan.name.toLowerCase()
                    ? "Current plan"
                    : plan.name === "Enterprise"
                      ? "Contact sales"
                      : `Upgrade to ${plan.name}`}
                </Btn>
              </Panel>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Invoices */}
      <Panel>
        <p className="mb-4 text-sm font-semibold">Invoice History</p>
        <div
          className="overflow-hidden rounded-xl"
          style={{ border: "1px solid var(--hairline)" }}
        >
          <table className="w-full border-collapse">
            <thead>
              <tr style={{ background: "var(--color-login-bg)", borderBottom: "1px solid var(--hairline)" }}>
                <th className="px-4 py-3 text-left text-xs font-semibold">Invoice</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">Date</th>
                <th className="px-4 py-3 text-right text-xs font-semibold">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} style={{ borderBottom: "1px solid var(--hairline)" }} className="hover:bg-black/5 transition-colors">
                  <td className="px-4 py-3 font-mono text-sm">{inv.id}</td>
                  <td className="px-4 py-3 text-sm" style={{ color: "var(--ink-2)" }}>{inv.date}</td>
                  <td className="tnum px-4 py-3 text-right text-sm font-medium">{inv.amount}</td>
                  <td className="px-4 py-3">
                    <StatusPill tone="ok">{inv.status}</StatusPill>
                  </td>
                  <td className="px-4 py-3">
                    <button type="button" className="flex items-center gap-1.5 text-xs" style={{ color: "var(--color-accent)" }}>
                      <Download size={13} strokeWidth={1.75} />
                      PDF
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Stripe notice */}
      <div
        className="flex items-start gap-2.5 rounded-2xl px-5 py-4 text-sm"
        style={{ background: "rgba(59,111,209,0.06)", border: "1px solid rgba(59,111,209,0.15)" }}
      >
        <ArrowUpRight size={15} strokeWidth={1.75} style={{ color: "var(--info)", marginTop: 2, flexShrink: 0 }} />
        <p style={{ color: "var(--ink-2)" }}>
          Payments are processed securely by Stripe. AuditX never stores card details. Upgrading
          opens a Stripe Checkout session in a new tab.
        </p>
      </div>
    </div>
  );
}
