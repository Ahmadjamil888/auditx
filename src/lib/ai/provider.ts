// ─── AI Provider Abstraction ─────────────────────────────────────────────────────
//
// This interface allows AuditX to switch between AI providers (Groq, OpenRouter, etc.)
// without changing the application code.
//
// Architecture:
//   Frontend → AuditX API → AI Provider Abstraction → Groq/OpenRouter/etc → Model

import type { LanguageModel as LanguageModelV1 } from "ai";

export interface AIProviderConfig {
  apiKey: string;
  model: string;
  baseURL?: string;
  headers?: Record<string, string>;
}

export interface ResolvedAIModel {
  provider: string;
  modelId: string;
  model: LanguageModelV1;
  /** Full ordered cascade for retry logic */
  cascade: Array<{ id: string; model: LanguageModelV1 }>;
}

export interface AIProvider {
  name: string;
  resolveModel(config: AIProviderConfig): ResolvedAIModel | Promise<ResolvedAIModel>;
  isProviderError(error: unknown): boolean;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
  toolCalls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

export interface ChatCompletionOptions {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  responseFormat?: "json" | "text";
  stream?: boolean;
  tools?: Array<{
    type: "function";
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }>;
}

export interface ChatCompletionResponse {
  content: string;
  toolCalls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}
