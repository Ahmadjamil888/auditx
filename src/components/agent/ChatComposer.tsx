import { FileText, Loader2, Paperclip, Plus, X } from "lucide-react";
import { useRef } from "react";
import type { AgentAttachment } from "@/lib/agent-service";

export function AttachmentChip({
  attachment,
  onRemove,
  compact,
}: {
  attachment: AgentAttachment;
  onRemove?: (id: string) => void;
  compact?: boolean;
}) {
  return (
    <span
      className="inline-flex max-w-full items-center gap-2 rounded-xl border bg-white px-2.5 py-1.5 text-xs"
      style={{ borderColor: "var(--hairline)" }}
    >
      <FileText size={13} strokeWidth={1.75} style={{ color: "var(--color-accent)", flexShrink: 0 }} />
      <span className="truncate" style={{ maxWidth: compact ? 110 : 180 }}>
        {attachment.name}
      </span>
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${attachment.name}`}
          onClick={() => onRemove(attachment.id)}
          style={{ color: "var(--ink-3)" }}
        >
          <X size={12} strokeWidth={2} />
        </button>
      )}
    </span>
  );
}

export function ChatComposer({
  value,
  onChange,
  onSubmit,
  attachments,
  onAddFiles,
  onRemoveAttachment,
  busy,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  attachments: AgentAttachment[];
  onAddFiles: (files: FileList | null) => void;
  onRemoveAttachment: (id: string) => void;
  busy: boolean;
  placeholder: string;
  disabled: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const canSend = !busy && !disabled && (value.trim().length > 0 || attachments.length > 0);

  return (
    <div
      className="rounded-2xl bg-white transition-shadow"
      style={{ border: "1px solid var(--hairline)", boxShadow: "var(--shadow-card)" }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        onAddFiles(e.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        className="sr-only"
        accept=".pdf,.png,.jpg,.jpeg,.csv,.xlsx,.xls,.txt"
        onChange={(e) => {
          onAddFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 px-3 pt-3">
          {attachments.map((a) => (
            <AttachmentChip key={a.id} attachment={a} onRemove={onRemoveAttachment} />
          ))}
        </div>
      )}

      <div className="flex items-end gap-2 p-3">
        <button
          type="button"
          aria-label="Attach files"
          onClick={() => inputRef.current?.click()}
          className="flex size-9 shrink-0 items-center justify-center rounded-xl border transition-colors hover:bg-black/5"
          style={{ borderColor: "var(--hairline)" }}
        >
          <Plus size={17} strokeWidth={1.75} />
        </button>

        <textarea
          rows={2}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (canSend) onSubmit();
            }
          }}
          placeholder={placeholder}
          className="max-h-40 min-h-9 flex-1 resize-none bg-transparent py-1.5 text-sm outline-none"
          style={{ color: "var(--color-text)" }}
        />

        <button
          type="button"
          aria-label="Send"
          disabled={!canSend}
          onClick={onSubmit}
          className="flex size-9 shrink-0 items-center justify-center rounded-xl text-white transition-opacity disabled:opacity-40"
          style={{ background: "var(--color-accent)" }}
        >
          {busy ? (
            <Loader2 size={16} strokeWidth={2} className="animate-spin" />
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M8 13V3M8 3L3.5 7.5M8 3l4.5 4.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      </div>

      <div
        className="flex items-center gap-1.5 border-t px-3 py-2 text-xs"
        style={{ borderColor: "var(--hairline)", color: "var(--ink-3)" }}
      >
        <Paperclip size={11} strokeWidth={1.75} />
        PDF · PNG · JPG · CSV · XLSX — Enter to send, Shift + Enter for a new line
      </div>
    </div>
  );
}
