// ─── Email Ingestion Webhook ──────────────────────────────────────────────────
// Receives forwarded broker emails (multipart/form-data from an email relay
// such as Mailgun, SendGrid Inbound Parse, or Postmark).
// Extracts PDF/XLSX attachments and enqueues upload jobs for each.
//
// Setup: point your email relay's inbound webhook to:
//   POST /api/webhooks/email?org_id=<ORG_UUID>&secret=<WEBHOOK_SECRET>

import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const WEBHOOK_SECRET = process.env["EMAIL_WEBHOOK_SECRET"] ?? "auditx-email-webhook";

export const Route = createFileRoute("/api/webhooks/email")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const url    = new URL(request.url);
        const orgId  = url.searchParams.get("org_id") ?? "";
        const secret = url.searchParams.get("secret") ?? "";

        if (!orgId || secret !== WEBHOOK_SECRET) {
          return new Response("Unauthorized", { status: 401 });
        }

        const supabaseUrl = process.env["SUPABASE_URL"]
          ?? (import.meta.env["VITE_SUPABASE_URL"] as string | undefined) ?? "";
        const supabaseKey = process.env["SUPABASE_SERVICE_ROLE_KEY"]
          ?? (import.meta.env["VITE_SUPABASE_ANON_KEY"] as string | undefined) ?? "";

        const db = createClient<Database>(supabaseUrl, supabaseKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        // Parse multipart form — most email relays send attachments as form fields
        let attachmentCount = 0;
        try {
          const contentType = request.headers.get("content-type") ?? "";

          if (contentType.includes("multipart/form-data")) {
            const form = await request.formData();

            for (const [key, value] of form.entries()) {
              if (!(value instanceof File)) continue;
              const name = value.name ?? key;
              const ext  = name.split(".").pop()?.toLowerCase() ?? "";

              if (!["pdf", "png", "jpg", "jpeg", "xlsx", "xls", "csv"].includes(ext)) continue;

              // Upload to Supabase Storage under org bucket
              const storagePath = `${orgId}/email-inbox/${Date.now()}-${name}`;
              const bytes = await value.arrayBuffer();

              const { error: uploadErr } = await db.storage
                .from("documents")
                .upload(storagePath, bytes, { contentType: value.type || "application/octet-stream", upsert: false });

              if (uploadErr) {
                console.warn("[email-webhook] storage upload failed:", uploadErr.message);
                continue;
              }

              // Record in documents table
              const { data: doc, error: docErr } = await db.from("documents").insert({
                org_id:       orgId,
                storage_path: storagePath,
                doc_type:     "trade_confirmation",
                status:       "processing",
                uploaded_by:  "00000000-0000-0000-0000-000000000000", // system user placeholder
              } as never).select("id").single();

              if (docErr || !doc) continue;

              // Enqueue extraction job
              const idempotencyKey = `upload:${orgId}:${doc.id}`;
              await db.from("agent_jobs").insert({
                org_id:          orgId,
                trigger_type:    "email",
                trigger_payload: { document_id: doc.id, storage_path: storagePath } as never,
                idempotency_key: idempotencyKey,
              } as never).then(() => undefined, (e: unknown) => {
                const code = (e as { code?: string })?.code;
                if (code !== "23505") console.warn("[email-webhook] enqueue failed:", e);
              });

              attachmentCount++;
            }
          } else {
            // JSON body from some providers
            const body = await request.json() as Record<string, unknown>;
            console.log("[email-webhook] received JSON payload, attachments:", body["attachments"]);
            // Structured parsing left as extension point per provider
          }
        } catch (e) {
          console.error("[email-webhook] parse error:", e);
          return new Response("parse error", { status: 400 });
        }

        return new Response(
          JSON.stringify({ ok: true, attachments_enqueued: attachmentCount }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    } as never,
  },
});
