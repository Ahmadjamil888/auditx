// ─── Google OAuth Callback ────────────────────────────────────────────────────
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/api/auth/google/callback")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const url   = new URL(request.url);
        const code  = url.searchParams.get("code")  ?? "";
        const state = url.searchParams.get("state") ?? "";

        if (!code) {
          return Response.redirect("/app/settings?error=google_oauth_denied", 302);
        }

        let orgId    = "";
        let redirect = "/app/settings";
        try {
          const parsed = JSON.parse(Buffer.from(state, "base64").toString());
          orgId    = parsed.orgId    ?? "";
          redirect = parsed.redirect ?? "/app/settings";
        } catch { /* ignore */ }

        const clientId     = process.env["GOOGLE_CLIENT_ID"]     ?? "";
        const clientSecret = process.env["GOOGLE_CLIENT_SECRET"] ?? "";
        const callbackUrl  = `${process.env["VITE_APP_URL"] ?? "https://auditx.app"}/api/auth/google/callback`;

        // Exchange code for tokens
        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code,
            client_id:     clientId,
            client_secret: clientSecret,
            redirect_uri:  callbackUrl,
            grant_type:    "authorization_code",
          }),
        });

        if (!tokenRes.ok) {
          return Response.redirect("/app/settings?error=google_token_exchange", 302);
        }

        const tokens = await tokenRes.json() as {
          access_token:  string;
          refresh_token?: string;
          expires_in:    number;
        };

        // Get user info to label the source
        const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        const userInfo = userRes.ok ? await userRes.json() as { email?: string } : {};

        // Store in connected_sources (token stored in plain text here;
        // replace with Supabase Vault in production)
        const supabaseUrl = process.env["SUPABASE_URL"] ?? (import.meta.env["VITE_SUPABASE_URL"] as string | undefined) ?? "";
        const supabaseKey = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? (import.meta.env["VITE_SUPABASE_ANON_KEY"] as string | undefined) ?? "";
        const db = createClient<Database>(supabaseUrl, supabaseKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        // external_id = "google_drive" for the Drive root; user picks a specific sheet later
        await db.from("connected_sources").upsert({
          org_id:                 orgId,
          source_type:            "google_sheets",
          external_id:            `drive:${userInfo.email ?? "unknown"}`,
          display_name:           `Google Drive (${userInfo.email ?? "Google Account"})`,
          oauth_token_encrypted:  JSON.stringify({
            access_token:  tokens.access_token,
            refresh_token: tokens.refresh_token ?? "",
            expires_at:    Date.now() + (tokens.expires_in ?? 3600) * 1000,
          }),
          paused: false,
          rules:  {} as never,
          updated_at: new Date().toISOString(),
        } as never, { onConflict: "org_id,source_type,external_id" });

        return Response.redirect(`${redirect}?connected=google`, 302);
      },
    } as never,
  },
});
