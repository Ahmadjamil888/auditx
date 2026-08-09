import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart3,
  Bell,
  BookOpen,
  ChevronDown,
  CreditCard,
  FileSearch,
  FileText,
  GitFork,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  SearchIcon,
  Settings,
  Shield,
  User,
  X,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { Logo } from "@/components/brand/Logo";
import { useAuth } from "@/lib/auth-context";

const navItems = [
  { label: "Overview",       icon: LayoutDashboard, to: "/app/overview" },
  { label: "Ledger",         icon: BookOpen,         to: "/app/ledger" },
  { label: "Parser",         icon: FileSearch,       to: "/app/parser" },
  { label: "Reconciliation", icon: GitFork,          to: "/app/reconciliation" },
  { label: "Tax Center",     icon: BarChart3,        to: "/app/tax" },
  { label: "Audit Trail",    icon: Shield,           to: "/app/audit-trail" },
  { label: "Reports",        icon: FileText,         to: "/app/reports" },
  { label: "Settings",       icon: Settings,         to: "/app/settings" },
  { label: "Billing",        icon: CreditCard,       to: "/app/billing" },
] as const;

function NavItem({
  label,
  icon: Icon,
  to,
  active,
  onClick,
}: {
  label: string;
  icon: typeof LayoutDashboard;
  to: string;
  active: boolean;
  onClick?: (() => void) | undefined;
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all"
      style={{
        background: active ? "rgba(115,66,226,0.1)" : "transparent",
        color: active ? "var(--color-accent)" : "var(--ink-2)",
      }}
    >
      <Icon size={18} strokeWidth={1.75} style={{ color: active ? "var(--color-accent)" : "var(--ink-2)" }} />
      {label}
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, profile, signOut } = useAuth();
  const nav = useNavigate();
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  const [mobileOpen, setMobileOpen]   = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen]   = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  async function handleSignOut() {
    await signOut();
    nav({ to: "/" });
  }

  const displayName = profile?.full_name || user?.email?.split("@")[0] || "User";
  const orgName     = profile?.org_name || "My Organisation";
  const plan        = profile?.plan || "free";
  const initials    = displayName.charAt(0).toUpperCase();

  function SidebarContent({ onClose }: { onClose?: () => void }) {
    return (
      <div className="flex h-full flex-col">
        {/* Org header */}
        <div className="p-5">
          <Logo />
          <div
            className="mt-4 flex items-center justify-between rounded-xl px-3 py-2.5 text-xs"
            style={{ background: "rgba(25,40,55,0.04)", border: "1px solid var(--hairline)" }}
          >
            <div>
              <p className="font-semibold">{orgName}</p>
              <p style={{ color: "var(--ink-3)" }}>{plan.toUpperCase()} plan</p>
            </div>
            <ChevronDown size={14} strokeWidth={1.75} style={{ color: "var(--ink-3)" }} />
          </div>
        </div>

        <div className="mx-4 h-px" style={{ background: "var(--hairline)" }} />

        {/* Nav links */}
        <nav className="flex-1 overflow-y-auto p-4 space-y-0.5">
          {navItems.map((item) => (
            <NavItem
              key={item.label}
              {...item}
              active={currentPath === item.to || currentPath.startsWith(item.to + "/")}
              onClick={onClose}
            />
          ))}
        </nav>

        <div className="mx-4 h-px" style={{ background: "var(--hairline)" }} />

        {/* User avatar menu */}
        <div className="relative p-4">
          <button
            type="button"
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-black/5"
          >
            <div
              className="flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
              style={{ background: "var(--color-accent)", color: "#fff" }}
            >
              {initials}
            </div>
            <div className="min-w-0 flex-1 text-left">
              <p className="truncate text-sm font-medium">{displayName}</p>
              <p className="truncate text-xs" style={{ color: "var(--ink-3)" }}>
                {user?.email ?? ""}
              </p>
            </div>
            <ChevronDown size={14} strokeWidth={1.75} style={{ color: "var(--ink-3)" }} />
          </button>

          <AnimatePresence>
            {userMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.97 }}
                transition={{ duration: 0.18 }}
                className="absolute bottom-full left-4 right-4 mb-1 overflow-hidden rounded-2xl bg-white p-2"
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
      {/* Desktop sidebar */}
      <aside
        className="hidden w-60 shrink-0 overflow-hidden lg:flex lg:flex-col"
        style={{ background: "#fff", borderRight: "1px solid var(--hairline)" }}
      >
        <SidebarContent />
      </aside>

      {/* Mobile sidebar overlay */}
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
              className="fixed top-0 left-0 z-50 h-full w-60 overflow-hidden bg-white shadow-2xl lg:hidden"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            >
              <SidebarContent onClose={() => setMobileOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main content area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header
          className="flex shrink-0 items-center gap-3 border-b px-4 py-3 sm:px-6"
          style={{ background: "#fff", borderColor: "var(--hairline)" }}
        >
          <button
            type="button"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <Menu size={22} strokeWidth={1.75} />
          </button>

          {/* Search trigger */}
          <button
            type="button"
            className="flex flex-1 items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm"
            style={{ borderColor: "var(--hairline)", maxWidth: 380 }}
            onClick={() => setSearchOpen(true)}
          >
            <SearchIcon size={16} strokeWidth={1.75} style={{ color: "var(--ink-3)" }} />
            <span style={{ color: "var(--ink-3)" }}>Search transactions, tickers… (⌘K)</span>
          </button>

          <div className="ml-auto flex items-center gap-2">
            <Link
              to="/app/parser"
              className="hidden items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold text-white sm:flex"
              style={{ background: "var(--color-accent)", boxShadow: "0 4px 24px rgba(115,66,226,0.28)" }}
            >
              <Plus size={14} strokeWidth={2} />
              Upload document
            </Link>

            <button
              type="button"
              className="relative flex size-9 items-center justify-center rounded-xl border transition-colors hover:bg-black/5"
              style={{ borderColor: "var(--hairline)" }}
              aria-label="Notifications"
            >
              <Bell size={18} strokeWidth={1.75} />
              <span className="absolute right-2 top-2 size-2 rounded-full" style={{ background: "var(--bad)" }} />
            </button>
          </div>
        </header>

        {/* ⌘K search modal */}
        <AnimatePresence>
          {searchOpen && (
            <>
              <motion.div
                className="fixed inset-0 z-50"
                style={{ background: "rgba(25,40,55,0.4)", backdropFilter: "blur(4px)" }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSearchOpen(false)}
              />
              <motion.div
                className="fixed left-1/2 top-20 z-50 w-full max-w-lg -translate-x-1/2"
                initial={{ opacity: 0, y: -16, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -16, scale: 0.97 }}
                transition={{ duration: 0.22 }}
              >
                <div
                  className="mx-4 overflow-hidden rounded-2xl bg-white shadow-2xl"
                  style={{ border: "1px solid var(--hairline)" }}
                >
                  <div
                    className="flex items-center gap-3 border-b px-4 py-3.5"
                    style={{ borderColor: "var(--hairline)" }}
                  >
                    <SearchIcon size={18} strokeWidth={1.75} style={{ color: "var(--ink-3)" }} />
                    <input
                      autoFocus
                      type="text"
                      placeholder="Search transactions, tickers, reports…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="flex-1 text-sm outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setSearchOpen(false)}
                      style={{ color: "var(--ink-3)" }}
                    >
                      <X size={18} strokeWidth={1.75} />
                    </button>
                  </div>
                  <div className="p-2">
                    {navItems.map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => {
                          setSearchOpen(false);
                          nav({ to: item.to });
                        }}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition-colors hover:bg-black/5"
                        style={{ color: "var(--ink-2)" }}
                      >
                        <item.icon size={15} strokeWidth={1.75} style={{ color: "var(--ink-3)" }} />
                        Navigate to {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
