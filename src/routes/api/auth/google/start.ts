// ─── Google OAuth Start ───────────────────────────────────────────────────────
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/auth/google/start")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const url       = new URL(request.url);
        const orgId     = url.searchParams.get("org_id")     ?? "";
        const redirect  = url.searchParams.get("redirect_back") ?? "/app/settings";

        const clientId    = process.env["GOOGLE_CLIENT_ID"] ?? "";
        const callbackUrl = `${process.env["VITE_APP_URL"] ?? "https://auditx.app"}/api/auth/google/callback`;

        if (!clientId) {
          return new Response("GOOGLE_CLIENT_ID not configured", { status: 503 });
        }

        const state  = Buffer.from(JSON.stringify({ orgId, redirect })).toString("base64");
        const scope  = "https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/spreadsheets.readonly";
        const oauthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
        oauthUrl.searchParams.set("client_id",     clientId);
        oauthUrl.searchParams.set("redirect_uri",  callbackUrl);
        oauthUrl.searchParams.set("response_type", "code");
        oauthUrl.searchParams.set("scope",         scope);
        oauthUrl.searchParams.set("state",         state);
        oauthUrl.searchParams.set("access_type",   "offline");
        oauthUrl.searchParams.set("prompt",        "consent");

        return Response.redirect(oauthUrl.toString(), 302);
      },
    } as never,
  },
});
