/**
 * @module project-lai/types
 * Public type definitions for Project LAI.
 *
 * These interfaces are exported from the package root and provide
 * full IDE IntelliSense (VS Code, WebStorm, Cursor, etc.) when
 * LAI is used as an importable library.
 *
 * @license Apache-2.0
 */

// ─── Finding & Result Types ────────────────────────────────────────────────

/** Severity level for a lint finding. */
export type Severity = "HIGH" | "MEDIUM" | "LOW";

/** A single code quality finding identified by the AI model. */
export interface LintFinding {
  /** Severity classification of the finding. */
  severity: Severity;
  /** Rule identifier (e.g., "HARDCODED_DATA", "BRITTLE_SELECTOR"). */
  rule: string;
  /** Location in the source file (e.g., "line 32-33"). */
  location: string;
  /** Human-readable description of the violation. */
  message: string;
  /** Optional corrective suggestion or code snippet. */
  suggestion?: string;
}

/** Aggregated result of analyzing a single file. */
export interface AnalysisResult {
  /** Relative or absolute path of the analyzed file. */
  file: string;
  /** ISO 8601 timestamp of when the analysis was performed. */
  timestamp: string;
  /** Name/identifier of the model used for analysis. */
  model: string;
  /** List of individual findings. */
  findings: LintFinding[];
  /** Summary statistics. */
  summary: AnalysisSummary;
  /** The raw model response (for debugging). */
  rawResponse?: string;
}

/** Summary statistics for an analysis run. */
export interface AnalysisSummary {
  /** Total number of findings. */
  total: number;
  /** Count of HIGH severity findings. */
  high: number;
  /** Count of MEDIUM severity findings. */
  medium: number;
  /** Count of LOW severity findings. */
  low: number;
  /** Whether the file passes the quality threshold (no HIGH findings). */
  pass: boolean;
}

// ─── Configuration Types ───────────────────────────────────────────────────

/** Options for the analyzeFile function. */
export interface AnalyzeOptions {
  /** Path to the GGUF model file. Falls back to LAI_MODEL_PATH env var or default. */
  modelPath?: string;
  /** Name of a prompt file in the prompts/ directory (without extension). */
  prompt?: string;
  /** Inline system prompt string — overrides the prompt file. */
  customPrompt?: string;
  /** Additional context documents to include (RAG preparation). */
  context?: string[];
}

/** Parsed CLI arguments from node:util parseArgs. */
export interface CLIArgs {
  file?: string;
  interactive?: boolean;
  model?: string;
  prompt?: string;
  json?: boolean;
  help?: boolean;
  version?: boolean;
}

// ─── Model Engine Types ────────────────────────────────────────────────────

/** Interface for the model engine — abstracts the LLM backend. */
export interface IModelEngine {
  /** Load the model into memory. */
  load(): Promise<void>;
  /** Send a prompt and receive a response. */
  prompt(text: string): Promise<string>;
  /** Reset the chat session (clear conversation history). */
  resetSession(): Promise<void>;
  /** Release all resources. */
  dispose(): Promise<void>;
  /** Whether the model is currently loaded. */
  isLoaded(): boolean;
}
