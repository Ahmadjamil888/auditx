// ─── Connected Sources Settings Tab ──────────────────────────────────────────
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ExternalLink,
  Loader2,
  Pause,
  Play,
  Plus,
  Settings2,
  Sheet,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  useConnectedSources,
  useUpdateSourceRules,
  usePauseSource,
  useDeleteSource,
  useOrgFeatureFlags,
  useOrgPolicyConfig,
  useUpdateOrgPolicy,
} from "@/lib/data-hooks";
import type { ConnectedSource, SourceRules } from "@/lib/connected-sources";
import { startGoogleOAuth } from "@/lib/connected-sources";

// ── Source type icons / labels ────────────────────────────────────────────────
const SOURCE_META: Record<string, { label: string; icon: typeof Sheet }> = {
  google_sheets: { label: "Google Sheets", icon: Sheet },
  onedrive:      { label: "OneDrive / SharePoint", icon: Sheet },
  email_inbox:   { label: "Email Inbox", icon: Sheet },
  folder:        { label: "Watched Folder", icon: Sheet },
};

// ── Rules editor ──────────────────────────────────────────────────────────────
function RulesEditor({
  sourceId,
  orgId,
  initial,
  onClose,
}: {
  sourceId: string;
  orgId:    string;
  initial:  SourceRules;
  onClose:  () => void;
}) {
  const update = useUpdateSourceRules();
  const [rules, setRules] = useState<SourceRules>({ ...initial });

  async function save() {
    try {
      await update.mutateAsync({ sourceId, orgId, rules });
      toast.success("Rules saved");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-3 overflow-hidden rounded-xl p-4"
      style={{ background: "rgba(25,40,55,0.03)", border: "1px solid var(--hairline)" }}
    >
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ink-3)" }}>
        Source rules
      </p>

      <div className="space-y-3">
        {/* Auto-import toggle */}
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>Auto-import on change</span>
          <input
            type="checkbox"
            checked={rules.auto_import ?? true}
            onChange={(e) => setRules((r) => ({ ...r, auto_import: e.target.checked }))}
            className="h-4 w-4"
          />
        </label>

        {/* Confidence threshold */}
        <div>
          <label className="mb-1 block text-xs" style={{ color: "var(--ink-2)" }}>
            Confidence threshold (auto = {Math.round((rules.confidence_threshold_override ?? 0.9) * 100)}%)
          </label>
          <input
            type="range"
            min={0.5}
            max={1}
            step={0.05}
            value={rules.confidence_threshold_override ?? 0.9}
            onChange={(e) =>
              setRules((r) => ({ ...r, confidence_threshold_override: parseFloat(e.target.value) }))
            }
            className="w-full"
          />
        </div>

        {/* Closed-period lock */}
        <div>
          <label className="mb-1 block text-xs" style={{ color: "var(--ink-2)" }}>
            Never overwrite records before
          </label>
          <input
            type="date"
            value={rules.never_overwrite_before_date ?? ""}
            onChange={(e) =>
              setRules((r) => ({ ...r, never_overwrite_before_date: e.target.value || undefined }))
            }
            className="w-full rounded-lg border px-3 py-1.5 text-sm"
            style={{ borderColor: "var(--hairline)" }}
          />
        </div>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border px-3 py-1.5 text-xs font-medium hover:bg-black/5"
          style={{ borderColor: "var(--hairline)" }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={update.isPending}
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--color-accent)" }}
        >
          {update.isPending && <Loader2 size={11} className="animate-spin" />}
          Save
        </button>
      </div>
    </motion.div>
  );
}

// ── Source row ────────────────────────────────────────────────────────────────
function SourceRow({ source, orgId }: { source: ConnectedSource; orgId: string }) {
  const pauseMutation  = usePauseSource();
  const deleteMutation = useDeleteSource();
  const [editingRules, setEditingRules] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const meta = SOURCE_META[source.source_type] ?? SOURCE_META["folder"]!;
  const Icon = meta.icon;

  async function togglePause() {
    try {
      await pauseMutation.mutateAsync({ sourceId: source.id, orgId, paused: !source.paused });
      toast.success(source.paused ? "Source resumed" : "Source paused");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function handleDelete() {
    try {
      await deleteMutation.mutateAsync({ sourceId: source.id, orgId });
      toast.success("Source removed");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div
      className="overflow-hidden rounded-2xl"
      style={{ border: "1px solid var(--hairline)", background: source.paused ? "rgba(25,40,55,0.02)" : "#fff" }}
    >
      <div className="flex items-start gap-3 p-4">
        <span
          className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl"
          style={{ background: "rgba(115,66,226,0.08)" }}
        >
          <Icon size={16} strokeWidth={1.75} style={{ color: "var(--color-accent)" }} />
        </span>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">{source.display_name}</p>
          <p className="text-xs" style={{ color: "var(--ink-3)" }}>
            {meta.label}
            {source.last_synced_at
              ? ` · Last synced ${new Date(source.last_synced_at).toLocaleString()}`
              : " · Never synced"}
          </p>
        </div>

        {/* Status pill */}
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{
            background: source.paused ? "rgba(201,138,26,0.1)" : "rgba(31,157,99,0.1)",
            color:      source.paused ? "var(--warn)" : "var(--ok)",
          }}
        >
          {source.paused ? "Paused" : "Active"}
        </span>

        {/* Actions */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setEditingRules((v) => !v)}
            className="flex size-8 items-center justify-center rounded-xl border transition-colors hover:bg-black/5"
            style={{ borderColor: "var(--hairline)" }}
            title="Edit rules"
          >
            <Settings2 size={13} strokeWidth={1.75} style={{ color: "var(--ink-3)" }} />
          </button>

          <button
            type="button"
            onClick={() => void togglePause()}
            disabled={pauseMutation.isPending}
            className="flex size-8 items-center justify-center rounded-xl border transition-colors hover:bg-black/5 disabled:opacity-40"
            style={{ borderColor: "var(--hairline)" }}
            title={source.paused ? "Resume" : "Pause"}
          >
            {pauseMutation.isPending
              ? <Loader2 size={13} className="animate-spin" style={{ color: "var(--ink-3)" }} />
              : source.paused
              ? <Play size={13} strokeWidth={1.75} style={{ color: "var(--ok)" }} />
              : <Pause size={13} strokeWidth={1.75} style={{ color: "var(--warn)" }} />
            }
          </button>

          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="flex size-8 items-center justify-center rounded-xl border transition-colors hover:bg-black/5"
              style={{ borderColor: "var(--hairline)" }}
              title="Remove source"
            >
              <Trash2 size={13} strokeWidth={1.75} style={{ color: "var(--bad)" }} />
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={deleteMutation.isPending}
                className="rounded-full bg-red-500 px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
              >
                {deleteMutation.isPending ? <Loader2 size={10} className="animate-spin inline" /> : "Confirm"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="rounded-full border px-2.5 py-1 text-[11px] font-medium hover:bg-black/5"
                style={{ borderColor: "var(--hairline)" }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {editingRules && (
        <div className="px-4 pb-4">
          <RulesEditor
            sourceId={source.id}
            orgId={orgId}
            initial={source.rules}
            onClose={() => setEditingRules(false)}
          />
        </div>
      )}
    </div>
  );
}

// ── Policy config section ─────────────────────────────────────────────────────
function AgentPolicySection({ orgId }: { orgId: string }) {
  const { data: cfg }   = useOrgPolicyConfig(orgId);
  const updatePolicy    = useUpdateOrgPolicy();
  const [saving, setSaving] = useState(false);

  const [autoConf, setAutoConf]     = useState<string>("");
  const [notifyConf, setNotifyConf] = useState<string>("");

  const currentAutoConf   = autoConf   !== "" ? parseFloat(autoConf)   : Number(cfg?.confidence_threshold_auto ?? 0.9);
  const currentNotifyConf = notifyConf !== "" ? parseFloat(notifyConf) : Number(cfg?.confidence_threshold_notify ?? 0.75);

  async function savePolicy() {
    setSaving(true);
    try {
      await updatePolicy.mutateAsync({
        orgId,
        updates: {
          confidence_threshold_auto:   currentAutoConf,
          confidence_threshold_notify: currentNotifyConf,
        },
      });
      toast.success("Policy saved");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="mt-6 overflow-hidden rounded-2xl p-5"
      style={{ border: "1px solid var(--hairline)", background: "#fff" }}
    >
      <p className="mb-4 text-sm font-semibold">Agent policy</p>

      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium" style={{ color: "var(--ink-2)" }}>
            Auto-apply threshold — {Math.round(currentAutoConf * 100)}%
          </label>
          <input
            type="range" min={0.7} max={1} step={0.01}
            value={currentAutoConf}
            onChange={(e) => setAutoConf(e.target.value)}
            className="w-full"
          />
          <p className="mt-0.5 text-[11px]" style={{ color: "var(--ink-3)" }}>
            Actions above this confidence apply automatically.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium" style={{ color: "var(--ink-2)" }}>
            Notify threshold — {Math.round(currentNotifyConf * 100)}%
          </label>
          <input
            type="range" min={0.5} max={0.95} step={0.01}
            value={currentNotifyConf}
            onChange={(e) => setNotifyConf(e.target.value)}
            className="w-full"
          />
          <p className="mt-0.5 text-[11px]" style={{ color: "var(--ink-3)" }}>
            Actions between this and the auto threshold are applied with a notification.
          </p>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={() => void savePolicy()}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--color-accent)" }}
        >
          {saving && <Loader2 size={11} className="animate-spin" />}
          Save policy
        </button>
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export function ConnectedSourcesTab({ orgId }: { orgId: string }) {
  const { data: flags }   = useOrgFeatureFlags(orgId || undefined);
  const { data: sources, isLoading } = useConnectedSources(orgId || undefined);
  const [connecting, setConnecting] = useState(false);

  const autonomousEnabled = flags?.autonomous_agent === true;

  if (!autonomousEnabled) {
    return (
      <div
        className="flex flex-col items-center justify-center rounded-2xl py-16 text-center"
        style={{ border: "1px dashed var(--hairline)" }}
      >
        <AlertTriangle size={28} style={{ color: "var(--warn)" }} />
        <p className="mt-3 text-sm font-semibold">Autonomous mode not available on your plan</p>
        <p className="mt-1 text-xs max-w-xs" style={{ color: "var(--ink-3)" }}>
          Upgrade to Pro to connect Google Sheets and OneDrive sources and let AuditX monitor them automatically.
        </p>
        <a
          href="/app/billing"
          className="mt-4 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold text-white"
          style={{ background: "var(--color-accent)" }}
        >
          <ExternalLink size={12} />
          Upgrade to Pro
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Add source buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => { setConnecting(true); startGoogleOAuth(orgId); }}
          disabled={connecting}
          className="flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors hover:bg-black/5 disabled:opacity-50"
          style={{ borderColor: "var(--hairline)" }}
        >
          {connecting
            ? <Loader2 size={14} className="animate-spin" />
            : <Plus size={14} />}
          Connect Google Sheet
        </button>

        <button
          type="button"
          disabled
          className="flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium opacity-40"
          style={{ borderColor: "var(--hairline)" }}
          title="OneDrive coming soon"
        >
          <Plus size={14} />
          Connect OneDrive (coming soon)
        </button>
      </div>

      {/* Source list */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 size={20} className="animate-spin" style={{ color: "var(--color-accent)" }} />
        </div>
      ) : !sources?.length ? (
        <div
          className="flex flex-col items-center justify-center rounded-2xl py-12 text-center"
          style={{ border: "1px dashed var(--hairline)" }}
        >
          <Sheet size={28} style={{ color: "var(--ink-3)" }} />
          <p className="mt-3 text-sm font-semibold">No connected sources</p>
          <p className="mt-1 text-xs" style={{ color: "var(--ink-3)" }}>
            Connect a Google Sheet or OneDrive file to start continuous monitoring.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {(sources ?? []).map((s) => (
            <SourceRow key={s.id} source={s} orgId={orgId} />
          ))}
        </div>
      )}

      {/* Agent policy */}
      <AgentPolicySection orgId={orgId} />
    </div>
  );
}
