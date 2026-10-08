// ─── Agent Queue Logic Tests (pure, no Supabase) ─────────────────────────────
import { describe, it, expect } from "vitest";

// ── Idempotency key helpers (pure functions we can test without DB) ────────────

function makeUploadKey(orgId: string, documentId: string): string {
  return `upload:${orgId}:${documentId}`;
}

function makeSheetKey(sourceId: string, hash: string): string {
  return `sheet:${sourceId}:${hash}`;
}

function makeNightlyKey(orgId: string, date: string): string {
  return `nightly:${orgId}:${date}`;
}

function makeMonthlyKey(orgId: string, yearMonth: string): string {
  return `monthly:${orgId}:${yearMonth}`;
}

// ── Loop-prevention logic (pure) ──────────────────────────────────────────────

interface JobSummary { output_hash?: string }

function wasAgentWrite(recentJobs: Array<{ result_summary: JobSummary | null }>, hash: string): boolean {
  return recentJobs.some((j) => j.result_summary?.output_hash === hash);
}

// ── Debounce check (pure) ─────────────────────────────────────────────────────

function shouldDebounce(lastCompletedAtMs: number | null, debounceMs = 8000): boolean {
  if (lastCompletedAtMs === null) return false;
  return Date.now() - lastCompletedAtMs < debounceMs;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("idempotency keys", () => {
  it("upload key is deterministic for same inputs", () => {
    expect(makeUploadKey("org-1", "doc-abc")).toBe(makeUploadKey("org-1", "doc-abc"));
  });

  it("upload keys differ for different documents", () => {
    expect(makeUploadKey("org-1", "doc-abc")).not.toBe(makeUploadKey("org-1", "doc-xyz"));
  });

  it("sheet key embeds hash so same content never re-enqueues", () => {
    const k1 = makeSheetKey("src-1", "hash-aaa");
    const k2 = makeSheetKey("src-1", "hash-aaa");
    expect(k1).toBe(k2);
  });

  it("sheet key differs when content changes", () => {
    expect(makeSheetKey("src-1", "hash-aaa")).not.toBe(makeSheetKey("src-1", "hash-bbb"));
  });

  it("nightly key is date-scoped so second run same day is duplicate", () => {
    expect(makeNightlyKey("org-1", "2026-10-08")).toBe(makeNightlyKey("org-1", "2026-10-08"));
  });

  it("nightly keys differ across days", () => {
    expect(makeNightlyKey("org-1", "2026-10-08")).not.toBe(makeNightlyKey("org-1", "2026-10-09"));
  });

  it("monthly key is month-scoped", () => {
    expect(makeMonthlyKey("org-1", "2026-10")).toBe(makeMonthlyKey("org-1", "2026-10"));
  });

  it("monthly keys differ across months", () => {
    expect(makeMonthlyKey("org-1", "2026-10")).not.toBe(makeMonthlyKey("org-1", "2026-11"));
  });
});

describe("loop prevention — wasAgentWrite", () => {
  it("returns false when no recent jobs", () => {
    expect(wasAgentWrite([], "hash-abc")).toBe(false);
  });

  it("returns true when a recent completed job produced the same hash", () => {
    const jobs = [{ result_summary: { output_hash: "hash-abc" } }];
    expect(wasAgentWrite(jobs, "hash-abc")).toBe(true);
  });

  it("returns false when recent jobs produced different hashes", () => {
    const jobs = [
      { result_summary: { output_hash: "hash-xyz" } },
      { result_summary: { output_hash: "hash-def" } },
    ];
    expect(wasAgentWrite(jobs, "hash-abc")).toBe(false);
  });

  it("returns false when result_summary is null", () => {
    const jobs = [{ result_summary: null }];
    expect(wasAgentWrite(jobs, "hash-abc")).toBe(false);
  });

  it("handles missing output_hash key gracefully", () => {
    const jobs = [{ result_summary: {} }];
    expect(wasAgentWrite(jobs, "hash-abc")).toBe(false);
  });
});

describe("debounce check", () => {
  it("returns false when no previous job completed", () => {
    expect(shouldDebounce(null)).toBe(false);
  });

  it("returns true when last job completed within debounce window", () => {
    const recentMs = Date.now() - 3000; // 3 seconds ago < 8s window
    expect(shouldDebounce(recentMs, 8000)).toBe(true);
  });

  it("returns false when last job completed outside debounce window", () => {
    const oldMs = Date.now() - 10000; // 10 seconds ago > 8s window
    expect(shouldDebounce(oldMs, 8000)).toBe(false);
  });

  it("returns true right at the boundary (just inside)", () => {
    const borderMs = Date.now() - 7999;
    expect(shouldDebounce(borderMs, 8000)).toBe(true);
  });
});
