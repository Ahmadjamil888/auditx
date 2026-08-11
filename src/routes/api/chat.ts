import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, stepCountIs, streamText, tool, type UIMessage } from "ai";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/lib/database.types";
import { createAuditAgentProvider } from "@/lib/audit-agent.server";

type ChatBody = { id?: unknown; messages?: unknown };

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authorization = request.headers.get("authorization") ?? "";
        if (!authorization.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });

        const body = (await request.json()) as ChatBody;
        if (typeof body.id !== "string" || !Array.isArray(body.messages)) {
          return new Response("A thread id and messages are required", { status: 400 });
        }

        const url = process.env["SUPABASE_URL"] ?? (import.meta.env["VITE_SUPABASE_URL"] as string | undefined);
        const key =
          process.env["SUPABASE_PUBLISHABLE_KEY"] ??
          (import.meta.env["VITE_SUPABASE_ANON_KEY"] as string | undefined);
        const aiKey = process.env["LOVABLE_API_KEY"];
        const approvalSecret = process.env["TOOL_APPROVAL_SECRET"] ?? "auditx-tool-approval";
        if (!url || !key) return new Response("Database configuration is missing", { status: 500 });
        if (!aiKey) return new Response("AI configuration is missing", { status: 500 });

        const supabase = createClient<Database>(url, key, {
          global: { headers: { Authorization: authorization } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData.user) return new Response("Unauthorized", { status: 401 });

        const { data: thread, error: threadError } = await supabase
          .from("chat_threads")
          .select("id, org_id")
          .eq("id", body.id)
          .eq("user_id", authData.user.id)
          .single();
        if (threadError || !thread) return new Response("Thread not found", { status: 404 });

        const audit = async (action: string, entityId: string, payload: Record<string, unknown>) => {
          const encoded = new TextEncoder().encode(`${Date.now()}-${action}-${entityId}-${authData.user.id}`);
          const digest = await crypto.subtle.digest("SHA-256", encoded);
          const hash = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
          const { error } = await supabase.from("audit_log").insert({
            org_id: thread.org_id,
            actor: authData.user.email ?? authData.user.id,
            action,
            entity_type: "transaction",
            entity_id: entityId,
            payload: payload as never,
            prev_hash: "",
            hash,
          });
          if (error) console.error("[AuditX] Audit log failed", error);
        };

        const tools = {
          get_transactions: tool({
            description: "Read the signed-in user's real transaction ledger before answering questions about trades, holdings, fees, or tax.",
            inputSchema: z.object({ ticker: z.string().nullable(), action: z.string().nullable(), limit: z.number().nullable() }),
            execute: async ({ ticker, action, limit }) => {
              let query = supabase.from("transactions").select("id,ticker,action,quantity,price,fees,wht,trade_date,ref_id,broker,exchange,status").eq("org_id", thread.org_id).order("trade_date", { ascending: false }).limit(Math.min(Math.max(limit ?? 30, 1), 100));
              if (ticker) query = query.eq("ticker", ticker.toUpperCase());
              if (action) query = query.eq("action", action.toUpperCase() as "BUY" | "SELL" | "DIV");
              const { data, error } = await query;
              if (error) throw new Error(error.message);
              return data;
            },
          }),
          get_ledger_summary: tool({
            description: "Read a compact real-data summary of the user's ledger and open reconciliation flags.",
            inputSchema: z.object({}),
            execute: async () => {
              const [transactions, flags] = await Promise.all([
                supabase.from("transactions").select("id,ticker,status").eq("org_id", thread.org_id),
                supabase.from("reconciliation_flags").select("id,severity").eq("org_id", thread.org_id).eq("status", "open"),
              ]);
              if (transactions.error) throw new Error(transactions.error.message);
              if (flags.error) throw new Error(flags.error.message);
              return { totalTransactions: transactions.data.length, needsReview: transactions.data.filter((row) => row.status === "needs_review").length, openFlags: flags.data.length, tickers: [...new Set(transactions.data.map((row) => row.ticker))] };
            },
          }),
          insert_transaction: tool({
            description: "Create a transaction in the real ledger. Always present this action for user approval before execution.",
            inputSchema: z.object({ ticker: z.string(), action: z.string(), quantity: z.number(), price: z.number(), fees: z.number().nullable(), wht: z.number().nullable(), trade_date: z.string(), ref_id: z.string().nullable(), broker: z.string().nullable(), exchange: z.string().nullable() }),
            execute: async (input) => {
              const action = input.action.toUpperCase();
              if (!(["BUY", "SELL", "DIV"] as string[]).includes(action)) throw new Error("Action must be BUY, SELL, or DIV");
              if (input.quantity <= 0 || input.price <= 0) throw new Error("Quantity and price must be positive");
              const payload = { org_id: thread.org_id, ticker: input.ticker.toUpperCase(), action: action as "BUY" | "SELL" | "DIV", quantity: input.quantity, price: input.price, fees: input.fees ?? 0, wht: input.wht ?? 0, trade_date: input.trade_date, ref_id: input.ref_id ?? `AI-${Date.now()}`, broker: input.broker ?? "", exchange: input.exchange ?? "PSX", confidence_score: 0.95, status: "posted" as const, source: { via: "auditx_agent", thread_id: thread.id } };
              const { data, error } = await supabase.from("transactions").insert(payload).select().single();
              if (error) throw new Error(error.message);
              await audit("ai_insert_transaction", data.id, payload);
              return data;
            },
          }),
          update_transaction: tool({
            description: "Edit a real ledger transaction after the user reviews the proposed fields.",
            inputSchema: z.object({ id: z.string(), ticker: z.string().nullable(), action: z.string().nullable(), quantity: z.number().nullable(), price: z.number().nullable(), fees: z.number().nullable(), wht: z.number().nullable(), trade_date: z.string().nullable(), ref_id: z.string().nullable(), broker: z.string().nullable(), exchange: z.string().nullable(), status: z.string().nullable() }),
            execute: async ({ id, ...input }) => {
              const updates = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== null));
              if (typeof updates["ticker"] === "string") updates["ticker"] = updates["ticker"].toUpperCase();
              if (typeof updates["action"] === "string") updates["action"] = updates["action"].toUpperCase();
              const { data, error } = await supabase.from("transactions").update(updates as never).eq("id", id).eq("org_id", thread.org_id).select().single();
              if (error) throw new Error(error.message);
              await audit("ai_update_transaction", id, updates);
              return data;
            },
          }),
          flag_anomaly: tool({
            description: "Record a real reconciliation anomaly after the user approves it.",
            inputSchema: z.object({ flag_type: z.string(), severity: z.string().nullable(), ticker: z.string(), ref_id: z.string().nullable(), expected: z.number().nullable(), actual: z.number().nullable(), description: z.string(), suggested_resolution: z.string().nullable() }),
            execute: async (input) => {
              const { data, error } = await supabase.from("reconciliation_flags").insert({ org_id: thread.org_id, flag_type: input.flag_type, severity: (input.severity ?? "warn") as "ok" | "warn" | "bad", ticker: input.ticker.toUpperCase(), ref_id: input.ref_id ?? "", expected: input.expected ?? 0, actual: input.actual ?? 0, description: input.description, suggested_resolution: input.suggested_resolution ?? "", status: "open" }).select().single();
              if (error) throw new Error(error.message);
              return data;
            },
          }),
        };

        const uiMessages = body.messages as UIMessage[];
        const latestUser = [...uiMessages].reverse().find((message) => message.role === "user");
        const latestText = latestUser?.parts.filter((part) => part.type === "text").map((part) => part.text).join(" ") ?? "";
        const title = text(latestText).slice(0, 64) || "Document audit";

        const provider = createAuditAgentProvider(aiKey);
        const result = streamText({
          model: provider("google/gemini-3.6-flash"),
          system: `You are AuditX, an autonomous financial audit and compliance agent for PSX and NSE retail traders. Work continuously toward the user's requested outcome. Use tools to read real ledger data before making factual claims. You may propose creates, edits, and anomaly flags, but every write requires explicit user approval. Never claim a write succeeded until its tool output confirms it. Analyze uploaded broker slips, contract notes, CSV exports, screenshots, PDFs, and spreadsheets. Infer broker formats flexibly, normalize dates and currencies, identify missing fields, reconcile references and fees, and explain decisions in natural language. Do not reveal hidden chain-of-thought; show concise progress, conclusions, evidence, and proposed actions. Use markdown naturally, including tables when useful. Do not force a fixed response template.`,
          messages: await convertToModelMessages(uiMessages),
          tools,
          toolApproval: { insert_transaction: "user-approval", update_transaction: "user-approval", flag_anomaly: "user-approval" },
          experimental_toolApprovalSecret: approvalSecret,
          stopWhen: stepCountIs(50),
        });

        return result.toUIMessageStreamResponse({
          originalMessages: uiMessages,
          onFinish: async ({ messages }) => {
            const { error: messageError } = await supabase.from("chat_messages").upsert(messages.map((message, index) => ({ thread_id: thread.id, org_id: thread.org_id, user_id: authData.user.id, ai_message_id: message.id, role: message.role, parts: message.parts as never, position: index })), { onConflict: "thread_id,ai_message_id" });
            if (messageError) console.error("[AuditX] Message persistence failed", messageError);
            const { error: updateError } = await supabase.from("chat_threads").update({ title, updated_at: new Date().toISOString() }).eq("id", thread.id).eq("user_id", authData.user.id);
            if (updateError) console.error("[AuditX] Thread update failed", updateError);
          },
        });
      },
    },
  },
});