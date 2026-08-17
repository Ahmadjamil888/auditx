import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses, type UIMessage } from "ai";
import { Check, Loader2, Terminal, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";

const SUGGESTIONS = [
  "Reconcile my last 10 trades and flag anything odd",
  "Extract this broker slip and post it to my ledger",
  "What is my realised capital gain this tax year?",
  "Fix the fees on my most recent OGDC trade",
];

export function ParserWorkspace({ threadId }: { threadId: string }) {
  const { session } = useAuth();
  const [initial, setInitial] = useState<UIMessage[] | null>(null);

  useEffect(() => {
    console.log("[AuditX] ParserWorkspace loading thread:", threadId);
    let cancelled = false;
    void supabase
      .from("chat_messages")
      .select("ai_message_id, role, parts")
      .eq("thread_id", threadId)
      .order("position")
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("[AuditX] Failed to load chat history:", error.message, error);
        } else {
          console.log("[AuditX] Chat history loaded:", data?.length ?? 0, "messages");
        }
        setInitial(
          (data ?? []).map((row) => ({
            id: row.ai_message_id,
            role: row.role,
            parts: row.parts,
          })) as UIMessage[],
        );
      });
    return () => {
      cancelled = true;
      console.log("[AuditX] ParserWorkspace cleanup for thread:", threadId);
    };
  }, [threadId]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        headers: () => ({ Authorization: `Bearer ${session?.access_token ?? ""}` }),
      }),
    [session?.access_token],
  );

  if (!initial) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <Shimmer>Opening audit workspace…</Shimmer>
      </div>
    );
  }

  return <Chat key={threadId} threadId={threadId} initial={initial} transport={transport} />;
}

type ToolPart = {
  type: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  approval?: { id: string };
};

function ToolCard({
  part,
  onApprove,
}: {
  part: ToolPart;
  onApprove: ((approved: boolean) => void) | undefined;
}) {
  const [open, setOpen] = useState(false);
  const name = part.type.replace(/^tool-/, "").replace(/_/g, " ");
  const running = part.state === "input-streaming" || part.state === "input-available";
  const needsApproval = part.state === "approval-requested";

  return (
    <div className="my-2 overflow-hidden rounded-xl" style={{ border: "1px solid var(--hairline)" }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium"
        style={{ background: "rgba(25,40,55,0.03)" }}
      >
        {running ? (
          <Loader2 size={14} className="animate-spin" style={{ color: "var(--color-accent)" }} />
        ) : part.errorText ? (
          <X size={14} style={{ color: "var(--bad)" }} />
        ) : needsApproval ? (
          <Terminal size={14} style={{ color: "var(--color-accent)" }} />
        ) : (
          <Check size={14} style={{ color: "var(--ok, #1f9d55)" }} />
        )}
        <span className="capitalize">{name}</span>
        <span className="ml-auto" style={{ color: "var(--ink-3)" }}>
          {needsApproval ? "needs approval" : running ? "running" : part.errorText ? "failed" : "done"}
        </span>
      </button>

      {open && (
        <div className="space-y-2 px-3 py-2 text-[11px]" style={{ color: "var(--ink-2)" }}>
          <pre className="overflow-x-auto whitespace-pre-wrap break-words">
            {JSON.stringify(part.input ?? {}, null, 2)}
          </pre>
          {part.output !== undefined && (
            <pre className="overflow-x-auto whitespace-pre-wrap break-words">
              {JSON.stringify(part.output, null, 2)}
            </pre>
          )}
          {part.errorText && <p style={{ color: "var(--bad)" }}>{part.errorText}</p>}
        </div>
      )}

      {needsApproval && onApprove && (
        <div className="flex items-center gap-2 border-t px-3 py-2" style={{ borderColor: "var(--hairline)" }}>
          <p className="mr-auto text-xs" style={{ color: "var(--ink-2)" }}>
            AuditX wants to write to your ledger.
          </p>
          <button
            type="button"
            onClick={() => onApprove(false)}
            className="rounded-full px-3 py-1.5 text-xs font-semibold"
            style={{ border: "1px solid var(--hairline)" }}
          >
            Reject
          </button>
          <button
            type="button"
            onClick={() => onApprove(true)}
            className="rounded-full px-3 py-1.5 text-xs font-semibold text-white"
            style={{ background: "var(--color-accent)" }}
          >
            Approve
          </button>
        </div>
      )}
    </div>
  );
}

function Chat({
  threadId,
  initial,
  transport,
}: {
  threadId: string;
  initial: UIMessage[];
  transport: DefaultChatTransport<UIMessage>;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  const { messages, sendMessage, status, stop, error, addToolApprovalResponse } = useChat({
    id: threadId,
    messages: initial,
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    onError: (cause) => toast.error(cause.message),
  });

  useEffect(() => {
    if (status === "ready") input.current?.focus();
  }, [status]);

  const empty = messages.length === 0;

  return (
    <div className="flex h-[calc(100vh-3.75rem)] min-h-[560px] flex-col overflow-hidden">
      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="mx-auto w-full max-w-3xl px-5 py-8">
          {empty && (
            <div className="flex min-h-[46vh] flex-col items-center justify-center text-center">
              <h1 style={{ fontFamily: "var(--font-heading)" }} className="text-3xl">
                What should AuditX reconcile today?
              </h1>
              <p className="mt-3 max-w-xl text-sm" style={{ color: "var(--ink-2)" }}>
                Attach any broker statement, trade slip, CSV, spreadsheet, screenshot or PDF — or just describe
                what you need. AuditX reads your real ledger and asks before it writes.
              </p>
            </div>
          )}

          {messages.map((message) => (
            <Message key={message.id} from={message.role}>
              <MessageContent>
                {message.parts.map((part, index) => {
                  if (part.type === "text") return <MessageResponse key={index}>{part.text}</MessageResponse>;
                  if (part.type === "file")
                    return (
                      <div key={index} className="rounded-lg border px-3 py-2 text-xs" style={{ borderColor: "var(--hairline)" }}>
                        {("filename" in part && part.filename) || "Attached document"}
                      </div>
                    );
                  if (part.type.startsWith("tool-") || part.type === "dynamic-tool") {
                    const tp = part as unknown as ToolPart;
                    const approvalId = tp.approval?.id;
                    return (
                      <ToolCard
                        key={index}
                        part={tp}
                        onApprove={
                          approvalId
                            ? (approved) => addToolApprovalResponse({ id: approvalId, approved })
                            : undefined
                        }
                      />
                    );
                  }
                  return null;
                })}
              </MessageContent>
            </Message>
          ))}

          {status === "submitted" && <Shimmer>Reading evidence and planning actions…</Shimmer>}
          {error && (
            <p className="text-sm" style={{ color: "var(--bad)" }}>
              {error.message}
            </p>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="px-4 pb-6">
        <div className="mx-auto w-full max-w-3xl">
          {empty && (
            <div className="mb-3 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void sendMessage({ text: s })}
                  className="rounded-full bg-white px-3 py-1.5 text-xs transition-colors hover:bg-black/5"
                  style={{ border: "1px solid var(--hairline)", color: "var(--ink-2)" }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          <PromptInput
            accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.xlsx,.xls,.txt"
            multiple
            globalDrop
            onSubmit={async ({ text, files }) => {
              const trimmed = (text ?? "").trim();
              if (!trimmed && (!files || files.length === 0)) return;
              await sendMessage({ text: trimmed || "Analyse the attached document(s).", files });
            }}
          >
            <PromptInputTextarea
              ref={input}
              autoFocus
              placeholder="Ask AuditX to reconcile, explain, correct or post…"
            />
            <PromptInputFooter>
              <PromptInputTools>
                <PromptInputActionAddAttachments label="Attach broker document" />
              </PromptInputTools>
              <PromptInputSubmit status={status} onStop={stop} />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </div>
    </div>
  );
}
