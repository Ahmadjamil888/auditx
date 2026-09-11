import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart3,
  Bell,
  BookOpen,
  ChevronDown,
  CreditCard,
  FileText,
  GitFork,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeft,
  Settings,
  Shield,
  Sparkles,
  Upload,
  User,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { Logo, LogoMark } from "@/components/brand/Logo";
import { useAuth } from "@/lib/auth-context";
import { CommandBarProvider, useCommandBar } from "@/components/intelligence/AuditXCommandBar";
import { useNotifications } from "@/lib/data-hooks";

const primaryItem = { label: "Ask AuditX", icon: Sparkles, to: "/app/parser" } as const;

const navGroups = [
  {
    title: "Workspace",
    items: [
      { label: "Portfolio", icon: LayoutDashboard, to: "/app/overview" },
      { label: "Ledger", icon: BookOpen, to: "/app/ledger" },
      { label: "Exceptions", icon: GitFork, to: "/app/reconciliation" },
      { label: "Tax Center", icon: BarChart3, to: "/app/tax" },
      { label: "Reports", icon: FileText, to: "/app/reports" },
      { label: "Audit Trail", icon: Shield, to: "/app/audit-trail" },
    ],
  },
  {
    title: "Account",
    items: [
      { label: "Settings", icon: Settings, to: "/app/settings" },
      { label: "Billing", icon: CreditCard, to: "/app/billing" },
    ],
  },
] as const;

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

function NotificationDot({ userId }: { userId: string | undefined }) {
  const { data: notifications = [] } = useNotifications(userId);
  const unread = notifications.filter((n) => !n.read).length;
  if (!unread) return null;
  return (
    <span
      className="absolute right-2 top-2 flex size-2 items-center justify-center rounded-full text-[8px] font-bold text-white"
      style={{ background: "var(--bad)" }}
    />
  );
}

function InnerShell({ children }: { children: ReactNode }) {
  const { user, profile, signOut } = useAuth();
  const nav = useNavigate();
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const { setOpen: setCommandBarOpen } = useCommandBar();

  const [expanded, setExpanded] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  async function handleSignOut() {
    await signOut();
    nav({ to: "/" });
  }

  const displayName = profile?.full_name || user?.email?.split("@")[0] || "User";
  const orgName = profile?.org_name || "My Organisation";
  const plan = profile?.plan || "free";
  const initials = displayName.charAt(0).toUpperCase();
  const avatarUrl = (profile?.avatar_url || user?.user_metadata?.["avatar_url"]) as string | undefined;

  const isActive = (to: string) => currentPath === to || currentPath.startsWith(to + "/");

  function SidebarContent({ collapsed, onClose }: { collapsed: boolean; onClose?: () => void }) {
    return (
      <div className="flex h-full flex-col">
        <div className={collapsed ? "flex flex-col items-center gap-3 p-3" : "p-4"}>
          <button
            type="button"
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            onClick={() => (onClose ? onClose() : setExpanded((v) => !v))}
            className="flex w-full items-center justify-between rounded-xl px-1 py-1 transition-colors hover:bg-black/5"
          >
            {collapsed ? (
              <span
                className="flex size-9 items-center justify-center rounded-xl"
                style={{ background: "var(--color-accent)" }}
              >
                <LogoMark size={22} fill="#fff" />
              </span>
            ) : (
              <>
                <Logo />
                <PanelLeft size={16} strokeWidth={1.75} style={{ color: "var(--ink-3)" }} />
              </>
            )}
          </button>

          {!collapsed && (
            <div
              className="mt-4 flex items-center justify-between rounded-xl px-3 py-2.5 text-xs"
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

        <nav
          className={`flex-1 overflow-y-auto ${collapsed ? "flex flex-col items-center gap-1 px-3" : "space-y-4 px-4"}`}
        >
          <NavItem
            {...primaryItem}
            collapsed={collapsed}
            accent
            active={isActive(primaryItem.to)}
            onClick={onClose}
          />

          {navGroups.map((group) => (
            <div key={group.title} className={collapsed ? "flex flex-col items-center gap-1" : "space-y-0.5"}>
              {!collapsed && (
                <p
                  className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: "var(--ink-3)" }}
                >
                  {group.title}
                </p>
              )}
              {collapsed && <div className="my-1 h-px w-6" style={{ background: "var(--hairline)" }} />}
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

        <div className="relative p-3">
          <button
            type="button"
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            title={displayName}
            className={`flex w-full items-center rounded-xl transition-colors hover:bg-black/5 ${
              collapsed ? "justify-center py-2" : "gap-3 px-3 py-2.5"
            }`}
          >
            <div
              className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-semibold"
              style={{ background: avatarUrl ? "transparent" : "var(--color-accent)", color: "#fff" }}
            >
              {avatarUrl ? <img src={avatarUrl} alt={displayName} className="size-full object-cover" /> : initials}
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

          <AnimatePresence>
            {userMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.97 }}
                transition={{ duration: 0.18 }}
                className="absolute bottom-full left-3 z-50 mb-1 w-56 overflow-hidden rounded-2xl bg-white p-2"
                style={{ border: "1px solid var(--hairline)", boxShadow: "var(--shadow-hover)" }}
              >
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

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{
        background: "var(--color-login-bg)",
        fontFamily: "var(--font-body)",
        color: "var(--color-text)",
      }}
    >
      <motion.aside
        animate={{ width: expanded ? 248 : 64 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className="hidden shrink-0 overflow-hidden lg:flex lg:flex-col"
        style={{ background: "#fff", borderRight: "1px solid var(--hairline)" }}
      >
        <SidebarContent collapsed={!expanded} />
      </motion.aside>

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
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              <SidebarContent collapsed={false} onClose={() => setMobileOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header
          className="flex shrink-0 items-center gap-3 border-b px-4 py-3 sm:px-6"
          style={{ background: "#fff", borderColor: "var(--hairline)" }}
        >
          <button type="button" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
            <Menu size={22} strokeWidth={1.75} />
          </button>

          <button
            type="button"
            className="hidden flex-1 items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm sm:flex"
            style={{ borderColor: "var(--hairline)", maxWidth: 380 }}
            onClick={() => setCommandBarOpen(true)}
          >
            <Sparkles size={15} strokeWidth={1.75} style={{ color: "var(--color-accent)" }} />
            <span style={{ color: "var(--ink-3)" }}>Ask AuditX anything about your finances…</span>
            <kbd
              className="ml-auto rounded px-2 py-0.5 text-xs"
              style={{ background: "rgba(25,40,55,0.06)", color: "var(--ink-3)" }}
            >
              ⌘K
            </kbd>
          </button>

          <div className="ml-auto flex items-center gap-2">
            <Link
              to="/app/parser"
              className="hidden items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold text-white sm:flex"
              style={{ background: "var(--color-accent)", boxShadow: "0 4px 24px rgba(115,66,226,0.28)" }}
            >
              <Upload size={14} strokeWidth={2} />
              Upload statement
            </Link>

            <div className="relative">
              <button
                type="button"
                className="relative flex size-9 items-center justify-center rounded-xl border transition-colors hover:bg-black/5"
                style={{ borderColor: "var(--hairline)" }}
                aria-label="Notifications"
              >
                <Bell size={18} strokeWidth={1.75} />
                <NotificationDot userId={user?.id} />
              </button>
            </div>
          </div>
        </header>

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
