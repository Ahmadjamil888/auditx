// ─── Google AI (Gemini) integration — @google/genai v2 ────────────────────────
// API: ai.models.generateContent({ model, contents, config })
// systemInstruction and responseMimeType go inside `config`.

import { GoogleGenAI } from "@google/genai";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ExtractedField {
  field: string;
  value: string;
  confidence: number;
}

export interface ParsedStatement {
  fields: ExtractedField[];
  transaction_date?: string;
  ticker?: string;
  action?: "BUY" | "SELL" | "DIV";
  quantity?: number;
  price?: number;
  fees?: number;
  wht?: number;
  ref_id?: string;
  broker?: string;
  exchange?: string;
  overall_confidence: number;
  needs_review: boolean;
}

export interface AnomalyExplanation {
  summary: string;
  severity: "low" | "medium" | "high";
  recommended_action: string;
}

export interface TaxExplanation {
  plain_english: string;
  key_points: string[];
  disclaimer: string;
}

// ── Client factory ────────────────────────────────────────────────────────────

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

// ── System prompt ─────────────────────────────────────────────────────────────

const PARSE_SYSTEM = `You are an expert financial document parser specializing in PSX (Pakistan) and NSE (India) trade confirmations, broker slips, contract notes, and dividend vouchers.

Extract all fields and return ONLY a valid JSON object with this exact structure — no markdown, no code fences:
{
  "transaction_date": "YYYY-MM-DD or null",
  "ticker": "SYMBOL or null",
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

Confidence scoring: 1.0 = explicitly stated, 0.85–0.95 = clearly implied, 0.65–0.8 = inferred, below 0.65 = uncertain.
For DIV action: price = dividend per share, wht = total withholding tax deducted.
Numbers should be plain numbers without currency symbols or commas.
Return ONLY the JSON object — nothing else.`;

// ── Parse JSON safely, stripping any accidental markdown fences ───────────────

function safeParseJSON(raw: string): Record<string, unknown> {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  return JSON.parse(cleaned) as Record<string, unknown>;
}

// ── Build extracted fields array ──────────────────────────────────────────────

function buildFields(parsed: Record<string, unknown>, confidences: Record<string, number>): ExtractedField[] {
  return [
    { field: "Transaction Date",  value: String(parsed.transaction_date ?? ""), confidence: confidences.transaction_date ?? 0.5 },
    { field: "Ticker Symbol",     value: String(parsed.ticker ?? ""),           confidence: confidences.ticker           ?? 0.5 },
    { field: "Action",            value: String(parsed.action ?? ""),           confidence: confidences.action           ?? 0.5 },
    { field: "Quantity",          value: String(parsed.quantity ?? ""),         confidence: confidences.quantity         ?? 0.5 },
    { field: "Execution Price",   value: String(parsed.price ?? ""),            confidence: confidences.price            ?? 0.5 },
    { field: "Commission / Fees", value: String(parsed.fees ?? 0),             confidence: confidences.fees             ?? 0.5 },
    { field: "WHT",               value: String(parsed.wht ?? 0),              confidence: confidences.wht              ?? 0.5 },
    { field: "Reference ID",      value: String(parsed.ref_id ?? ""),           confidence: confidences.ref_id           ?? 0.5 },
    { field: "Broker Name",       value: String(parsed.broker ?? ""),           confidence: confidences.broker           ?? 0.5 },
    { field: "Exchange",          value: String(parsed.exchange ?? ""),         confidence: confidences.exchange         ?? 0.5 },
  ];
}

function toStatement(parsed: Record<string, unknown>, fields: ExtractedField[]): ParsedStatement {
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
  };
}

// ── Image / PDF parsing (base64) ──────────────────────────────────────────────

export async function parseDocument(
  fileBase64: string,
  mimeType: string,
  filename: string,
): Promise<ParsedStatement> {
  const ai = getClient();

  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { data: fileBase64, mimeType } },
          { text: `Parse this trade confirmation document (filename: ${filename}). Return only the JSON.` },
        ],
      },
    ],
    config: {
      systemInstruction: PARSE_SYSTEM,
      responseMimeType: "application/json",
      temperature: 0.1,
      maxOutputTokens: 1024,
    },
  });

  const text = response.text ?? "";
  const parsed = safeParseJSON(text);
  const confidences = (parsed.field_confidences as Record<string, number>) ?? {};
  return toStatement(parsed, buildFields(parsed, confidences));
}

// ── Plain text / CSV parsing ──────────────────────────────────────────────────

export async function parseTextDocument(
  textContent: string,
  filename: string,
): Promise<ParsedStatement> {
  const ai = getClient();

  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `Parse this trade confirmation text (filename: ${filename}):\n\n${textContent.slice(0, 6000)}\n\nReturn only the JSON.`,
          },
        ],
      },
    ],
    config: {
      systemInstruction: PARSE_SYSTEM,
      responseMimeType: "application/json",
      temperature: 0.1,
      maxOutputTokens: 1024,
    },
  });

  const text = response.text ?? "";
  const parsed = safeParseJSON(text);
  const confidences = (parsed.field_confidences as Record<string, number>) ?? {};
  return toStatement(parsed, buildFields(parsed, confidences));
}

// ── Anomaly explanation ───────────────────────────────────────────────────────

export async function explainAnomaly(
  flagType: string,
  expected: unknown,
  actual: unknown,
  ticker: string,
  jurisdiction: string,
): Promise<AnomalyExplanation> {
  try {
    const ai = getClient();
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `You are a financial compliance expert for ${jurisdiction} markets.
A reconciliation engine detected:
- Flag: ${flagType}
- Ticker: ${ticker}
- Expected: ${JSON.stringify(expected)}
- Actual: ${JSON.stringify(actual)}

Return ONLY this JSON (no markdown):
{"summary":"1-2 sentences explaining what happened","severity":"low|medium|high","recommended_action":"What the trader should do"}`,
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        temperature: 0.2,
      },
    });

    return safeParseJSON(response.text ?? "{}") as AnomalyExplanation;
  } catch {
    return {
      summary: `${flagType} on ${ticker}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`,
      severity: "medium",
      recommended_action: "Review the original document and contact your broker if the discrepancy persists.",
    };
  }
}

// ── Tax computation explanation ───────────────────────────────────────────────

export async function explainTaxComputation(
  jurisdiction: string,
  shortTermGain: number,
  longTermGain: number,
  estimatedTaxDue: number,
  filerStatus: string,
): Promise<TaxExplanation> {
  try {
    const ai = getClient();
    const currency = jurisdiction === "PSX" ? "PKR" : "INR";

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `You are a tax advisor for ${jurisdiction} equity investors.
Computed results (by deterministic FIFO engine, not AI):
- Short-term gains: ${currency} ${shortTermGain.toLocaleString()}
- Long-term gains: ${currency} ${longTermGain.toLocaleString()}
- Estimated tax due: ${currency} ${estimatedTaxDue.toLocaleString()}
- Filer status: ${filerStatus}

Explain these results in plain English for a retail trader with no accounting background.
Return ONLY this JSON (no markdown):
{"plain_english":"2-3 sentence summary","key_points":["point 1","point 2","point 3"],"disclaimer":"short disclaimer"}`,
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        temperature: 0.3,
      },
    });

    return safeParseJSON(response.text ?? "{}") as TaxExplanation;
  } catch {
    const currency = jurisdiction === "PSX" ? "PKR" : "INR";
    return {
      plain_english: `Based on your trading activity, the system computed ${currency} ${estimatedTaxDue.toLocaleString()} in estimated tax due.`,
      key_points: [
        "Short-term gains are taxed at a higher rate than long-term",
        "FIFO lot matching determines your holding periods",
        "Dividend WHT is tracked separately and may already be paid",
      ],
      disclaimer: "These calculations are indicative only. Consult a qualified tax professional before filing.",
    };
  }
}

// ── Portfolio analysis narrative ──────────────────────────────────────────────

export async function analyzePortfolio(
  holdings: Array<{ ticker: string; unrealizedPnl: number; holdingDays: number }>,
  realizedGain: number,
  jurisdiction: string,
): Promise<string> {
  try {
    const ai = getClient();
    const currency = jurisdiction === "PSX" ? "PKR" : "INR";

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `You are a portfolio analyst for ${jurisdiction} equity markets.
Portfolio summary: realized gain/loss ${currency} ${realizedGain.toLocaleString()}.
Current positions: ${JSON.stringify(holdings.slice(0, 8))}.

Write a 2-3 sentence portfolio health summary in plain English.
Focus on: concentration risk, holding-period mix, and overall performance.
Do NOT recommend specific buy/sell actions. Plain text only — no JSON, no markdown.`,
            },
          ],
        },
      ],
      config: { temperature: 0.4, maxOutputTokens: 220 },
    });

    return response.text?.trim() ?? "Portfolio analysis unavailable.";
  } catch {
    return "Portfolio analysis requires VITE_GOOGLE_AI_API_KEY to be configured in your .env file.";
  }
}
