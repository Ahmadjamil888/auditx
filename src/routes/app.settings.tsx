import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  Bell,
  Building2,
  CreditCard,
  Key,
  Trash2,
  Users,
} from "lucide-react";
import { useState } from "react";
import { Btn, Panel } from "@/components/kit";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/app/settings")({
  component: Settings,
});

type Tab = "org" | "tax-profiles" | "brokers" | "team" | "notifications" | "api";

const TABS: { id: Tab; label: string; icon: typeof Building2 }[] = [
  { id: "org", label: "Organisation", icon: Building2 },
  { id: "tax-profiles", label: "Tax Profiles", icon: CreditCard },
  { id: "brokers", label: "Broker Accounts", icon: Key },
  { id: "team", label: "Team & Roles", icon: Users },
  { id: "notifications", label: "Notifications", icon: Bell },
];

function Settings() {
  const { profile, user } = useAuth();
  const [tab, setTab] = useState<Tab>("org");
  const [orgName, setOrgName] = useState(profile?.org_name ?? "My Organisation");
  const [saved, setSaved] = useState(false);

  async function save() {
    await new Promise((r) => setTimeout(r, 600));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div>
        <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "1.5rem" }}>Settings</h1>
        <p className="mt-0.5 text-sm" style={{ color: "var(--ink-2)" }}>
          Manage your organisation, tax profiles, broker accounts and team.
        </p>
      </div>

      <div className="flex gap-6">
        {/* Tab rail */}
        <nav
          className="hidden w-44 shrink-0 rounded-2xl bg-white p-2 lg:block"
          style={{ border: "1px solid var(--hairline)", alignSelf: "start" }}
        >
          {TABS.map(({ id, label, icon: Ic }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors"
              style={{
                background: tab === id ? "rgba(115,66,226,0.1)" : "transparent",
                color: tab === id ? "var(--color-accent)" : "var(--ink-2)",
              }}
            >
              <Ic size={16} strokeWidth={1.75} />
              {label}
            </button>
          ))}
        </nav>

        {/* Mobile tab strip */}
        <div className="w-full overflow-x-auto lg:hidden">
          <div className="flex gap-2 pb-2">
            {TABS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className="shrink-0 rounded-full px-3 py-1.5 text-xs font-medium"
                style={{
                  background: tab === id ? "var(--color-accent)" : "var(--color-login-bg)",
                  color: tab === id ? "#fff" : "var(--ink-2)",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 space-y-4">
          {tab === "org" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <Panel>
                <p className="mb-4 text-sm font-semibold">Organisation Details</p>
                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--ink-2)" }}>
                      Organisation name
                    </label>
                    <input
                      type="text"
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      className="w-full rounded-[10px] border bg-white px-4 py-3 text-sm outline-none focus:ring-2"
                      style={{ borderColor: "var(--hairline)", maxWidth: 400, ["--tw-ring-color" as string]: "var(--color-accent)" }}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--ink-2)" }}>
                      Default jurisdiction
                    </label>
                    <select
                      className="w-full rounded-[10px] border bg-white px-4 py-3 text-sm outline-none"
                      style={{ borderColor: "var(--hairline)", maxWidth: 400 }}
                      defaultValue={profile?.jurisdiction ?? "PSX"}
                    >
                      <option value="PSX">PSX — Pakistan</option>
                      <option value="NSE">NSE — India</option>
                    </select>
                  </div>
                  <Btn onClick={save} variant="primary">
                    {saved ? "Saved ✓" : "Save changes"}
                  </Btn>
                </div>
              </Panel>

              {/* Danger zone */}
              <Panel style={{ border: "1px solid rgba(214,69,69,0.2)" }}>
                <p className="mb-2 text-sm font-semibold" style={{ color: "var(--bad)" }}>
                  Danger Zone
                </p>
                <p className="mb-4 text-sm" style={{ color: "var(--ink-2)" }}>
                  Deleting your organisation permanently removes all transactions, tax computations,
                  and audit logs. This action cannot be undone.
                </p>
                <Btn
                  variant="ghost"
                  className="!text-[var(--bad)] border border-[var(--bad)]/30 hover:!bg-red-50"
                >
                  <Trash2 size={15} strokeWidth={1.75} />
                  Delete organisation
                </Btn>
              </Panel>
            </motion.div>
          )}

          {tab === "tax-profiles" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Panel>
                <p className="mb-4 text-sm font-semibold">Tax Profiles</p>
                <div className="space-y-3">
                  {[
                    { name: "PSX — Pakistan", key: "PSX", rules: "CGT 15% ST / 12.5% LT, Filer WHT 10%" },
                    { name: "NSE — India",    key: "NSE", rules: "STCG 20%, LTCG 12.5% (post Budget 2024)" },
                  ].map((p) => {
                    const isActive = (profile?.jurisdiction ?? "PSX") === p.key;
                    return (
                      <div
                        key={p.name}
                        className="flex items-center justify-between rounded-xl px-4 py-3"
                        style={{
                          background: isActive ? "rgba(115,66,226,0.06)" : "var(--color-login-bg)",
                          border: `1px solid ${isActive ? "rgba(115,66,226,0.2)" : "transparent"}`,
                        }}
                      >
                        <div>
                          <p className="text-sm font-medium">{p.name}</p>
                          <p className="text-xs" style={{ color: "var(--ink-3)" }}>{p.rules}</p>
                        </div>
                        {isActive && (
                          <span
                            className="rounded-full px-2.5 py-1 text-xs font-medium"
                            style={{ background: "var(--color-accent)", color: "#fff" }}
                          >
                            Active
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Panel>
            </motion.div>
          )}

          {tab === "brokers" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Panel>
                <div className="mb-4 flex items-center justify-between">
                  <p className="text-sm font-semibold">Broker Accounts</p>
                  <Btn variant="secondary">Add broker</Btn>
                </div>
                <div className="flex flex-col items-center justify-center py-10 gap-2">
                  <Key size={28} strokeWidth={1.5} style={{ color: "var(--ink-3)" }} />
                  <p className="text-sm font-medium">No broker accounts added</p>
                  <p className="text-xs text-center" style={{ color: "var(--ink-3)" }}>
                    Broker names are inferred automatically when you parse statements.
                    <br />Use "Add broker" to link an account manually.
                  </p>
                </div>
              </Panel>
            </motion.div>
          )}

          {tab === "team" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Panel>
                <div className="mb-4 flex items-center justify-between">
                  <p className="text-sm font-semibold">Team Members</p>
                  <Btn variant="secondary">Invite member</Btn>
                </div>
                <div className="space-y-3">
                  {/* Only the real logged-in user */}
                  <div
                    className="flex items-center gap-3 rounded-xl px-4 py-3"
                    style={{ background: "var(--color-login-bg)" }}
                  >
                    <div
                      className="flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                      style={{ background: "var(--color-accent)", color: "#fff" }}
                    >
                      {(profile?.full_name ?? user?.email ?? "?").charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{profile?.full_name ?? "You"}</p>
                      <p className="text-xs" style={{ color: "var(--ink-3)" }}>{user?.email ?? ""}</p>
                    </div>
                    <span
                      className="rounded-full px-2.5 py-1 text-xs font-medium"
                      style={{ background: "rgba(115,66,226,0.1)", color: "var(--color-accent)" }}
                    >
                      Owner
                    </span>
                  </div>
                  <p className="pt-2 text-center text-xs" style={{ color: "var(--ink-3)" }}>
                    Invite teammates to collaborate on your organisation's ledger.
                  </p>
                </div>
              </Panel>
            </motion.div>
          )}

          {tab === "notifications" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Panel>
                <p className="mb-4 text-sm font-semibold">Notification Preferences</p>
                <div className="space-y-4">
                  {[
                    { label: "Low-confidence extraction alert", desc: "When a parsed field falls below 0.75", on: true },
                    { label: "Reconciliation flag detected", desc: "When a discrepancy is found", on: true },
                    { label: "Tax computation updated", desc: "When new transactions affect your CGT", on: false },
                    { label: "Monthly ledger digest", desc: "Summary of activity at end of month", on: true },
                  ].map((n) => (
                    <div key={n.label} className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium">{n.label}</p>
                        <p className="text-xs" style={{ color: "var(--ink-3)" }}>{n.desc}</p>
                      </div>
                      <label className="relative inline-flex cursor-pointer items-center">
                        <input type="checkbox" defaultChecked={n.on} className="sr-only peer" />
                        <div
                          className="h-5 w-9 rounded-full peer-checked:after:translate-x-4 after:absolute after:top-0.5 after:left-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform"
                          style={{
                            background: n.on ? "var(--color-accent)" : "var(--color-sheet)",
                          }}
                        />
                      </label>
                    </div>
                  ))}
                </div>
              </Panel>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
