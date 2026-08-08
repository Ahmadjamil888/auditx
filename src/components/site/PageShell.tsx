import type { ReactNode } from "react";
import { Container, SectionHead } from "@/components/kit";
import { Footer } from "@/components/site/Footer";
import { Navbar } from "@/components/site/Navbar";

export function PageShell({
  eyebrow,
  title,
  sub,
  children,
}: {
  eyebrow: string;
  title: string;
  sub?: string;
  children: ReactNode;
}) {
  return (
    <div style={{ fontFamily: "var(--font-body)", color: "var(--color-text)" }}>
      <div style={{ background: "var(--color-login-bg)" }}>
        <Navbar />
        <Container className="pt-10 pb-16">
          <SectionHead eyebrow={eyebrow} title={title} {...(sub ? { sub } : {})} />
        </Container>
      </div>
      <div style={{ background: "#fff" }}>
        <Container className="py-16">{children}</Container>
      </div>
      <Footer />
    </div>
  );
}
