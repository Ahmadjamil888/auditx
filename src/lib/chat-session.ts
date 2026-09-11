import type { UIMessage } from "ai";

const PREFIX = "auditx.chat.";

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Quota or private mode — draft persistence is best-effort.
  }
}

export function loadComposerDraft(scope: string): string {
  return read(`draft.${scope}`, "");
}

export function saveComposerDraft(scope: string, text: string) {
  write(`draft.${scope}`, text);
}

export function clearComposerDraft(scope: string) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(PREFIX + `draft.${scope}`);
}

export function loadCachedMessages(threadId: string): UIMessage[] {
  return read<UIMessage[]>(`messages.${threadId}`, []);
}

export function saveCachedMessages(threadId: string, messages: UIMessage[]) {
  write(`messages.${threadId}`, messages);
}

export function setPendingPrompt(text: string) {
  write("pending-prompt", text);
}

export function takePendingPrompt(): string {
  const text = read("pending-prompt", "");
  if (typeof window !== "undefined") localStorage.removeItem(PREFIX + "pending-prompt");
  return text;
}

let pendingFiles: File[] = [];

export function setPendingFiles(files: File[]) {
  pendingFiles = files;
}

export function takePendingFiles(): File[] {
  const files = pendingFiles;
  pendingFiles = [];
  return files;
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
