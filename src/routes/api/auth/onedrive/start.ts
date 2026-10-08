// ─── OneDrive OAuth Start ─────────────────────────────────────────────────────
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/auth/onedrive/start")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const url      = new URL(request.url);
        const orgId    = url.searchParams.get("org_id")      ?? "";
        const redirect = url.searchParams.get("redirect_back") ?? "/app/settings";

        const clientId   = process.env["MICROSOFT_CLIENT_ID"] ?? "";
        const tenantId   = process.env["MICROSOFT_TENANT_ID"] ?? "common";
        const appUrl     = process.env["VITE_APP_URL"] ?? "https://auditx.app";
        const callbackUrl = `${appUrl}/api/auth/onedrive/callback`;

        if (!clientId) {
          return new Response("MICROSOFT_CLIENT_ID not configured", { status: 503 });
        }

        const state    = Buffer.from(JSON.stringify({ orgId, redirect })).toString("base64");
        const scope    = "Files.Read Files.Read.All offline_access";
        const oauthUrl = new URL(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`);
        oauthUrl.searchParams.set("client_id",     clientId);
        oauthUrl.searchParams.set("redirect_uri",  callbackUrl);
        oauthUrl.searchParams.set("response_type", "code");
        oauthUrl.searchParams.set("scope",         scope);
        oauthUrl.searchParams.set("state",         state);
        oauthUrl.searchParams.set("response_mode", "query");

        return Response.redirect(oauthUrl.toString(), 302);
      },
    } as never,
  },
});
