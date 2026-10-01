import { createFileRoute } from "@tanstack/react-router";
import { streamText } from "ai";

export const Route = createFileRoute("/api/intelligence")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as { systemPrompt?: string; userPrompt?: string };
        if (!body.systemPrompt || !body.userPrompt) {
          return Response.json({ error: "systemPrompt and userPrompt are required" }, { status: 400 });
        }
        const { resolveAgentModel, AI_PROVIDER_OPTIONS } = await import("@/lib/audit-agent.server");
        const resolved = await resolveAgentModel();
        if (!resolved) return Response.json({ error: "AI not configured" }, { status: 503 });
        const result = streamText({
          model: resolved.model,
          providerOptions: AI_PROVIDER_OPTIONS as never,
          system: body.systemPrompt,
          prompt: body.userPrompt.slice(0, 60000),
          abortSignal: request.signal,
        });
        return result.toTextStreamResponse({ headers: { "Cache-Control": "no-cache, no-transform" } });
      },
    },
  },
});
