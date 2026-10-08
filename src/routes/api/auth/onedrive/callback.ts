// ─── OneDrive OAuth Callback ──────────────────────────────────────────────────
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/api/auth/onedrive/callback")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const url   = new URL(request.url);
        const code  = url.searchParams.get("code")  ?? "";
        const state = url.searchParams.get("state") ?? "";

        if (!code) {
          return Response.redirect("/app/settings?error=onedrive_oauth_denied", 302);
        }

        let orgId    = "";
        let redirect = "/app/settings";
        try {
          const parsed = JSON.parse(Buffer.from(state, "base64").toString());
          orgId    = parsed.orgId    ?? "";
          redirect = parsed.redirect ?? "/app/settings";
        } catch { /* ignore */ }

        const clientId     = process.env["MICROSOFT_CLIENT_ID"]     ?? "";
        const clientSecret = process.env["MICROSOFT_CLIENT_SECRET"] ?? "";
        const tenantId     = process.env["MICROSOFT_TENANT_ID"]     ?? "common";
        const appUrl       = process.env["VITE_APP_URL"] ?? "https://auditx.app";
        const callbackUrl  = `${appUrl}/api/auth/onedrive/callback`;

        // Exchange code for tokens
        const params = new URLSearchParams({
          client_id:     clientId,
          client_secret: clientSecret,
          code,
          redirect_uri:  callbackUrl,
          grant_type:    "authorization_code",
          scope:         "Files.Read Files.Read.All offline_access",
        });

        const tokenRes = await fetch(
          `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
          {
            method:  "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body:    params,
          },
        );

        if (!tokenRes.ok) {
          return Response.redirect("/app/settings?error=onedrive_token_exchange", 302);
        }

        const tokens = await tokenRes.json() as {
          access_token:  string;
          refresh_token?: string;
          expires_in:    number;
        };

        // Get user info
        const meRes  = await fetch("https://graph.microsoft.com/v1.0/me", {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        const me = meRes.ok ? await meRes.json() as { mail?: string; userPrincipalName?: string } : {};
        const email = me.mail ?? me.userPrincipalName ?? "unknown";

        const supabaseUrl = process.env["SUPABASE_URL"]
          ?? (import.meta.env["VITE_SUPABASE_URL"] as string | undefined) ?? "";
        const supabaseKey = process.env["SUPABASE_SERVICE_ROLE_KEY"]
          ?? (import.meta.env["VITE_SUPABASE_ANON_KEY"] as string | undefined) ?? "";

        const db = createClient<Database>(supabaseUrl, supabaseKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        await db.from("connected_sources").upsert({
          org_id:                 orgId,
          source_type:            "onedrive",
          external_id:            `onedrive:${email}`,
          display_name:           `OneDrive (${email})`,
          oauth_token_encrypted:  JSON.stringify({
            access_token:  tokens.access_token,
            refresh_token: tokens.refresh_token ?? "",
            expires_at:    Date.now() + (tokens.expires_in ?? 3600) * 1000,
          }),
          paused:     false,
          rules:      {} as never,
          updated_at: new Date().toISOString(),
        } as never, { onConflict: "org_id,source_type,external_id" });

        return Response.redirect(`${redirect}?connected=onedrive`, 302);
      },
    } as never,
  },
});
