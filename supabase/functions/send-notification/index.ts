// ─── AuditX Send Notification — Supabase Edge Function ───────────────────────
// Triggered via Supabase Database Webhook on notifications INSERT.
// Sends email for NOTIFY and STOP severity items per user preferences.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_KEY       = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL       = Deno.env.get("FROM_EMAIL") ?? "noreply@auditx.app";

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!RESEND_KEY) {
    console.warn("[send-notification] RESEND_API_KEY not set — email skipped");
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method:  "POST",
    headers: {
      Authorization:  `Bearer ${RESEND_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from:    `AuditX <${FROM_EMAIL}>`,
      to:      [to],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    console.error("[send-notification] Resend error:", res.status, txt);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type,authorization" },
    });
  }

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return new Response("bad body", { status: 400 });

  // Database webhook sends { type, table, record, old_record }
  const record = (body["record"] as Record<string, unknown>) ?? body;

  const userId   = record["user_id"]  as string | undefined;
  const orgId    = record["org_id"]   as string | undefined;
  const severity = record["severity"] as string | undefined;
  const title    = record["title"]    as string | undefined ?? "AuditX notification";
  const message  = record["message"]  as string | undefined ?? "";
  const link     = record["link"]     as string | undefined;

  if (!userId || !orgId) return new Response("missing user_id or org_id", { status: 400 });

  // Only email for warning or error severity
  if (!["warning", "error"].includes(severity ?? "")) {
    return new Response(JSON.stringify({ skipped: true }), { status: 200 });
  }

  // Load user preferences
  const { data: prefs } = await db
    .from("notification_prefs")
    .select("email_notify, email_on_notify, email_on_stop")
    .eq("user_id", userId)
    .maybeSingle();

  const shouldEmail =
    (prefs?.email_notify !== false) &&
    ((severity === "warning" && prefs?.email_on_notify !== false) ||
     (severity === "error"   && prefs?.email_on_stop   !== false));

  if (!shouldEmail) return new Response(JSON.stringify({ skipped: true }), { status: 200 });

  // Get user email
  const { data: { user }, error: userErr } = await db.auth.admin.getUserById(userId);
  if (userErr || !user?.email) return new Response("user not found", { status: 200 });

  const actionUrl = link ? `https://auditx.app${link}` : "https://auditx.app/app/activity";

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family:Inter,sans-serif;color:#192837;background:#f5f5f5;margin:0;padding:32px;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="margin-bottom:24px;">
      <span style="font-size:22px;font-weight:800;color:#7342E2;">AuditX</span>
    </div>
    <h2 style="font-size:16px;font-weight:700;margin:0 0 8px;">${title}</h2>
    <p style="font-size:14px;color:#5a6a7a;margin:0 0 24px;">${message}</p>
    <a href="${actionUrl}"
       style="display:inline-block;background:#7342E2;color:#fff;text-decoration:none;
              border-radius:8px;padding:12px 24px;font-size:14px;font-weight:600;">
      View in AuditX
    </a>
    <p style="font-size:11px;color:#aaa;margin-top:32px;">
      You received this because you have email notifications enabled for AuditX.
      <a href="https://auditx.app/app/settings" style="color:#7342E2;">Manage preferences</a>
    </p>
  </div>
</body>
</html>`;

  await sendEmail(user.email, `AuditX: ${title}`, html);
  return new Response(JSON.stringify({ sent: true }), { status: 200 });
});
