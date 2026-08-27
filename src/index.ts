/**
 * @module project-lai
 * Public library API for Project LAI.
 *
 * This module re-exports the core analysis function and all public types,
 * enabling programmatic use of LAI with full IDE IntelliSense:
 *
 * @example
 * ```typescript
 * import { analyzeFile, GemmaModelEngine, type AnalysisResult } from "project-lai";
 *
 * const engine = new GemmaModelEngine("./models/gemma-4.gguf");
 * await engine.load();
 * const result: AnalysisResult = await analyzeFile("./src/test.ts", engine);
 * console.log(result.findings);
 * await engine.dispose();
 * ```
 *
 * @license Apache-2.0
 */

// Core functions
export { analyzeFile, loadPrompt, listAvailablePrompts } from "./core/analyzer.js";

// Model engine
export { GemmaModelEngine } from "./core/model-engine.js";

// Modes (for advanced integration)
export { startAgentMode } from "./modes/agent-mode.js";
export { startCIMode } from "./modes/ci-mode.js";

// Types
export type {
  LintFinding,
  AnalysisResult,
  AnalysisSummary,
  AnalyzeOptions,
  CLIArgs,
  IModelEngine,
  Severity,
} from "./types/index.js";
