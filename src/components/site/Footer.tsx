import { Link } from "@tanstack/react-router";
import { Github, Linkedin, Twitter } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Container } from "@/components/kit";

const cols = [
  {
    title: "Product",
    items: [
      { label: "How it works", to: "/how-it-works" as const },
      { label: "Pricing", to: "/pricing" as const },
      { label: "Security", to: "/security" as const },
    ],
  },
  {
    title: "Company",
    items: [
      { label: "About", to: "/about" as const },
      { label: "Contact", to: "/contact" as const },
      { label: "News", to: "/news" as const },
    ],
  },
  {
    title: "Resources",
    items: [
      { label: "Help center", to: "/help" as const },
      { label: "Changelog", to: "/news" as const },
    ],
  },
  {
    title: "Legal",
    items: [
      { label: "Security posture", to: "/security" as const },
      { label: "Contact legal", to: "/contact" as const },
    ],
  },
];

export function Footer() {
  return (
    <footer style={{ background: "var(--color-login-bg)" }}>
      <Container className="py-14">
        <div className="grid gap-10 md:grid-cols-5">
          <div className="md:col-span-1">
            <Logo />
            <p className="mt-4 max-w-[220px] text-sm" style={{ color: "var(--ink-2)" }}>
              Audit-grade reconciliation for regional exchange traders.
            </p>
            <div className="mt-5 flex gap-3" style={{ color: "var(--ink-2)" }}>
              <Twitter size={18} strokeWidth={1.75} />
              <Linkedin size={18} strokeWidth={1.75} />
              <Github size={18} strokeWidth={1.75} />
            </div>
          </div>
          {cols.map((c) => (
            <div key={c.title}>
              <p className="text-sm font-semibold">{c.title}</p>
              <ul className="mt-4 space-y-2.5">
                {c.items.map((it) => (
                  <li key={it.label}>
                    <Link
                      to={it.to}
                      className="text-sm transition-opacity hover:opacity-60"
                      style={{ color: "var(--ink-2)" }}
                    >
                      {it.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div
          className="mt-12 flex flex-col gap-2 border-t pt-6 text-xs sm:flex-row sm:justify-between"
          style={{ borderColor: "var(--hairline)", color: "var(--ink-3)" }}
        >
          <span>© {new Date().getFullYear()} AuditX. All rights reserved.</span>
          <span>AuditX does not provide tax or legal advice.</span>
        </div>
      </Container>
    </footer>
  );
}
