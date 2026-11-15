/**
 * @module project-lai/core/analyzer
 * Pure analysis function — the heart of Project LAI.
 *
 * This function has no side effects and no I/O coupling.
 * It accepts file content as a string and returns structured results.
 * This is the function that future MCP/RAG integrations will hook into.
 *
 * @license Apache-2.0
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AnalysisResult,
  AnalyzeOptions,
  LintFinding,
  IModelEngine,
} from "../types/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Resolves the prompts directory relative to this file's location. */
function getPromptsDir(): string {
  // In dev (src/core/), prompts is at ../../prompts
  // In dist (dist/), prompts is at ../prompts (since files is ["dist", "prompts"])
  const devPath = path.resolve(__dirname, "../../prompts");
  const distPath = path.resolve(__dirname, "../prompts");
  if (fs.existsSync(devPath)) return devPath;
  if (fs.existsSync(distPath)) return distPath;
  return devPath; // fallback
}

/**
 * Loads a system prompt from the prompts/ directory.
 * @param name - The prompt file name without extension (e.g., "playwright-review").
 * @returns The prompt content as a string.
 */
export function loadPrompt(name: string): string {
  const promptsDir = getPromptsDir();
  const promptPath = path.join(promptsDir, `${name}.md`);
  if (!fs.existsSync(promptPath)) {
    throw new Error(
      `Prompt file not found: ${promptPath}\nAvailable prompts: ${listAvailablePrompts().join(", ")}`
    );
  }
  return fs.readFileSync(promptPath, "utf-8");
}

/**
 * Lists all available prompt names in the prompts/ directory.
 */
export function listAvailablePrompts(): string[] {
  const promptsDir = getPromptsDir();
  if (!fs.existsSync(promptsDir)) return [];
  return fs
    .readdirSync(promptsDir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(".md", ""));
}

/**
 * Parses the raw model response into structured LintFinding objects.
 * Falls back gracefully if the model doesn't output valid JSON.
 */
function parseFindings(rawResponse: string): LintFinding[] {
  // Try to extract a JSON array from the response
  const jsonMatch = rawResponse.match(/\[[\s\S]*?\]/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as LintFinding[];
      if (Array.isArray(parsed)) {
        // Empty array = no issues found (valid result)
        if (parsed.length === 0) return [];
        return parsed.map((f) => ({
          severity: f.severity || "MEDIUM",
          rule: f.rule || "GENERAL",
          location: f.location || "unknown",
          message: f.message || "No description provided.",
          suggestion: f.suggestion,
        }));
      }
    } catch {
      // JSON parse failed — fall through to text parsing
    }
  }

  // Fallback: wrap the entire response as a single finding
  return [
    {
      severity: "MEDIUM",
      rule: "AI_REVIEW",
      location: "file-level",
      message: rawResponse.trim(),
    },
  ];
}

/**
 * Analyzes a file using the provided model engine.
 * This is a pure function with no CLI or I/O side effects beyond file reading.
 *
 * @param filePath - Absolute or relative path to the file to analyze.
 * @param engine - An initialized IModelEngine instance.
 * @param options - Analysis options (prompt selection, custom prompt, context docs).
 * @returns Structured analysis result with findings and summary.
 */
export async function analyzeFile(
  filePath: string,
  engine: IModelEngine,
  options: AnalyzeOptions = {}
): Promise<AnalysisResult> {
  const resolvedPath = path.resolve(filePath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`File not found: ${resolvedPath}`);
  }

  const fileContent = fs.readFileSync(resolvedPath, "utf-8");
  const fileName = path.basename(resolvedPath);

  // Resolve the system prompt
  let systemPrompt: string;
  if (options.customPrompt) {
    systemPrompt = options.customPrompt;
  } else {
    const promptName = options.prompt || "playwright-review";
    systemPrompt = loadPrompt(promptName);
  }

  // Build the full evaluation prompt
  const contextBlock =
    options.context && options.context.length > 0
      ? `\n\nAdditional Context:\n${options.context.join("\n\n---\n\n")}`
      : "";

  const jsonInstruction = `

IMPORTANT: Return your findings as a JSON array with this structure:
[
  {
    "severity": "HIGH" | "MEDIUM" | "LOW",
    "rule": "RULE_NAME",
    "location": "line X-Y",
    "message": "Description of the issue.",
    "suggestion": "How to fix it."
  }
]
If no issues are found, return an empty array: []`;

  const evaluationPrompt = `${systemPrompt}${jsonInstruction}${contextBlock}\n\nCode to analyze (${fileName}):\n\`\`\`\n${fileContent}\n\`\`\``;

  // Send to the model
  const rawResponse = await engine.prompt(evaluationPrompt);

  // Parse findings
  const findings = parseFindings(rawResponse);

  // Build summary
  const high = findings.filter((f) => f.severity === "HIGH").length;
  const medium = findings.filter((f) => f.severity === "MEDIUM").length;
  const low = findings.filter((f) => f.severity === "LOW").length;

  return {
    file: filePath,
    timestamp: new Date().toISOString(),
    model: path.basename(options.modelPath || "unknown"),
    findings,
    summary: {
      total: findings.length,
      high,
      medium,
      low,
      pass: high === 0,
    },
    rawResponse,
  };
}
