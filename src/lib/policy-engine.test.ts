// ─── Policy Engine Unit Tests ─────────────────────────────────────────────────
// Run with: vitest --run src/lib/policy-engine.test.ts

import { describe, it, expect } from "vitest";
import {
  classifyAction,
  assertApproved,
  isInClosedPeriod,
  PolicyViolationError,
  DEFAULT_POLICY,
  type AgentAction,
  type PolicyContext,
  type OrgPolicyConfig,
} from "./policy-engine";

function ctx(overrides: Partial<OrgPolicyConfig> = {}): PolicyContext {
  return {
    config: { ...DEFAULT_POLICY, ...overrides },
    runId:  "test-run-001",
  };
}

function action(overrides: Partial<AgentAction> = {}): AgentAction {
  return {
    tool:           "flag_anomaly",
    confidence:     0.95,
    affects:        "flag",
    isDestructive:  false,
    isClosedPeriod: false,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
describe("classifyAction — AUTO tier", () => {
  it("returns AUTO for allowed tool at high confidence", () => {
    expect(classifyAction(action({ tool: "flag_anomaly", confidence: 0.95 }), ctx())).toBe("AUTO");
  });

  it("returns AUTO for run_fifo at confidence 0.91", () => {
    expect(classifyAction(action({ tool: "run_fifo", confidence: 0.91 }), ctx())).toBe("AUTO");
  });

  it("returns AUTO for categorize at exactly the auto threshold", () => {
    expect(classifyAction(action({ tool: "categorize", confidence: 0.90 }), ctx())).toBe("AUTO");
  });

  it("returns AUTO for remove_duplicate under amount limit", () => {
    const c = ctx({ auto_fix_duplicate_under_amount: 500, allowed_auto_actions: ["remove_duplicate"] });
    expect(classifyAction(action({ tool: "remove_duplicate", confidence: 0.95, amountUsd: 100 }), c)).toBe("AUTO");
  });

  it("does NOT return AUTO when amount exceeds limit", () => {
    const c = ctx({ auto_fix_duplicate_under_amount: 500, allowed_auto_actions: ["remove_duplicate"] });
    expect(classifyAction(action({ tool: "remove_duplicate", confidence: 0.95, amountUsd: 600 }), c)).not.toBe("AUTO");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("classifyAction — NOTIFY tier", () => {
  it("returns NOTIFY for an unlisted tool at confidence 0.80", () => {
    expect(classifyAction(action({ tool: "insert_transaction", confidence: 0.80 }), ctx())).toBe("NOTIFY");
  });

  it("returns NOTIFY when confidence is just below auto threshold", () => {
    expect(classifyAction(action({ tool: "flag_anomaly", confidence: 0.89 }), ctx())).toBe("NOTIFY");
  });

  it("returns NOTIFY for high-confidence field fill from source doc", () => {
    expect(classifyAction(action({ tool: "update_transaction", confidence: 0.82, affects: "ledger" }), ctx())).toBe("NOTIFY");
  });

  it("returns NOTIFY when confidence exactly equals notify threshold", () => {
    expect(classifyAction(action({ tool: "insert_transaction", confidence: 0.75 }), ctx())).toBe("NOTIFY");
  });

  it("returns NOTIFY not AUTO when tool is not in allowed list at high confidence", () => {
    expect(classifyAction(action({ tool: "insert_transaction", confidence: 0.95 }), ctx())).toBe("NOTIFY");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("classifyAction — REVIEW tier", () => {
  it("returns REVIEW for confidence below notify threshold", () => {
    expect(classifyAction(action({ confidence: 0.70 }), ctx())).toBe("REVIEW");
  });

  it("returns REVIEW for very low confidence 0.50", () => {
    expect(classifyAction(action({ confidence: 0.50 }), ctx())).toBe("REVIEW");
  });

  it("returns REVIEW for unknown tool at 0.74 confidence", () => {
    expect(classifyAction(action({ tool: "unknown_tool", confidence: 0.74 }), ctx())).toBe("REVIEW");
  });

  it("returns REVIEW just below notify threshold 0.74", () => {
    expect(classifyAction(action({ tool: "insert_transaction", confidence: 0.74 }), ctx())).toBe("REVIEW");
  });

  it("returns REVIEW with custom low notify threshold override", () => {
    const c = ctx({ confidence_threshold_notify: 0.85 });
    expect(classifyAction(action({ tool: "insert_transaction", confidence: 0.80 }), c)).toBe("REVIEW");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("classifyAction — STOP tier", () => {
  it("returns STOP for delete_transaction regardless of confidence", () => {
    expect(classifyAction(action({ tool: "delete_transaction", confidence: 1.0 }), ctx())).toBe("STOP");
  });

  it("returns STOP for destructive actions", () => {
    expect(classifyAction(action({ isDestructive: true, confidence: 0.99 }), ctx())).toBe("STOP");
  });

  it("returns STOP when affects === source", () => {
    expect(classifyAction(action({ affects: "source", confidence: 0.99 }), ctx())).toBe("STOP");
  });

  it("returns STOP for export_tax_report", () => {
    expect(classifyAction(action({ tool: "export_tax_report", confidence: 0.99 }), ctx())).toBe("STOP");
  });

  it("returns STOP for closed-period transaction", () => {
    expect(classifyAction(action({ isClosedPeriod: true, confidence: 0.99 }), ctx())).toBe("STOP");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("assertApproved", () => {
  it("throws PolicyViolationError for STOP tier", () => {
    expect(() => assertApproved("STOP", "delete_transaction")).toThrow(PolicyViolationError);
  });

  it("does not throw for AUTO tier", () => {
    expect(() => assertApproved("AUTO", "flag_anomaly")).not.toThrow();
  });

  it("does not throw for NOTIFY tier", () => {
    expect(() => assertApproved("NOTIFY", "insert_transaction")).not.toThrow();
  });

  it("does not throw for REVIEW tier", () => {
    expect(() => assertApproved("REVIEW", "insert_transaction")).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("isInClosedPeriod", () => {
  it("returns false when no closed-period date configured", () => {
    expect(isInClosedPeriod("2024-01-01", DEFAULT_POLICY)).toBe(false);
  });

  it("returns true for date before closed-period threshold", () => {
    const cfg = { ...DEFAULT_POLICY, never_touch_closed_periods_before: "2024-04-01" };
    expect(isInClosedPeriod("2024-03-15", cfg)).toBe(true);
  });

  it("returns false for date after closed-period threshold", () => {
    const cfg = { ...DEFAULT_POLICY, never_touch_closed_periods_before: "2024-04-01" };
    expect(isInClosedPeriod("2024-05-01", cfg)).toBe(false);
  });

  it("returns false for date equal to threshold (boundary inclusive on after side)", () => {
    const cfg = { ...DEFAULT_POLICY, never_touch_closed_periods_before: "2024-04-01" };
    expect(isInClosedPeriod("2024-04-01", cfg)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("threshold boundary conditions", () => {
  it("custom auto threshold 0.9 rejects 0.88 from AUTO", () => {
    const c = ctx({ confidence_threshold_auto: 0.9 });
    const result = classifyAction(action({ tool: "flag_anomaly", confidence: 0.88 }), c);
    expect(result).not.toBe("AUTO");
  });

  it("custom auto threshold 0.8 promotes 0.85 to AUTO", () => {
    const c = ctx({ confidence_threshold_auto: 0.8 });
    const result = classifyAction(action({ tool: "flag_anomaly", confidence: 0.85 }), c);
    expect(result).toBe("AUTO");
  });
});
