import { motion } from "framer-motion";
import type { ReactNode } from "react";

export const reveal = {
  hidden: { opacity: 0, y: 28 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.15, duration: 0.6, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

export function Reveal({
  children,
  i = 0,
  className,
}: {
  children: ReactNode;
  i?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      variants={reveal}
      custom={i}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.25 }}
    >
      {children}
    </motion.div>
  );
}

type BtnProps = {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "inverse";
  className?: string;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
};

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all disabled:opacity-45 disabled:pointer-events-none";

export function Btn({
  children,
  variant = "primary",
  className = "",
  onClick,
  type = "button",
  disabled,
}: BtnProps) {
  const styles: Record<NonNullable<BtnProps["variant"]>, React.CSSProperties> = {
    primary: {
      background: "var(--color-accent)",
      color: "#fff",
      boxShadow: "0 4px 24px rgba(115,66,226,0.28)",
    },
    secondary: { background: "var(--color-login-bg)", color: "var(--color-text)" },
    ghost: { background: "transparent", color: "var(--color-text)" },
    inverse: { background: "#fff", color: "var(--color-accent)" },
  };
  return (
    <motion.button
      type={type}
      disabled={disabled}
      onClick={onClick}
      whileHover={{ scale: 1.04, filter: "brightness(1.08)" }}
      whileTap={{ scale: 0.96 }}
      className={`${base} px-5 py-2.5 text-sm ${className}`}
      style={styles[variant] as React.ComponentProps<typeof motion.button>["style"]}
    >
      {children}
    </motion.button>
  );
}

export function Panel({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`rounded-2xl bg-white p-6 ${className}`}
      style={{
        border: "1px solid var(--hairline)",
        boxShadow: "var(--shadow-card)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

const semantic = {
  ok: "var(--ok)",
  warn: "var(--warn)",
  bad: "var(--bad)",
  info: "var(--info)",
} as const;

export function StatusPill({
  tone = "ok",
  children,
}: {
  tone?: keyof typeof semantic;
  children: ReactNode;
}) {
  const c = semantic[tone];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ color: c, background: `color-mix(in srgb, ${c} 10%, transparent)` }}
    >
      <span className="size-1.5 rounded-full" style={{ background: c }} />
      {children}
    </span>
  );
}

export function SectionHead({
  eyebrow,
  title,
  sub,
  center,
}: {
  eyebrow?: string;
  title: string;
  sub?: string;
  center?: boolean;
}) {
  return (
    <div className={center ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      {eyebrow && (
        <p
          className="mb-3 text-xs font-semibold tracking-[0.14em] uppercase"
          style={{ color: "var(--color-accent)" }}
        >
          {eyebrow}
        </p>
      )}
      <h2 style={{ fontSize: "clamp(1.5rem,3.4vw,2.25rem)", lineHeight: 1.1 }}>{title}</h2>
      {sub && (
        <p className="mt-4 text-base leading-relaxed" style={{ color: "var(--ink-2)" }}>
          {sub}
        </p>
      )}
    </div>
  );
}

export function Container({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`mx-auto w-full max-w-[1280px] px-5 sm:px-8 ${className}`}>{children}</div>;
}
