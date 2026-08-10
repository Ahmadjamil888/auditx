import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { PromptInput, PromptInputActionAddAttachments, PromptInputFooter, PromptInputSubmit, PromptInputTextarea, PromptInputTools } from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";

export function ParserWorkspace({ threadId }: { threadId: string }) {
  const { session } = useAuth();
  const [initial, setInitial] = useState<UIMessage[] | null>(null);
  useEffect(() => { void supabase.from("chat_messages").select("ai_message_id,role,parts").eq("thread_id", threadId).order("position").then(({ data, error }) => { if (error) toast.error(error.message); setInitial((data ?? []).map((row) => ({ id: row.ai_message_id, role: row.role, parts: row.parts })) as UIMessage[]); }); }, [threadId]);
  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/chat", headers: async () => ({ Authorization: `Bearer ${session?.access_token ?? ""}` }) }), [session?.access_token]);
  if (!initial) return <div className="flex h-[70vh] items-center justify-center"><Shimmer>Opening audit workspace…</Shimmer></div>;
  return <Chat key={threadId} threadId={threadId} initial={initial} transport={transport} />;
}

function Chat({ threadId, initial, transport }: { threadId: string; initial: UIMessage[]; transport: DefaultChatTransport<UIMessage> }) {
  const input = useRef<HTMLTextAreaElement>(null);
  const { messages, sendMessage, status, stop, error } = useChat({ id: threadId, messages: initial, transport, onError: (cause) => toast.error(cause.message) });
  useEffect(() => { if (status === "ready") input.current?.focus(); }, [status]);
  return <div className="flex h-[calc(100vh-7rem)] min-h-[620px] flex-col overflow-hidden rounded-2xl border bg-white" style={{ borderColor: "var(--hairline)" }}><header className="border-b px-5 py-3" style={{ borderColor: "var(--hairline)" }}><p className="text-sm font-semibold">AuditX Agent</p><p className="text-xs" style={{ color: "var(--ink-3)" }}>Real ledger access · approval required before writes</p></header><Conversation className="min-h-0"><ConversationContent className="mx-auto w-full max-w-3xl px-5 py-8">{messages.length === 0 && <div className="flex min-h-[46vh] flex-col items-center justify-center text-center"><h1 className="text-2xl font-semibold">Reconcile every trade with audit-grade precision</h1><p className="mt-2 max-w-xl text-sm" style={{ color: "var(--ink-2)" }}>Attach any broker statement, trade slip, CSV, spreadsheet, screenshot, or PDF, then tell AuditX what outcome you need.</p></div>}{messages.map((message) => <Message key={message.id} from={message.role}><MessageContent>{message.parts.map((part, index) => part.type === "text" ? <MessageResponse key={index}>{part.text}</MessageResponse> : part.type === "file" ? <div key={index} className="rounded-lg border px-3 py-2 text-xs">{part.filename ?? "Attached document"}</div> : null)}</MessageContent></Message>)}{status === "submitted" && <Shimmer>Reading evidence and planning actions…</Shimmer>}{error && <p style={{ color: "var(--bad)" }}>{error.message}</p>}</ConversationContent><ConversationScrollButton /></Conversation><div className="border-t p-3" style={{ borderColor: "var(--hairline)" }}><div className="mx-auto max-w-3xl"><PromptInput accept=".pdf,.png,.jpg,.jpeg,.csv,.xlsx,.xls,.txt" multiple onSubmit={async ({ text, files }) => { if (text.trim() || files.length) await sendMessage({ text: text.trim(), files }); }}><PromptInputTextarea ref={input} autoFocus placeholder="Ask AuditX to reconcile, explain, correct, or post…" /><PromptInputFooter><PromptInputTools><PromptInputActionAddAttachments label="Attach broker document" /></PromptInputTools><PromptInputSubmit status={status} onStop={stop} /></PromptInputFooter></PromptInput></div></div></div>;
}