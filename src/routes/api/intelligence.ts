import { createFileRoute } from "@tanstack/react-router";
import { streamText } from "ai";

export const Route = createFileRoute("/api/intelligence")({
  loader: () => ({ message: "Intelligence API" }),
});

export async function POST({ request }: { request: Request }) {
  const body = await request.json();
  const { systemPrompt, userPrompt, maxTokens = 1024, temperature = 0.3 } = body;

  if (!systemPrompt || !userPrompt) {
    return new Response(
      JSON.stringify({ error: "systemPrompt and userPrompt are required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const { resolveAgentModel } = await import("@/lib/audit-agent.server");
    const env = (globalThis as any).__VERCEL_ENV__;
    const resolved = await resolveAgentModel(env);

    if (!resolved) {
      return new Response(
        JSON.stringify({ error: "AI not configured" }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      );
    }

    const result = streamText({
      model: resolved.model,
      system: systemPrompt,
      prompt: userPrompt,
      maxTokens,
      temperature,
    });

    return result.toDataStreamResponse();
  } catch (error) {
    console.error("[AuditX Intelligence] Error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to process request" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
