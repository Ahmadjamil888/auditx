import { zodResolver } from "@hookform/resolvers/zod";
import { createFileRoute } from "@tanstack/react-router";
import { Mail, MapPin, Phone } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Btn, Panel } from "@/components/kit";
import { PageShell } from "@/components/site/PageShell";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact AuditX — Sales, Support & Compliance" },
      {
        name: "description",
        content:
          "Get in touch with the AuditX team about reconciliation, enterprise plans, jurisdictions or compliance questions.",
      },
      { property: "og:title", content: "Contact AuditX" },
      { property: "og:description", content: "Talk to sales, support or the compliance team." },
    ],
  }),
  component: Contact,
});

const schema = z.object({
  name: z.string().min(2, "Please enter your name"),
  email: z.string().email("Enter a valid email address"),
  subject: z.string().min(3, "Add a short subject"),
  message: z.string().min(20, "Give us at least 20 characters of context"),
});

type Values = z.infer<typeof schema>;

const field =
  "mt-1.5 w-full rounded-[10px] bg-white px-3.5 py-2.5 text-sm outline-none focus:ring-2";

function Contact() {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = async (v: Values) => {
    await new Promise((r) => setTimeout(r, 600));
    toast.success("Message queued", { description: `We'll reply to ${v.email} within one business day.` });
    reset();
  };

  return (
    <PageShell
      eyebrow="Contact"
      title="Talk to the people who built the engine"
      sub="Sales, support and compliance questions all land with the team that maintains the pipeline."
    >
      <div className="grid gap-6 md:grid-cols-3">
        <Panel className="md:col-span-2">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium" htmlFor="name">
                  Name
                </label>
                <input
                  id="name"
                  className={field}
                  style={{ border: "1px solid var(--hairline)" }}
                  {...register("name")}
                />
                {errors.name && (
                  <p className="mt-1 text-xs" style={{ color: "var(--bad)" }}>
                    {errors.name.message}
                  </p>
                )}
              </div>
              <div>
                <label className="text-sm font-medium" htmlFor="email">
                  Email
                </label>
                <input
                  id="email"
                  className={field}
                  style={{ border: "1px solid var(--hairline)" }}
                  {...register("email")}
                />
                {errors.email && (
                  <p className="mt-1 text-xs" style={{ color: "var(--bad)" }}>
                    {errors.email.message}
                  </p>
                )}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="subject">
                Subject
              </label>
              <input
                id="subject"
                className={field}
                style={{ border: "1px solid var(--hairline)" }}
                {...register("subject")}
              />
              {errors.subject && (
                <p className="mt-1 text-xs" style={{ color: "var(--bad)" }}>
                  {errors.subject.message}
                </p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="message">
                Message
              </label>
              <textarea
                id="message"
                rows={6}
                className={field}
                style={{ border: "1px solid var(--hairline)" }}
                {...register("message")}
              />
              {errors.message && (
                <p className="mt-1 text-xs" style={{ color: "var(--bad)" }}>
                  {errors.message.message}
                </p>
              )}
            </div>
            <Btn type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Sending…" : "Send message"}
            </Btn>
          </form>
        </Panel>

        <Panel>
          <h3 className="text-base font-semibold">Direct</h3>
          <ul className="mt-4 space-y-4 text-sm" style={{ color: "var(--ink-2)" }}>
            <li className="flex items-start gap-3">
              <Mail size={18} strokeWidth={1.75} style={{ color: "var(--color-accent)" }} />
              hello@auditx.app
            </li>
            <li className="flex items-start gap-3">
              <Phone size={18} strokeWidth={1.75} style={{ color: "var(--color-accent)" }} />
              +92 21 3455 0110
            </li>
            <li className="flex items-start gap-3">
              <MapPin size={18} strokeWidth={1.75} style={{ color: "var(--color-accent)" }} />
              Karachi · Bengaluru
            </li>
          </ul>
        </Panel>
      </div>
    </PageShell>
  );
}
