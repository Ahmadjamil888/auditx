// ─── Policy Learner Unit Tests (pure logic, no Supabase) ─────────────────────
import { describe, it, expect } from "vitest";

// ── Inline streak calculation (pure) ─────────────────────────────────────────
interface ApprovalRecord {
  action_type: string;
  status:      "approved" | "rejected" | "skipped" | "pending";
}

function countStreak(
  recent:     ApprovalRecord[],
  actionType: string,
  decision:   "approved" | "rejected",
): number {
  return recent.filter((r) => r.action_type === actionType && r.status === decision).length;
}

function shouldLearn(streak: number, threshold = 3): boolean {
  return streak >= threshold;
}

function applyApproval(
  currentAllowed: string[],
  actionType:     string,
  decision:       "approved" | "rejected",
): string[] {
  if (decision === "approved" && !currentAllowed.includes(actionType)) {
    return [...currentAllowed, actionType];
  }
  if (decision === "rejected") {
    return currentAllowed.filter((a) => a !== actionType);
  }
  return currentAllowed;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("streak counting", () => {
  it("counts consecutive approvals of the same action type", () => {
    const records: ApprovalRecord[] = [
      { action_type: "flag_anomaly", status: "approved" },
      { action_type: "flag_anomaly", status: "approved" },
      { action_type: "flag_anomaly", status: "approved" },
    ];
    expect(countStreak(records, "flag_anomaly", "approved")).toBe(3);
  });

  it("only counts matching action type", () => {
    const records: ApprovalRecord[] = [
      { action_type: "flag_anomaly",      status: "approved" },
      { action_type: "insert_transaction", status: "approved" },
      { action_type: "flag_anomaly",      status: "approved" },
    ];
    expect(countStreak(records, "flag_anomaly", "approved")).toBe(2);
  });

  it("returns 0 when no matching records", () => {
    const records: ApprovalRecord[] = [
      { action_type: "other_action", status: "approved" },
    ];
    expect(countStreak(records, "flag_anomaly", "approved")).toBe(0);
  });

  it("counts rejections separately from approvals", () => {
    const records: ApprovalRecord[] = [
      { action_type: "flag_anomaly", status: "approved" },
      { action_type: "flag_anomaly", status: "rejected" },
      { action_type: "flag_anomaly", status: "rejected" },
      { action_type: "flag_anomaly", status: "rejected" },
    ];
    expect(countStreak(records, "flag_anomaly", "rejected")).toBe(3);
    expect(countStreak(records, "flag_anomaly", "approved")).toBe(1);
  });
});

describe("shouldLearn threshold", () => {
  it("triggers at exactly 3 consecutive decisions", () => {
    expect(shouldLearn(3)).toBe(true);
  });

  it("does not trigger at 2", () => {
    expect(shouldLearn(2)).toBe(false);
  });

  it("triggers above threshold", () => {
    expect(shouldLearn(5)).toBe(true);
  });

  it("respects custom threshold", () => {
    expect(shouldLearn(4, 5)).toBe(false);
    expect(shouldLearn(5, 5)).toBe(true);
  });
});

describe("applyApproval — allowed list mutation", () => {
  it("adds action to allowed list on approval if not already present", () => {
    const result = applyApproval(["flag_anomaly"], "insert_transaction", "approved");
    expect(result).toContain("insert_transaction");
    expect(result).toContain("flag_anomaly");
  });

  it("does not duplicate action on approval if already in list", () => {
    const result = applyApproval(["flag_anomaly", "insert_transaction"], "insert_transaction", "approved");
    expect(result.filter((a) => a === "insert_transaction")).toHaveLength(1);
  });

  it("removes action from allowed list on rejection", () => {
    const result = applyApproval(["flag_anomaly", "insert_transaction"], "insert_transaction", "rejected");
    expect(result).not.toContain("insert_transaction");
    expect(result).toContain("flag_anomaly");
  });

  it("is a no-op rejection when action not in list", () => {
    const allowed = ["flag_anomaly"];
    const result  = applyApproval(allowed, "unknown_action", "rejected");
    expect(result).toEqual(allowed);
  });

  it("handles empty allowed list", () => {
    const result = applyApproval([], "flag_anomaly", "approved");
    expect(result).toEqual(["flag_anomaly"]);
  });
});
