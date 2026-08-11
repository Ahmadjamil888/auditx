import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  Bell,
  Building2,
  CreditCard,
  Key,
  Loader2,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Btn, Panel } from "@/components/kit";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { setNotificationPrefs } from "@/lib/notifications";
import { useBrokerConnections, useConnectBroker } from "@/lib/data-hooks";

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
  const { profile, user, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("org");
  const [orgName, setOrgName] = useState(profile?.org_name ?? "My Organisation");
  const [jurisdiction, setJurisdiction] = useState(profile?.jurisdiction ?? "PSX");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [connectingBroker, setConnectingBroker] = useState(false);
  const [brokerFormOpen, setBrokerFormOpen] = useState(false);
  const [brokerForm, setBrokerForm] = useState({
    name: "",
    broker_name: "",
    currency: "PKR",
    exchange: "PSX",
    external_ref: "",
  });
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deletingOrg, setDeletingOrg] = useState(false);

  const { data: brokerData } = useBrokerConnections(profile?.org_id);
  const connectBrokerMutation = useConnectBroker();
  const deleteBrokerMutation = useDeleteBroker();
  const deleteOrgMutation = useDeleteOrganization();
  const brokers = (brokerData || []).map((b) => ({
    id: b.id,
    name: b.name,
    type: b.broker_name,
  }));


  const [notifications, setNotifications] = useState({
    lowConfidenceAlert: true,
    reconciliationFlag: true,
    taxComputationUpdate: false,
    monthlyDigest: true,
  });

  const displayName = profile?.full_name || user?.email?.split("@")[0] || "User";
  const initials = displayName.charAt(0).toUpperCase();
  const avatarUrl = profile?.avatar_url || user?.user_metadata?.["avatar_url"] as string | undefined;

  async function save() {
    if (!profile?.org_id) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from("organizations")
        .update({ 
          name: orgName,
          jurisdiction_default: jurisdiction 
        })
        .eq("id", profile.org_id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["profile"] });
      
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error("Failed to save settings:", error);
      toast.error("Failed to save organization settings");
    } finally {
      setSaving(false);
    }
  }

  async function addBroker() {
    if (!profile?.org_id) return;
    if (!brokerForm.broker_name.trim()) {
      toast.error("Enter the broker name");
      return;
    }
    if (!withinLimit(profile.plan, "brokerAccounts", brokers.length)) {
      toast.error(`Your ${profile.plan.toUpperCase()} plan allows ${limitLabel(profile.plan, "brokerAccounts")} broker account(s).`, {
        description: "Upgrade to connect more brokers.",
      });
      return;
    }
    setConnectingBroker(true);
    try {
      await connectBrokerMutation.mutateAsync({
        orgId: profile.org_id,
        broker: {
          name: brokerForm.name.trim() || `${brokerForm.broker_name.trim()} Account`,
          broker_name: brokerForm.broker_name.trim(),
          currency: brokerForm.currency,
          exchange: brokerForm.exchange,
          external_ref: brokerForm.external_ref.trim() || undefined,
        },
      });
      toast.success("Broker account added");
      setBrokerForm({ name: "", broker_name: "", currency: "PKR", exchange: "PSX", external_ref: "" });
      setBrokerFormOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add broker");
    } finally {
      setConnectingBroker(false);
    }
  }

  async function removeBroker(id: string) {
    if (!profile?.org_id) return;
    try {
      await deleteBrokerMutation.mutateAsync({ id, orgId: profile.org_id });
      toast.success("Broker account removed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove broker");
    }
  }

  async function deleteOrganisation() {
    if (!profile?.org_id) return;
    if (deleteConfirm !== profile.org_name) {
      toast.error("Type the organisation name exactly to confirm");
      return;
    }
    setDeletingOrg(true);
    try {
      await deleteOrgMutation.mutateAsync({ orgId: profile.org_id });
      toast.success("Organisation deleted");
      await signOut();
      navigate({ to: "/" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete organisation");
    } finally {
      setDeletingOrg(false);
    }
  }


  async function updateNotificationSettings() {
    if (!profile?.org_id) return;
    
    try {
      const { error } = await supabase
        .from("org_settings" as any)
        .upsert({
          org_id: profile.org_id,
          notification_preferences: notifications,
        });

      if (error) throw error;
      
      queryClient.invalidateQueries({ queryKey: ["org_settings"] });
      toast.success("Notification preferences updated");
    } catch (error) {
      console.error("Failed to update notification settings:", error);
    }
  }

  function handleNotificationChange(key: keyof typeof notifications, value: boolean) {
    const newPrefs = { ...notifications, [key]: value };
    setNotifications(newPrefs);
    setNotificationPrefs(newPrefs);
    updateNotificationSettings();
    
    if (value) {
      const messages: Record<keyof typeof notifications, string> = {
        lowConfidenceAlert: "Low-confidence extraction alerts enabled",
        reconciliationFlag: "Reconciliation flag notifications enabled", 
        taxComputationUpdate: "Tax computation updates enabled",
        monthlyDigest: "Monthly ledger digest enabled",
      };
      toast.success(messages[key]);
    }
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
                      value={jurisdiction}
                      onChange={(e) => setJurisdiction(e.target.value)}
                      className="w-full rounded-[10px] border bg-white px-4 py-3 text-sm outline-none"
                      style={{ borderColor: "var(--hairline)", maxWidth: 400 }}
                    >
                      <option value="PSX">PSX — Pakistan</option>
                      <option value="NSE">NSE — India</option>
                    </select>
                  </div>
                  <Btn onClick={save} variant="primary" disabled={saving}>
                    {saving ? (
                      <>
                        <Loader2 size={15} strokeWidth={1.75} className="animate-spin" />
                        Saving...
                      </>
                    ) : saved ? "Saved ✓" : "Save changes"}
                  </Btn>
                </div>
              </Panel>

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
                    const isActive = jurisdiction === p.key;
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
                  <Btn variant="secondary" onClick={addBroker} disabled={connectingBroker}>
                    {connectingBroker ? (
                      <>
                        <Loader2 size={15} strokeWidth={1.75} className="animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      <>
                        <Plus size={15} strokeWidth={1.75} />
                        Add broker
                      </>
                    )}
                  </Btn>
                </div>
                {brokers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-2">
                    <Key size={28} strokeWidth={1.5} style={{ color: "var(--ink-3)" }} />
                    <p className="text-sm font-medium">No broker accounts added</p>
                    <p className="text-xs text-center" style={{ color: "var(--ink-3)" }}>
                      Broker names are inferred automatically when you parse statements.
                      <br />Use "Add broker" to link an account manually.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {brokers.map((broker) => (
                      <div
                        key={broker.id}
                        className="flex items-center justify-between rounded-xl px-4 py-3"
                        style={{ background: "var(--color-login-bg)" }}
                      >
                        <div>
                          <p className="text-sm font-medium">{broker.name}</p>
                          <p className="text-xs" style={{ color: "var(--ink-3)" }}>{broker.type}</p>
                        </div>
                        <span
                          className="rounded-full px-2.5 py-1 text-xs font-medium"
                          style={{ background: "rgba(31,157,99,0.1)", color: "var(--ok)" }}
                        >
                          Connected
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </motion.div>
          )}

          {tab === "team" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Panel>
                <div className="mb-4 flex items-center justify-between">
                  <p className="text-sm font-semibold">Team Members</p>
                  <Btn variant="secondary" disabled>
                    <Plus size={15} strokeWidth={1.75} />
                    Invite member
                  </Btn>
                </div>
                <div className="space-y-3">
                  <div
                    className="flex items-center gap-3 rounded-xl px-4 py-3"
                    style={{ background: "var(--color-login-bg)" }}
                  >
                    <div
                      className="flex size-8 shrink-0 items-center justify-center rounded-full overflow-hidden text-xs font-semibold"
                      style={{ background: avatarUrl ? "transparent" : "var(--color-accent)", color: "#fff" }}
                    >
                      {avatarUrl ? (
                        <img 
                          src={avatarUrl} 
                          alt={displayName}
                          className="size-full object-cover"
                        />
                      ) : (
                        initials
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{displayName}</p>
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
                    Team invitations require additional setup. Contact support to enable team collaboration.
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
                    { key: "lowConfidenceAlert" as const, label: "Low-confidence extraction alert", desc: "When a parsed field falls below 0.75" },
                    { key: "reconciliationFlag" as const, label: "Reconciliation flag detected", desc: "When a discrepancy is found" },
                    { key: "taxComputationUpdate" as const, label: "Tax computation update", desc: "When new gains are computed" },
                    { key: "monthlyDigest" as const, label: "Monthly ledger digest", desc: "Summary of your monthy performance" },
                  ].map((n) => (
                    <div key={n.key} className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{n.label}</p>
                        <p className="text-xs" style={{ color: "var(--ink-3)" }}>{n.desc}</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={notifications[n.key]}
                        onChange={(e) => handleNotificationChange(n.key, e.target.checked)}
                        className="size-4 rounded accent-[var(--color-accent)]"
                      />
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
