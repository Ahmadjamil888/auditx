import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart3,
  BookOpen,
  ChevronDown,
  CreditCard,
  FileText,
  GitFork,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeft,
  PanelRight,
  Settings,
  Shield,
  Sparkles,
  Upload,
  User,
  X,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Logo, LogoMark } from "@/components/brand/Logo";
import { useAuth } from "@/lib/auth-context";
import { CommandBarProvider, useCommandBar } from "@/components/intelligence/AuditXCommandBar";
import { NotificationBell, NotificationCenter } from "@/components/notifications/NotificationCenter";

// ── Persist sidebar state across page loads ───────────────────────────────────
const SIDEBAR_KEY = "auditx.sidebar.expanded";
function readSidebarPref(): boolean {
  if (typeof window === "undefined") return false;
  try { return localStorage.getItem(SIDEBAR_KEY) === "true"; } catch { return false; }
}
function writeSidebarPref(v: boolean) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(SIDEBAR_KEY, String(v)); } catch { /* ignore */ }
}

// ── Nav structure ─────────────────────────────────────────────────────────────

const primaryItem = { label: "Ask AuditX", icon: Sparkles, to: "/app/parser" } as const;

const navGroups = [
  {
    title: "Workspace",
    items: [
      { label: "Portfolio",    icon: LayoutDashboard, to: "/app/overview"       },
      { label: "Ledger",       icon: BookOpen,        to: "/app/ledger"          },
      { label: "Exceptions",   icon: GitFork,         to: "/app/reconciliation"  },
      { label: "Tax Center",   icon: BarChart3,       to: "/app/tax"             },
      { label: "Reports",      icon: FileText,        to: "/app/reports"         },
      { label: "Audit Trail",  icon: Shield,          to: "/app/audit-trail"     },
    ],
  },
  {
    title: "Account",
    items: [
      { label: "Settings", icon: Settings,    to: "/app/settings" },
      { label: "Billing",  icon: CreditCard,  to: "/app/billing"  },
    ],
  },
] as const;

// ── NavItem ───────────────────────────────────────────────────────────────────

function NavItem({
  label,
  icon: Icon,
  to,
  active,
  collapsed,
  accent,
  onClick,
}: {
  label: string;
  icon: typeof LayoutDashboard;
  to: string;
  active: boolean;
  collapsed: boolean;
  accent?: boolean;
  onClick?: (() => void) | undefined;
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      title={label}
      className={`flex items-center rounded-xl text-sm font-medium transition-all ${
        collapsed ? "size-10 justify-center" : "gap-3 px-3 py-2.5"
      }`}
      style={{
        background: active || accent ? "rgba(115,66,226,0.1)" : "transparent",
        color: active || accent ? "var(--color-accent)" : "var(--ink-2)",
      }}
    >
      <Icon size={18} strokeWidth={1.75} />
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}

// ── InnerShell ────────────────────────────────────────────────────────────────

function InnerShell({ children }: { children: ReactNode }) {
  const { user, profile, signOut } = useAuth();
  const nav          = useNavigate();
  const routerState  = useRouterState();
  const currentPath  = routerState.location.pathname;
  const { setOpen: setCommandBarOpen } = useCommandBar();

  // Desktop sidebar: expanded state persisted in localStorage
  const [expanded,     setExpanded]     = useState(() => readSidebarPref());
  const [mobileOpen,   setMobileOpen]   = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notifOpen,    setNotifOpen]    = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Persist preference
  useEffect(() => { writeSidebarPref(expanded); }, [expanded]);

  // Close user menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function handleSignOut() {
    await signOut();
    setUserMenuOpen(false);
    nav({ to: "/" });
  }

  const displayName = profile?.full_name || user?.email?.split("@")[0] || "User";
  const orgName     = profile?.org_name  || "My Organisation";
  const plan        = profile?.plan      || "free";
  const initials    = displayName.charAt(0).toUpperCase();
  const avatarUrl   = (profile?.avatar_url || user?.user_metadata?.["avatar_url"]) as string | undefined;

  const isActive = (to: string) => currentPath === to || currentPath.startsWith(to + "/");

  // ── SidebarContent — shared by desktop and mobile ──────────────────────────
  function SidebarContent({
    collapsed,
    onClose,
  }: {
    collapsed: boolean;
    onClose?: () => void;
  }) {
    return (
      <div className="flex h-full flex-col">
        {/* ── Logo + toggle ────────────────────────────────────────────────── */}
        <div className={collapsed ? "flex flex-col items-center gap-3 p-3" : "p-4"}>
          <div className="flex w-full items-center justify-between">
            {collapsed ? (
              /* When collapsed: just the logomark, clicking it expands */
              <button
                type="button"
                aria-label="Expand navigation"
                onClick={() => (onClose ? onClose() : setExpanded(true))}
                className="flex size-9 items-center justify-center rounded-xl transition-colors hover:bg-black/5"
                style={{ background: "var(--color-accent)" }}
              >
                <LogoMark size={20} fill="#fff" />
              </button>
            ) : (
              /* When expanded: logo on left, collapse button on right */
              <>
                <Link to="/app/parser" aria-label="AuditX home">
                  <Logo />
                </Link>
                <button
                  type="button"
                  aria-label="Collapse navigation"
                  onClick={() => setExpanded(false)}
                  className="flex size-8 items-center justify-center rounded-xl transition-colors hover:bg-black/5"
                  title="Collapse sidebar"
                >
                  <PanelLeft size={16} strokeWidth={1.75} style={{ color: "var(--ink-3)" }} />
                </button>
              </>
            )}
          </div>

          {/* Org badge — only when expanded */}
          {!collapsed && (
            <div
              className="mt-4 flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-xs"
              style={{ background: "rgba(25,40,55,0.04)", border: "1px solid var(--hairline)" }}
            >
              <div className="min-w-0">
                <p className="truncate font-semibold">{orgName}</p>
                <p style={{ color: "var(--ink-3)" }}>{plan.toUpperCase()} plan</p>
              </div>
              <ChevronDown size={14} strokeWidth={1.75} style={{ color: "var(--ink-3)" }} />
            </div>
          )}
        </div>

        {/* ── Nav links ─────────────────────────────────────────────────────── */}
        <nav
          className={`flex-1 overflow-y-auto ${
            collapsed ? "flex flex-col items-center gap-1 px-3" : "space-y-4 px-4"
          }`}
        >
          <NavItem
            {...primaryItem}
            collapsed={collapsed}
            accent
            active={isActive(primaryItem.to)}
            onClick={onClose}
          />

          {navGroups.map((group) => (
            <div
              key={group.title}
              className={collapsed ? "flex flex-col items-center gap-1" : "space-y-0.5"}
            >
              {!collapsed && (
                <p
                  className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: "var(--ink-3)" }}
                >
                  {group.title}
                </p>
              )}
              {collapsed && (
                <div className="my-1 h-px w-6" style={{ background: "var(--hairline)" }} />
              )}
              {group.items.map((item) => (
                <NavItem
                  key={item.label}
                  {...item}
                  collapsed={collapsed}
                  active={isActive(item.to)}
                  onClick={onClose}
                />
              ))}
            </div>
          ))}
        </nav>

        {/* ── User profile ──────────────────────────────────────────────────── */}
        <div ref={collapsed ? undefined : userMenuRef} className="relative p-3">
          {/* Profile button — when collapsed, clicking opens user menu ABOVE */}
          <button
            type="button"
            onClick={() => setUserMenuOpen((v) => !v)}
            title={displayName}
            className={`flex w-full items-center rounded-xl transition-colors hover:bg-black/5 ${
              collapsed ? "justify-center py-2" : "gap-3 px-3 py-2.5"
            }`}
          >
            <div
              className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-semibold"
              style={{
                background: avatarUrl ? "transparent" : "var(--color-accent)",
                color: "#fff",
              }}
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt={displayName} className="size-full object-cover" />
              ) : (
                initials
              )}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1 text-left">
                <p className="truncate text-sm font-medium">{displayName}</p>
                <p className="truncate text-xs" style={{ color: "var(--ink-3)" }}>
                  {user?.email ?? ""}
                </p>
              </div>
            )}
          </button>

          {/* User menu — always shown when userMenuOpen, regardless of collapsed state */}
          <AnimatePresence>
            {userMenuOpen && (
              <motion.div
                ref={collapsed ? userMenuRef : undefined}
                initial={{ opacity: 0, y: 8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.97 }}
                transition={{ duration: 0.16 }}
                className="absolute bottom-full z-50 mb-1 overflow-hidden rounded-2xl bg-white p-2"
                style={{
                  border: "1px solid var(--hairline)",
                  boxShadow: "var(--shadow-hover)",
                  // When collapsed, anchor to left; when expanded, full-width
                  left: collapsed ? "4px" : "12px",
                  right: collapsed ? "4px" : "12px",
                  minWidth: 180,
                }}
              >
                {/* User info row at top */}
                <div className="flex items-center gap-2.5 px-3 py-2 mb-1">
                  <div
                    className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-semibold"
                    style={{ background: avatarUrl ? "transparent" : "var(--color-accent)", color: "#fff" }}
                  >
                    {avatarUrl ? (
                      <img src={avatarUrl} alt={displayName} className="size-full object-cover" />
                    ) : (
                      initials
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{displayName}</p>
                    <p className="truncate text-xs" style={{ color: "var(--ink-3)" }}>
                      {user?.email ?? ""}
                    </p>
                  </div>
                </div>
                <div className="my-1 h-px" style={{ background: "var(--hairline)" }} />
                <Link
                  to="/app/settings"
                  onClick={() => setUserMenuOpen(false)}
                  className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors hover:bg-black/5"
                >
                  <User size={16} strokeWidth={1.75} />
                  Account settings
                </Link>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors hover:bg-black/5"
                  style={{ color: "var(--bad)" }}
                >
                  <LogOut size={16} strokeWidth={1.75} />
                  Sign out
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    );
  }

  // ── Layout ─────────────────────────────────────────────────────────────────
  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{
        background: "var(--color-login-bg)",
        fontFamily: "var(--font-body)",
        color: "var(--color-text)",
      }}
    >
      {/* Desktop sidebar */}
      <motion.aside
        animate={{ width: expanded ? 248 : 64 }}
        transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
        className="relative hidden shrink-0 overflow-hidden lg:flex lg:flex-col"
        style={{ background: "#fff", borderRight: "1px solid var(--hairline)" }}
      >
        <SidebarContent collapsed={!expanded} />

        {/* Expand tab — shown only when sidebar is collapsed (on the right edge) */}
        {!expanded && (
          <button
            type="button"
            aria-label="Expand navigation"
            onClick={() => setExpanded(true)}
            title="Expand sidebar"
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-10 flex size-5 items-center justify-center rounded-full border bg-white shadow-sm transition-shadow hover:shadow-md"
            style={{ borderColor: "var(--hairline)" }}
          >
            <PanelRight size={11} strokeWidth={2} style={{ color: "var(--ink-3)" }} />
          </button>
        )}
      </motion.aside>

      {/* Mobile overlay + drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-40 lg:hidden"
              style={{ background: "rgba(25,40,55,0.35)", backdropFilter: "blur(4px)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              className="fixed left-0 top-0 z-50 h-full w-72 overflow-hidden bg-white shadow-2xl lg:hidden"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
            >
              <SidebarContent collapsed={false} onClose={() => setMobileOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top header */}
        <header
          className="flex shrink-0 items-center gap-3 border-b px-4 py-3 sm:px-6"
          style={{ background: "#fff", borderColor: "var(--hairline)" }}
        >
          {/* Mobile hamburger */}
          <button
            type="button"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <Menu size={22} strokeWidth={1.75} />
          </button>

          {/* Command bar trigger */}
          <button
            type="button"
            className="hidden flex-1 items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm sm:flex"
            style={{ borderColor: "var(--hairline)", maxWidth: 380 }}
            onClick={() => setCommandBarOpen(true)}
          >
            <Sparkles
              size={15}
              strokeWidth={1.75}
              style={{ color: "var(--color-accent)" }}
            />
            <span style={{ color: "var(--ink-3)" }}>Ask AuditX anything…</span>
            <kbd
              className="ml-auto rounded px-2 py-0.5 text-xs"
              style={{ background: "rgba(25,40,55,0.06)", color: "var(--ink-3)" }}
            >
              ⌘K
            </kbd>
          </button>

          <div className="ml-auto flex items-center gap-2">
            {/* Upload shortcut */}
            <Link
              to="/app/parser"
              className="hidden items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold text-white sm:flex"
              style={{
                background: "var(--color-accent)",
                boxShadow: "0 4px 24px rgba(115,66,226,0.28)",
              }}
            >
              <Upload size={14} strokeWidth={2} />
              Upload statement
            </Link>

            {/* Notification bell */}
            <div className="relative">
              <NotificationBell userId={user?.id} onClick={() => setNotifOpen(true)} />
              <NotificationCenter open={notifOpen} onClose={() => setNotifOpen(false)} />
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <CommandBarProvider>
      <InnerShell>{children}</InnerShell>
    </CommandBarProvider>
  );
}
