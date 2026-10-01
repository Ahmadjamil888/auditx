import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

// Fetches a Google Sheet shared as "Anyone with the link" and returns it as CSV.
const Body = z.object({ url: z.string().url().max(500), gid: z.string().regex(/^\d+$/).optional() });

export const Route = createFileRoute("/api/sheets-import")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: "Paste a valid Google Sheets link." }, { status: 400 });
        const m = parsed.data.url.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
        if (!m) return Response.json({ error: "That isn't a Google Sheets link." }, { status: 400 });
        const gid = parsed.data.gid ?? parsed.data.url.match(/[#&?]gid=(\d+)/)?.[1] ?? "0";
        const res = await fetch(`https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv&gid=${gid}`, { redirect: "follow" });
        const type = res.headers.get("content-type") ?? "";
        if (!res.ok || !type.includes("csv")) {
          return Response.json(
            { error: "Couldn't open this sheet. In Google Sheets choose Share → 'Anyone with the link' and try again." },
            { status: 400 },
          );
        }
        const csv = await res.text();
        if (csv.length > 5_000_000) return Response.json({ error: "Sheet is too large (5 MB max)." }, { status: 400 });
        return Response.json({ csv });
      },
    },
  },
});
