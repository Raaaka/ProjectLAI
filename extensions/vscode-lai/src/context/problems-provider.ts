/**
 * @module project-lai-extension/context/problems-provider
 * Resolves @problems context by reading VS Code's current diagnostics.
 *
 * @license Apache-2.0
 */

import * as vscode from "vscode";
import type { ContextItem } from "../client/types";

/**
 * Returns all current diagnostics (errors, warnings) from VS Code's
 * Problems panel as a ContextItem.
 */
export function getProblemsContext(): ContextItem | null {
  const allDiagnostics = vscode.languages.getDiagnostics();

  const relevantEntries: string[] = [];

  for (const [uri, diagnostics] of allDiagnostics) {
    if (diagnostics.length === 0) continue;

    const relPath = vscode.workspace.asRelativePath(uri);
    const fileProblems = diagnostics
      .filter(
        (d) =>
          d.severity === vscode.DiagnosticSeverity.Error ||
          d.severity === vscode.DiagnosticSeverity.Warning
      )
      .map((d) => {
        const severity =
          d.severity === vscode.DiagnosticSeverity.Error ? "ERROR" : "WARNING";
        const line = d.range.start.line + 1;
        const col = d.range.start.character + 1;
        const source = d.source ? ` [${d.source}]` : "";
        return `  ${severity} at line ${line}:${col}${source}: ${d.message}`;
      });

    if (fileProblems.length > 0) {
      relevantEntries.push(`// ${relPath}\n${fileProblems.join("\n")}`);
    }
  }

  if (relevantEntries.length === 0) {
    return null;
  }

  return {
    type: "problems",
    label: `problems (${relevantEntries.length} files)`,
    content:
      "// Current IDE Diagnostics (Errors & Warnings):\n\n" +
      relevantEntries.join("\n\n"),
  };
}

/**
 * Returns diagnostics for a specific file only.
 */
export function getFileProblemsContext(
  uri: vscode.Uri
): ContextItem | null {
  const diagnostics = vscode.languages.getDiagnostics(uri);
  if (diagnostics.length === 0) return null;

  const relPath = vscode.workspace.asRelativePath(uri);

  const lines = diagnostics
    .filter(
      (d) =>
        d.severity === vscode.DiagnosticSeverity.Error ||
        d.severity === vscode.DiagnosticSeverity.Warning
    )
    .map((d) => {
      const severity =
        d.severity === vscode.DiagnosticSeverity.Error ? "ERROR" : "WARNING";
      const line = d.range.start.line + 1;
      return `  ${severity} at line ${line}: ${d.message}`;
    });

  if (lines.length === 0) return null;

  return {
    type: "problems",
    label: `problems: ${relPath}`,
    content: `// Diagnostics for ${relPath}:\n${lines.join("\n")}`,
  };
}
