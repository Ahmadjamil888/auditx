// ─── AuditX Notification Center ──────────────────────────────────────────────
// Slide-in panel triggered by the bell icon in AppShell.
// Shows persistent notifications from Supabase + browser permission prompt.

import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  ChevronRight,
  Info,
  Loader2,
  Monitor,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { useNotifications, useMarkNotificationsRead } from "@/lib/data-hooks";
import { useBrowserNotifications } from "@/lib/notification-service";

// ── Severity icon ─────────────────────────────────────────────────────────────

function SeverityIcon({ severity }: { severity: string }) {
  switch (severity) {
    case "error":
      return <AlertCircle size={14} style={{ color: "var(--bad)", flexShrink: 0 }} />;
    case "warning":
      return <AlertCircle size={14} style={{ color: "var(--warn)", flexShrink: 0 }} />;
    case "success":
      return <CheckCircle2 size={14} style={{ color: "var(--ok)", flexShrink: 0 }} />;
    default:
      return <Info size={14} style={{ color: "var(--info)", flexShrink: 0 }} />;
  }
}

function severityDot(severity: string): string {
  switch (severity) {
    case "error":   return "var(--bad)";
    case "warning": return "var(--warn)";
    case "success": return "var(--ok)";
    default:        return "var(--info)";
  }
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Single notification row ───────────────────────────────────────────────────

function NotificationRow({
  n,
  onRead,
}: {
  n: { id: string; title: string; message: string; severity: string; read: boolean; link: string | null; created_at: string };
  onRead: (id: string) => void;
}) {
  const nav = useNavigate();

  function handleClick() {
    if (!n.read) onRead(n.id);
    if (n.link) {
      nav({ to: n.link as never });
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-black/5"
      style={{ opacity: n.read ? 0.6 : 1 }}
    >
      {/* Unread dot */}
      <span
        className="mt-1 size-2 shrink-0 rounded-full transition-opacity"
        style={{
          background: n.read ? "transparent" : severityDot(n.severity),
          border: n.read ? "1.5px solid var(--hairline)" : "none",
        }}
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-1.5">
          <SeverityIcon severity={n.severity} />
          <p className="text-xs font-semibold leading-snug" style={{ color: "var(--color-text)" }}>
            {n.title || n.message}
          </p>
        </div>
        {n.title && (
          <p className="mt-0.5 text-xs leading-relaxed" style={{ color: "var(--ink-2)" }}>
            {n.message}
          </p>
        )}
        <p className="mt-1 text-[10px]" style={{ color: "var(--ink-3)" }}>
          {relativeTime(n.created_at)}
        </p>
      </div>

      {n.link && (
        <ChevronRight size={13} className="mt-1 shrink-0" style={{ color: "var(--ink-3)" }} />
      )}
    </button>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function NotificationCenter({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { data: notifications = [], isLoading } = useNotifications(user?.id);
  const markRead = useMarkNotificationsRead();
  const { permission, request } = useBrowserNotifications();
  const panelRef = useRef<HTMLDivElement>(null);

  const unread = notifications.filter((n) => !n.read).length;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose]);

  function markOne(id: string) {
    if (!user?.id) return;
    markRead.mutate({ userId: user.id, id });
  }

  function markAll() {
    if (!user?.id) return;
    markRead.mutate({ userId: user.id });
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -8 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="fixed right-4 top-14 z-50 flex w-[360px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            style={{ border: "1px solid var(--hairline)", maxHeight: "calc(100vh - 80px)" }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between border-b px-4 py-3"
              style={{ borderColor: "var(--hairline)" }}
            >
              <div className="flex items-center gap-2">
                <Bell size={15} style={{ color: "var(--color-accent)" }} />
                <span className="text-sm font-bold">Notifications</span>
                {unread > 0 && (
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white"
                    style={{ background: "var(--bad)" }}
                  >
                    {unread}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {unread > 0 && (
                  <button
                    type="button"
                    onClick={markAll}
                    className="text-[11px] font-medium"
                    style={{ color: "var(--color-accent)" }}
                  >
                    Mark all read
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg p-1 transition-colors hover:bg-black/5"
                >
                  <X size={15} strokeWidth={1.75} style={{ color: "var(--ink-3)" }} />
                </button>
              </div>
            </div>

            {/* Browser notification prompt */}
            {permission === "default" && (
              <div
                className="flex items-center gap-3 border-b px-4 py-3"
                style={{ borderColor: "var(--hairline)", background: "rgba(115,66,226,0.04)" }}
              >
                <Monitor size={14} style={{ color: "var(--color-accent)", flexShrink: 0 }} />
                <p className="flex-1 text-xs" style={{ color: "var(--ink-2)" }}>
                  Get desktop alerts when AuditX completes tasks.
                </p>
                <button
                  type="button"
                  onClick={request}
                  className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold text-white"
                  style={{ background: "var(--color-accent)" }}
                >
                  Enable
                </button>
              </div>
            )}

            {/* Notification list */}
            <div className="flex-1 overflow-y-auto">
              {isLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 size={20} className="animate-spin" style={{ color: "var(--ink-3)" }} />
                </div>
              ) : notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                  <div
                    className="flex size-12 items-center justify-center rounded-2xl"
                    style={{ background: "rgba(115,66,226,0.08)" }}
                  >
                    <Sparkles size={20} style={{ color: "var(--color-accent)" }} />
                  </div>
                  <p className="text-sm font-medium">All clear</p>
                  <p className="text-xs" style={{ color: "var(--ink-3)" }}>
                    AuditX will notify you when something needs attention.
                  </p>
                </div>
              ) : (
                <div className="p-2">
                  {notifications.map((n) => (
                    <NotificationRow key={n.id} n={n} onRead={markOne} />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ── Bell button with unread badge ─────────────────────────────────────────────

export function NotificationBell({
  userId,
  onClick,
}: {
  userId: string | undefined;
  onClick: () => void;
}) {
  const { data: notifications = [] } = useNotifications(userId);
  const unread = notifications.filter((n) => !n.read).length;

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative flex size-9 items-center justify-center rounded-xl border transition-colors hover:bg-black/5"
      style={{ borderColor: "var(--hairline)" }}
      aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
    >
      <Bell size={18} strokeWidth={1.75} />
      {unread > 0 && (
        <span
          className="absolute right-1 top-1 flex min-w-[14px] items-center justify-center rounded-full px-[3px] text-[9px] font-bold text-white"
          style={{ background: "var(--bad)", lineHeight: "14px", height: "14px" }}
        >
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </button>
  );
}
