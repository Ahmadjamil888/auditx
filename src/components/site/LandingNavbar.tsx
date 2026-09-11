// ─── LandingNavbar — premium minimal top navigation for the home page ─────────

import { Link, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { Logo } from "@/components/brand/Logo";
import { useAuth } from "@/lib/auth-context";

const links = [
  { label: "Product",  to: "/how-it-works" },
  { label: "Pricing",  to: "/pricing" },
  { label: "Security", to: "/security" },
  { label: "News",     to: "/news" },
  { label: "Help",     to: "/help" },
] as const;

export function LandingNavbar() {
  const [open, setOpen]        = useState(false);
  const { session, loading }   = useAuth();
  const nav                    = useNavigate();
  const isLoggedIn             = !loading && !!session;
  const primaryTo              = isLoggedIn ? "/app/parser" : "/signup";
  const primaryLabel           = isLoggedIn ? "Dashboard" : "Start Free";

  return (
    <>
      {/* Desktop bar */}
      <nav
        className="fixed top-0 right-0 left-0 z-50 flex items-center justify-between px-6 py-4 sm:px-8"
        style={{
          background: "rgba(242,242,238,0.85)",
          backdropFilter: "blur(16px)",
          borderBottom: "1px solid rgba(25,40,55,0.06)",
        }}
      >
        {/* Logo */}
        <Link to="/" aria-label="AuditX home" className="shrink-0">
          <Logo />
        </Link>

        {/* Center nav links */}
        <div className="hidden items-center gap-7 md:flex">
          {links.map((l) => (
            <Link
              key={l.label}
              to={l.to}
              className="text-sm font-medium transition-opacity hover:opacity-60"
              style={{ color: "var(--ink-2)" }}
            >
              {l.label}
            </Link>
          ))}
        </div>

        {/* Right actions */}
        <div className="hidden items-center gap-2 md:flex">
          {!isLoggedIn && (
            <button
              type="button"
              onClick={() => nav({ to: "/signin" })}
              className="rounded-full px-4 py-2 text-sm font-medium transition-colors hover:bg-black/5"
              style={{ color: "var(--ink-2)" }}
            >
              Sign In
            </button>
          )}
          <button
            type="button"
            onClick={() => nav({ to: primaryTo })}
            className="rounded-full px-5 py-2 text-sm font-semibold text-white transition-all hover:opacity-90 hover:shadow-md"
            style={{
              background: "var(--color-accent)",
              boxShadow: "0 2px 12px rgba(115,66,226,0.25)",
            }}
          >
            {primaryLabel}
          </button>
        </div>

        {/* Mobile hamburger */}
        <button
          type="button"
          aria-label="Open menu"
          onClick={() => setOpen(true)}
          className="flex size-9 items-center justify-center rounded-xl md:hidden"
          style={{ color: "var(--color-text)" }}
        >
          <Menu size={22} strokeWidth={1.75} />
        </button>
      </nav>

      {/* Mobile drawer */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-40"
              style={{ background: "rgba(25,40,55,0.3)", backdropFilter: "blur(4px)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.aside
              className="fixed top-0 right-0 z-50 flex h-full flex-col p-6"
              style={{
                width: "min(88vw, 340px)",
                background: "var(--color-login-bg)",
                boxShadow: "-16px 0 48px rgba(25,40,55,0.14)",
              }}
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="flex items-center justify-between">
                <Logo />
                <button
                  type="button"
                  aria-label="Close menu"
                  onClick={() => setOpen(false)}
                  className="flex size-9 items-center justify-center rounded-xl hover:bg-black/5"
                >
                  <X size={20} strokeWidth={1.75} />
                </button>
              </div>

              <div className="my-5 h-px" style={{ background: "var(--hairline)" }} />

              <nav className="flex flex-col gap-0.5">
                {links.map((l, i) => (
                  <motion.div
                    key={l.label}
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + i * 0.06, duration: 0.35 }}
                  >
                    <Link
                      to={l.to}
                      onClick={() => setOpen(false)}
                      className="block rounded-xl px-3 py-2.5 text-sm font-medium transition-colors hover:bg-black/5"
                    >
                      {l.label}
                    </Link>
                  </motion.div>
                ))}
              </nav>

              <div className="mt-auto flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => { setOpen(false); nav({ to: primaryTo }); }}
                  className="w-full rounded-full py-3 text-sm font-semibold text-white"
                  style={{ background: "var(--color-accent)" }}
                >
                  {primaryLabel}
                </button>
                {!isLoggedIn && (
                  <button
                    type="button"
                    onClick={() => { setOpen(false); nav({ to: "/signin" }); }}
                    className="w-full rounded-full border py-3 text-sm font-medium"
                    style={{ borderColor: "var(--hairline)", color: "var(--ink-2)" }}
                  >
                    Sign In
                  </button>
                )}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
