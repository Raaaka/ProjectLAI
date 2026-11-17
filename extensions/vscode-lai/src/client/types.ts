/**
 * @module project-lai-extension/client/types
 * Type definitions for the OpenAI-compatible API client and extension configuration.
 *
 * @license Apache-2.0
 */

// ─── Extension Configuration ───────────────────────────────────────────────────

/** Single model endpoint configuration (matches Continue YAML schema). */
export interface LaiModelConfig {
  name: string;
  provider: string;
  model: string;
  apiBase: string;
  apiKey: string;
}

/** Full extension configuration, loadable from YAML, JSON, or VS Code settings. */
export interface LaiConfig {
  name: string;
  version: string;
  schema: string;
  models: LaiModelConfig[];
  tabAutocompleteModel?: LaiModelConfig;
  systemPrompt?: string;
  linter?: {
    enabled: boolean;
    prompt: string;
  };
}

// ─── OpenAI API Types ──────────────────────────────────────────────────────────

/** Chat message in the OpenAI messages array format. */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Request body for POST /v1/chat/completions. */
export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  stop?: string[];
}

/** A single streaming chunk from /v1/chat/completions (SSE data payload). */
export interface ChatCompletionChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: { role?: string; content?: string };
    finish_reason: string | null;
  }>;
}

/** Request body for POST /v1/completions (FIM / autocomplete). */
export interface CompletionRequest {
  model: string;
  prompt: string;
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  stop?: string[];
}

/** A single streaming chunk from /v1/completions. */
export interface CompletionChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    text: string;
    index: number;
    finish_reason: string | null;
  }>;
}

/** Non-streaming response from /v1/chat/completions. */
export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: ChatMessage;
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// ─── Context Types ─────────────────────────────────────────────────────────────

/** A resolved context item injected into the prompt. */
export interface ContextItem {
  type: "file" | "selection" | "diff" | "problems";
  label: string;
  content: string;
}

// ─── Linter Types ──────────────────────────────────────────────────────────────

/** A single lint finding produced by the AI review. */
export interface LintFinding {
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
  rule: string;
  location: string;
  message: string;
  suggestion?: string;
  line?: number;
}

/** Full analysis result from the linter. */
export interface AnalysisResult {
  file: string;
  timestamp: string;
  model: string;
  findings: LintFinding[];
  rawResponse?: string;
}

// ─── Streaming Options ─────────────────────────────────────────────────────────

/** Options passed to streaming API calls. */
export interface StreamOptions {
  signal?: AbortSignal;
  temperature?: number;
  maxTokens?: number;
  stop?: string[];
}
