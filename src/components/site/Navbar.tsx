import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { Logo } from "@/components/brand/Logo";
import { Btn, Container } from "@/components/kit";

const links = [
  { label: "Product", to: "/how-it-works" },
  { label: "Pricing", to: "/pricing" },
  { label: "Security", to: "/security" },
  { label: "News", to: "/news" },
  { label: "Help", to: "/help" },
] as const;

export function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Container className="relative z-10 flex items-center justify-between py-4 sm:py-5">
        <Link to="/" aria-label="AuditX home">
          <Logo />
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {links.map((l) => (
            <Link
              key={l.label}
              to={l.to}
              className="text-sm font-medium transition-opacity hover:opacity-60"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Btn>Start Free Audit</Btn>
          <Btn variant="secondary">Sign In</Btn>
        </div>

        <button
          className="md:hidden"
          aria-label="Open menu"
          onClick={() => setOpen(true)}
          type="button"
        >
          <Menu size={24} strokeWidth={1.75} />
        </button>
      </Container>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-40"
              style={{ background: "rgba(25,40,55,0.35)", backdropFilter: "blur(4px)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.aside
              className="fixed top-0 right-0 z-50 flex flex-col p-5"
              style={{
                width: "min(88vw, 360px)",
                height: "100dvh",
                background: "var(--color-sheet)",
                boxShadow: "-12px 0 48px rgba(25,40,55,0.18)",
              }}
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="flex items-center justify-between">
                <Logo />
                <button aria-label="Close menu" onClick={() => setOpen(false)} type="button">
                  <X size={24} strokeWidth={1.75} />
                </button>
              </div>
              <div className="my-5 h-px" style={{ background: "rgba(25,40,55,0.15)" }} />
              <nav className="flex flex-col gap-1">
                {links.map((l, i) => (
                  <motion.div
                    key={l.label}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.18 + i * 0.07, duration: 0.4 }}
                  >
                    <Link
                      to={l.to}
                      onClick={() => setOpen(false)}
                      className="block py-2.5 text-lg font-medium"
                    >
                      {l.label}
                    </Link>
                  </motion.div>
                ))}
              </nav>
              <div className="mt-auto flex flex-col gap-2">
                <Btn className="w-full">Start Free Audit</Btn>
                <Btn variant="secondary" className="w-full">
                  Sign In
                </Btn>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
