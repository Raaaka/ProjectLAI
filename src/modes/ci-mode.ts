/**
 * @module project-lai/modes/ci-mode
 * Headless CI/CD mode — single-shot file analysis with JSON output.
 *
 * Loads the model, evaluates the target file, outputs structured JSON
 * to stdout, and exits with appropriate status code.
 *
 * @license Apache-2.0
 */

import type { IModelEngine, AnalysisResult } from "../types/index.js";
import { analyzeFile } from "../core/analyzer.js";

/**
 * Runs a single-shot analysis in CI/CD mode.
 * Outputs structured JSON to stdout and exits.
 *
 * @param filePath - Path to the file to analyze.
 * @param engine - An initialized IModelEngine instance.
 * @param options - Analysis options.
 * @returns The analysis result (also printed to stdout as JSON).
 */
export async function startCIMode(
  filePath: string,
  engine: IModelEngine,
  options: { prompt?: string; modelPath?: string; json?: boolean } = {}
): Promise<AnalysisResult> {
  // Log to stderr so it doesn't pollute the JSON stdout stream
  console.error(`🔍 LAI CI Mode — Analyzing: ${filePath}`);
  console.error(`📋 Prompt: ${options.prompt || "playwright-review"}`);

  try {
    const result = await analyzeFile(filePath, engine, {
      prompt: options.prompt,
      modelPath: options.modelPath,
    });

    // Determine output format
    const useJson = options.json !== false; // Default to JSON in CI mode

    if (useJson) {
      // Clean output: only the JSON result goes to stdout
      const output: AnalysisResult = {
        file: result.file,
        timestamp: result.timestamp,
        model: result.model,
        findings: result.findings,
        summary: result.summary,
      };
      // Deliberately omit rawResponse from JSON output (too verbose)
      process.stdout.write(JSON.stringify(output, null, 2) + "\n");
    } else {
      // Human-readable output
      console.log("\n─── AI Architecture Review ───────────────────────");
      if (result.findings.length === 0) {
        console.log("✅ No issues found!");
      } else {
        for (const finding of result.findings) {
          const icon =
            finding.severity === "HIGH"
              ? "🔴"
              : finding.severity === "MEDIUM"
                ? "🟠"
                : "🟡";
          console.log(
            `\n${icon} [${finding.severity}] ${finding.rule} — ${finding.location}`
          );
          console.log(`   ${finding.message}`);
          if (finding.suggestion) {
            console.log(`   💡 ${finding.suggestion}`);
          }
        }
        console.log(
          `\n📊 Summary: ${result.summary.total} findings (${result.summary.high} high, ${result.summary.medium} medium, ${result.summary.low} low)`
        );
      }
      console.log("──────────────────────────────────────────────────");
      console.log(
        `\nResult: ${result.summary.pass ? "✅ PASS" : "❌ FAIL"}\n`
      );
    }

    // Log final status to stderr
    console.error(
      `\n${result.summary.pass ? "✅ PASS" : "❌ FAIL"} — ${result.summary.total} findings (${result.summary.high} high)`
    );

    return result;
  } catch (err) {
    console.error(
      `\n❌ Analysis failed: ${err instanceof Error ? err.message : String(err)}`
    );
    process.exit(2); // Exit code 2 for errors (distinct from 1 for findings)
  }
}
