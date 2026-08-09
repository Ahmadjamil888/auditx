// ─── AuditX AI Service — Agentic pipeline on Google Gemini ───────────────────
//
// MODEL CASCADE (free tier, both stable GA models):
//   1. gemini-2.5-flash   → primary (best price/performance, free tier)
//   2. gemini-2.5-pro     → fallback (most capable, lower quota)
//
// AGENTIC ARCHITECTURE:
//   • Retry-with-exponential-backoff on quota errors (429 / RESOURCE_EXHAUSTED)
//   • Model cascade: if flash quota exhausted, promote to pro automatically
//   • Per-task specialised system prompts (parse / anomaly / tax / portfolio)
//   • safeParseJSON strips accidental markdown fences from model output

import { GoogleGenAI } from "@google/genai";

// ── Model registry ─────────────────────────────────────────────────────────────

const MODELS = {
  /** Primary: best free-tier price/performance */
  FLASH: "gemini-2.5-flash",
  /** Fallback: most capable, lower quota */
  PRO:   "gemini-2.5-pro",
} as const;

type ModelKey = keyof typeof MODELS;

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ExtractedField {
  field:      string;
  value:      string;
  confidence: number;
}

export interface ParsedStatement {
  fields:           ExtractedField[];
  transaction_date?: string;
  ticker?:           string;
  action?:           "BUY" | "SELL" | "DIV";
  quantity?:         number;
  price?:            number;
  fees?:             number;
  wht?:              number;
  ref_id?:           string;
  broker?:           string;
  exchange?:         string;
  overall_confidence: number;
  needs_review:       boolean;
  model_used?:        string;
}

export interface AnomalyExplanation {
  summary:              string;
  severity:             "low" | "medium" | "high";
  recommended_action:   string;
}

export interface TaxExplanation {
  plain_english: string;
  key_points:    string[];
  disclaimer:    string;
}

// ── Client factory ─────────────────────────────────────────────────────────────

function getClient(): GoogleGenAI {
  const key = (import.meta.env.VITE_GOOGLE_AI_API_KEY as string | undefined) ?? "";
  if (!key || key.length < 10) {
    throw new Error(
      "Google AI API key not configured. Add VITE_GOOGLE_AI_API_KEY to your .env file. " +
      "Get a free key at https://aistudio.google.com/app/apikey",
    );
  }
  return new GoogleGenAI({ apiKey: key });
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function isQuotaError(e: unknown): boolean {
  const msg = String((e as Error)?.message ?? "").toLowerCase();
  return (
    msg.includes("429") ||
    msg.includes("quota") ||
    msg.includes("resource_exhausted") ||
    msg.includes("rate limit")
  );
}

function safeParseJSON(raw: string): Record<string, unknown> {
  // Strip markdown code fences the model may accidentally add
  let cleaned = raw
    .replace(/^```(?:json)?\s*/im, "")
    .replace(/\s*```\s*$/im, "")
    .trim();
  
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch (e) {
    const error = e as Error;
    console.error("[AuditX AI] JSON parse failed:", {
      error: error.message,
      rawPreview: cleaned.slice(0, 200),
      fullLength: cleaned.length,
    });
    
    // Try to fix common issues
    try {
      // Fix unescaped quotes in string values by replacing them
      const fixedQuotes = cleaned.replace(/(?<!\\)"(?!,|\s*[\]}])/g, '\\"');
      return JSON.parse(fixedQuotes) as Record<string, unknown>;
    } catch {
      // If still fails, try to escape newlines in string values
      try {
        const fixedNewlines = cleaned.replace(/(?<!\\)\n/g, '\\n');
        return JSON.parse(fixedNewlines) as Record<string, unknown>;
      } catch {
        throw new Error(
          `Failed to parse AI response as JSON. Raw output: ${cleaned.slice(0, 500)}...`
        );
      }
    }
  }
}

// ── Agentic model runner ───────────────────────────────────────────────────────
// Tries LITE first; on quota error cascades to FLASH; retries with backoff.

interface RunOptions {
  contents:    unknown;
  config:      Record<string, unknown>;
  taskLabel?:  string;
}

async function runWithCascade(opts: RunOptions): Promise<string> {
  const ai = getClient();
  const cascade: ModelKey[] = ["FLASH", "PRO"];

  for (const modelKey of cascade) {
    const model = MODELS[modelKey];
    const maxRetries = modelKey === "LITE" ? 2 : 1;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          // Exponential backoff: 1s, 2s
          await new Promise((r) => setTimeout(r, 1000 * attempt));
        }

        const response = await ai.models.generateContent({
          model,
          contents: opts.contents as Parameters<typeof ai.models.generateContent>[0]["contents"],
          config:   opts.config  as Parameters<typeof ai.models.generateContent>[0]["config"],
        });

        const text = response.text ?? "";
        if (!text.trim()) throw new Error("Empty response from model.");
        return text;

      } catch (e) {
        const isLast = attempt === maxRetries && modelKey === cascade[cascade.length - 1];

        if (isQuotaError(e)) {
          if (attempt < maxRetries) continue;          // retry same model
          console.warn(`[AuditX AI] Quota exhausted on ${model}, cascading…`);
          break;                                       // try next model
        }

        if (isLast) throw e;                           // non-quota error on last attempt
        if (!isQuotaError(e)) throw e;                 // non-quota error → don't retry
      }
    }
  }

  throw new Error(
    "All Google AI models are currently rate-limited. Please wait a minute and try again. " +
    "Free tier limits: gemini-2.5-flash-lite (1 000 req/day), gemini-2.5-flash (250 req/day).",
  );
}

// ── Document parsing system prompt ────────────────────────────────────────────

const PARSE_SYSTEM = `You are an expert financial document parser specialising in PSX (Pakistan) and NSE (India) trade confirmations, broker slips, contract notes, and dividend vouchers.

Extract every field and return ONLY a valid JSON object — no markdown, no code fences, no explanation.

CRITICAL JSON FORMAT RULES:
- All string values must escape newlines as \\n (literal backslash + n), never include actual line breaks
- All string values must escape double quotes as \\" (literal backslash + ")
- Never include literal unescaped quotes or newlines inside JSON string values
- Return a single complete JSON object, nothing before or after

JSON schema:
{
  "transaction_date": "YYYY-MM-DD or null",
  "ticker": "EXCHANGE_SYMBOL or null",
  "action": "BUY or SELL or DIV or null",
  "quantity": number or null,
  "price": number or null,
  "fees": number or null,
  "wht": number or null,
  "ref_id": "string or null",
  "broker": "string or null",
  "exchange": "PSX or NSE or null",
  "field_confidences": {
    "transaction_date": 0.0,
    "ticker": 0.0,
    "action": 0.0,
    "quantity": 0.0,
    "price": 0.0,
    "fees": 0.0,
    "wht": 0.0,
    "ref_id": 0.0,
    "broker": 0.0,
    "exchange": 0.0
  }
}

Confidence: 1.0 = explicitly stated, 0.85–0.95 = clearly implied, 0.65–0.8 = inferred, <0.65 = uncertain.
For DIV: price = dividend per share, wht = total withholding tax deducted. Numbers must be plain numbers without currency symbols or commas.
Return ONLY the JSON object — nothing else.`;

// ── Field builder ──────────────────────────────────────────────────────────────

function buildFields(parsed: Record<string, unknown>, conf: Record<string, number>): ExtractedField[] {
  return [
    { field: "Transaction Date",  value: String(parsed.transaction_date ?? ""), confidence: conf.transaction_date ?? 0.5 },
    { field: "Ticker Symbol",     value: String(parsed.ticker   ?? ""),          confidence: conf.ticker           ?? 0.5 },
    { field: "Action",            value: String(parsed.action   ?? ""),          confidence: conf.action           ?? 0.5 },
    { field: "Quantity",          value: String(parsed.quantity ?? ""),          confidence: conf.quantity         ?? 0.5 },
    { field: "Execution Price",   value: String(parsed.price    ?? ""),          confidence: conf.price            ?? 0.5 },
    { field: "Commission / Fees", value: String(parsed.fees     ?? 0),           confidence: conf.fees             ?? 0.5 },
    { field: "WHT",               value: String(parsed.wht      ?? 0),           confidence: conf.wht              ?? 0.5 },
    { field: "Reference ID",      value: String(parsed.ref_id   ?? ""),          confidence: conf.ref_id           ?? 0.5 },
    { field: "Broker Name",       value: String(parsed.broker   ?? ""),          confidence: conf.broker           ?? 0.5 },
    { field: "Exchange",          value: String(parsed.exchange ?? ""),          confidence: conf.exchange         ?? 0.5 },
  ];
}

function toStatement(
  parsed: Record<string, unknown>,
  fields: ExtractedField[],
  modelUsed?: string,
): ParsedStatement {
  const overall_confidence = fields.reduce((s, f) => s + f.confidence, 0) / fields.length;
  return {
    fields,
    transaction_date: parsed.transaction_date as string | undefined,
    ticker:           parsed.ticker           as string | undefined,
    action:           parsed.action           as "BUY" | "SELL" | "DIV" | undefined,
    quantity:         parsed.quantity         as number | undefined,
    price:            parsed.price            as number | undefined,
    fees:             parsed.fees             as number | undefined,
    wht:              parsed.wht              as number | undefined,
    ref_id:           parsed.ref_id           as string | undefined,
    broker:           parsed.broker           as string | undefined,
    exchange:         parsed.exchange         as string | undefined,
    overall_confidence,
    needs_review: fields.some((f) => f.confidence < 0.75),
    model_used: modelUsed,
  };
}

// ── Agent: parse image/PDF (base64) ───────────────────────────────────────────

export async function parseDocument(
  fileBase64: string,
  mimeType:   string,
  filename:   string,
): Promise<ParsedStatement> {
  const text = await runWithCascade({
    taskLabel: "parse-document",
    contents: [
      {
        role:  "user",
        parts: [
          { inlineData: { data: fileBase64, mimeType } },
          { text: `Parse this trade confirmation (${filename}). Return only the JSON.` },
        ],
      },
    ],
    config: {
      systemInstruction: PARSE_SYSTEM,
      responseMimeType:  "application/json",
      temperature:       0.1,
      maxOutputTokens:   1024,
    },
  });

  const parsed = safeParseJSON(text);
  const conf   = (parsed.field_confidences as Record<string, number>) ?? {};
  return toStatement(parsed, buildFields(parsed, conf));
}

// ── Agent: parse plain text / CSV ─────────────────────────────────────────────

export async function parseTextDocument(
  textContent: string,
  filename:    string,
): Promise<ParsedStatement> {
  const text = await runWithCascade({
    taskLabel: "parse-text",
    contents: [
      {
        role:  "user",
        parts: [
          {
            text: `Parse this trade confirmation text (${filename}):\n\n${textContent.slice(0, 6000)}\n\nReturn only the JSON.`,
          },
        ],
      },
    ],
    config: {
      systemInstruction: PARSE_SYSTEM,
      responseMimeType:  "application/json",
      temperature:       0.1,
      maxOutputTokens:   1024,
    },
  });

  const parsed = safeParseJSON(text);
  const conf   = (parsed.field_confidences as Record<string, number>) ?? {};
  return toStatement(parsed, buildFields(parsed, conf));
}

// ── Agent: explain anomaly / reconciliation flag ───────────────────────────────

export async function explainAnomaly(
  flagType:     string,
  expected:     unknown,
  actual:       unknown,
  ticker:       string,
  jurisdiction: string,
): Promise<AnomalyExplanation> {
  try {
    const text = await runWithCascade({
      taskLabel: "explain-anomaly",
      contents: [
        {
          role:  "user",
          parts: [
            {
              text:
                `You are a financial compliance expert for ${jurisdiction} markets.\n` +
                `A reconciliation engine detected:\n` +
                `- Flag: ${flagType}\n` +
                `- Ticker: ${ticker}\n` +
                `- Expected: ${JSON.stringify(expected)}\n` +
                `- Actual: ${JSON.stringify(actual)}\n\n` +
                `Return ONLY this JSON (no markdown):\n` +
                `{"summary":"1-2 sentences","severity":"low|medium|high","recommended_action":"what to do"}`,
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        temperature:      0.2,
      },
    });

    return safeParseJSON(text) as AnomalyExplanation;
  } catch {
    return {
      summary:            `${flagType} on ${ticker}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`,
      severity:           "medium",
      recommended_action: "Review the original document and contact your broker if the discrepancy persists.",
    };
  }
}

// ── Agent: explain tax computation ────────────────────────────────────────────

export async function explainTaxComputation(
  jurisdiction:     string,
  shortTermGain:    number,
  longTermGain:     number,
  estimatedTaxDue:  number,
  filerStatus:      string,
): Promise<TaxExplanation> {
  try {
    const currency = jurisdiction === "PSX" ? "PKR" : "INR";
    const text = await runWithCascade({
      taskLabel: "explain-tax",
      contents: [
        {
          role:  "user",
          parts: [
            {
              text:
                `You are a tax advisor for ${jurisdiction} equity investors.\n` +
                `Computed results (by deterministic FIFO engine — not AI):\n` +
                `- Short-term gains: ${currency} ${shortTermGain.toLocaleString()}\n` +
                `- Long-term gains:  ${currency} ${longTermGain.toLocaleString()}\n` +
                `- Estimated tax due: ${currency} ${estimatedTaxDue.toLocaleString()}\n` +
                `- Filer status: ${filerStatus}\n\n` +
                `Explain in plain English for a retail trader with no accounting background.\n` +
                `Return ONLY this JSON (no markdown):\n` +
                `{"plain_english":"2-3 sentences","key_points":["p1","p2","p3"],"disclaimer":"short"}`,
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        temperature:      0.3,
      },
    });

    return safeParseJSON(text) as TaxExplanation;
  } catch {
    const currency = jurisdiction === "PSX" ? "PKR" : "INR";
    return {
      plain_english: `Your FIFO computation shows ${currency} ${estimatedTaxDue.toLocaleString()} estimated tax due.`,
      key_points: [
        "Short-term gains are taxed at a higher rate than long-term",
        "FIFO lot matching determines holding periods",
        "Dividend WHT is tracked separately and may already be withheld",
      ],
      disclaimer: "Indicative only. Consult a qualified tax professional before filing.",
    };
  }
}

// ── Agent: portfolio health narrative ─────────────────────────────────────────

export async function analyzePortfolio(
  holdings:     Array<{ ticker: string; unrealizedPnl: number; holdingDays: number }>,
  realizedGain: number,
  jurisdiction: string,
): Promise<string> {
  try {
    const currency = jurisdiction === "PSX" ? "PKR" : "INR";
    const text = await runWithCascade({
      taskLabel: "portfolio-analysis",
      contents: [
        {
          role:  "user",
          parts: [
            {
              text:
                `You are a portfolio analyst for ${jurisdiction} equity markets.\n` +
                `Realized gain/loss: ${currency} ${realizedGain.toLocaleString()}.\n` +
                `Positions: ${JSON.stringify(holdings.slice(0, 8))}.\n\n` +
                `Write a 2-3 sentence portfolio health summary in plain English.\n` +
                `Focus on: concentration risk, holding-period mix, overall performance.\n` +
                `Do NOT recommend specific buy/sell actions. Plain text only.`,
            },
          ],
        },
      ],
      config: { temperature: 0.4, maxOutputTokens: 220 },
    });

    return text.trim();
  } catch {
    return "Portfolio analysis temporarily unavailable — free-tier quota reached. Try again in a minute.";
  }
}
