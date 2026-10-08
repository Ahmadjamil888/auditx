// ─── Schema Validator Unit Tests ──────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { validateAgentOutput, SchemaValidationError, ExtractionOutputSchema } from "./schema-validator";
import { z } from "zod";

const SimpleSchema = z.object({
  ticker:   z.string(),
  quantity: z.number().positive(),
  price:    z.number().positive(),
});

describe("validateAgentOutput — happy path", () => {
  it("parses a valid JSON string", () => {
    const raw = JSON.stringify({ ticker: "OGDC", quantity: 100, price: 150.5 });
    const result = validateAgentOutput(raw, SimpleSchema);
    expect(result.ticker).toBe("OGDC");
    expect(result.quantity).toBe(100);
  });

  it("accepts a pre-parsed object", () => {
    const result = validateAgentOutput({ ticker: "TCS", quantity: 50, price: 3990 }, SimpleSchema);
    expect(result.ticker).toBe("TCS");
  });

  it("strips markdown code fences from JSON string", () => {
    const raw = "```json\n{\"ticker\":\"HBL\",\"quantity\":200,\"price\":148.5}\n```";
    const result = validateAgentOutput(raw, SimpleSchema);
    expect(result.ticker).toBe("HBL");
  });

  it("strips bare code fences", () => {
    const raw = "```\n{\"ticker\":\"UBL\",\"quantity\":300,\"price\":182}\n```";
    const result = validateAgentOutput(raw, SimpleSchema);
    expect(result.ticker).toBe("UBL");
  });
});

describe("validateAgentOutput — error cases", () => {
  it("throws SchemaValidationError when a required field is missing", () => {
    const raw = JSON.stringify({ ticker: "OGDC", quantity: 100 }); // missing price
    expect(() => validateAgentOutput(raw, SimpleSchema, "extraction")).toThrow(SchemaValidationError);
  });

  it("throws SchemaValidationError when quantity is zero (not positive)", () => {
    const raw = JSON.stringify({ ticker: "OGDC", quantity: 0, price: 150 });
    expect(() => validateAgentOutput(raw, SimpleSchema)).toThrow(SchemaValidationError);
  });

  it("throws SchemaValidationError for completely invalid JSON string", () => {
    expect(() => validateAgentOutput("not json at all", SimpleSchema)).toThrow(SchemaValidationError);
  });

  it("error message contains the context string when provided", () => {
    const raw = JSON.stringify({ ticker: "OGDC" }); // missing quantity and price
    try {
      validateAgentOutput(raw, SimpleSchema, "my-context");
    } catch (e) {
      expect((e as SchemaValidationError).message).toContain("my-context");
    }
  });

  it("error message lists the failing field path", () => {
    const raw = JSON.stringify({ ticker: "OGDC", quantity: -5, price: 100 }); // negative qty
    try {
      validateAgentOutput(raw, SimpleSchema);
    } catch (e) {
      expect((e as SchemaValidationError).message).toContain("quantity");
    }
  });
});

describe("ExtractionOutputSchema", () => {
  it("accepts a full extraction result", () => {
    const raw = {
      transaction_date: "2025-01-15",
      ticker:           "OGDC",
      action:           "BUY",
      quantity:         500,
      price:            108.5,
      fees:             250,
      wht:              0,
      ref_id:           "TXN-001",
      broker:           "AKD",
      exchange:         "PSX",
      field_confidences: { ticker: 0.99, quantity: 0.95, price: 0.95 },
    };
    const result = validateAgentOutput(raw, ExtractionOutputSchema);
    expect(result.ticker).toBe("OGDC");
    expect(result.action).toBe("BUY");
  });

  it("accepts null values for optional fields", () => {
    const raw = {
      transaction_date:  null,
      ticker:            null,
      action:            null,
      quantity:          null,
      price:             null,
      fees:              null,
      wht:               null,
      ref_id:            null,
      broker:            null,
      exchange:          null,
      field_confidences: {},
    };
    expect(() => validateAgentOutput(raw, ExtractionOutputSchema)).not.toThrow();
  });

  it("rejects an invalid action value", () => {
    const raw = {
      transaction_date: "2025-01-15",
      ticker: "OGDC",
      action: "HOLD", // invalid
      quantity: 100,
      price: 108,
      fees: 0,
      wht: 0,
      ref_id: "X",
      broker: "AKD",
      exchange: "PSX",
      field_confidences: {},
    };
    expect(() => validateAgentOutput(raw, ExtractionOutputSchema)).toThrow(SchemaValidationError);
  });
});
