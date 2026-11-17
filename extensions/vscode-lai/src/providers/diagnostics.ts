/**
 * @module project-lai-extension/providers/diagnostics
 * LAI Linter diagnostics provider.
 *
 * Runs the AI linter on file save (or on command) using the configured
 * prompt ruleset from the prompts/ directory. Populates the VS Code
 * Problems panel with structured findings and provides Code Actions
 * (quick-fix lightbulbs) for each finding.
 *
 * @license Apache-2.0
 */

import * as vscode from "vscode";
import * as fs from "node:fs";
import * as path from "node:path";
import { OpenAIClient } from "../client/openai-client";
import type { ChatMessage, LintFinding } from "../client/types";

const DIAGNOSTIC_SOURCE = "Project LAI";
const DIAGNOSTIC_COLLECTION_ID = "lai-linter";

/**
 * Registers the LAI linter diagnostics provider.
 * Returns the DiagnosticCollection for external use.
 */
export function registerDiagnosticsProvider(
  context: vscode.ExtensionContext,
  client: OpenAIClient
): vscode.DiagnosticCollection {
  const diagnosticCollection =
    vscode.languages.createDiagnosticCollection(DIAGNOSTIC_COLLECTION_ID);
  context.subscriptions.push(diagnosticCollection);

  // Run linter on file save
  const onSave = vscode.workspace.onDidSaveTextDocument(async (document) => {
    const cfg = vscode.workspace.getConfiguration("lai");
    if (!cfg.get<boolean>("linter.enabled", true)) return;

    // Only lint source code files
    const supportedLanguages = [
      "typescript",
      "typescriptreact",
      "javascript",
      "javascriptreact",
      "python",
      "java",
      "csharp",
      "go",
      "rust",
      "cpp",
      "c",
    ];
    if (!supportedLanguages.includes(document.languageId)) return;

    await runLinter(document, client, diagnosticCollection, cfg);
  });

  context.subscriptions.push(onSave);

  // Register the manual review command
  const reviewCommand = vscode.commands.registerCommand(
    "lai.reviewFile",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage("No active file to review.");
        return;
      }

      const cfg = vscode.workspace.getConfiguration("lai");
      await runLinter(editor.document, client, diagnosticCollection, cfg);
    }
  );

  context.subscriptions.push(reviewCommand);

  // Register Code Action provider (quick-fix lightbulbs)
  const codeActionProvider = vscode.languages.registerCodeActionsProvider(
    { pattern: "**" },
    new LaiCodeActionProvider(client),
    {
      providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
    }
  );

  context.subscriptions.push(codeActionProvider);

  // Clear diagnostics when files are closed
  const onClose = vscode.workspace.onDidCloseTextDocument((document) => {
    diagnosticCollection.delete(document.uri);
  });
  context.subscriptions.push(onClose);

  return diagnosticCollection;
}

/**
 * Runs the AI linter on a document and populates diagnostics.
 */
async function runLinter(
  document: vscode.TextDocument,
  client: OpenAIClient,
  diagnosticCollection: vscode.DiagnosticCollection,
  cfg: vscode.WorkspaceConfiguration
): Promise<void> {
  const promptName = cfg.get<string>("linter.prompt", "playwright-review");
  const fileContent = document.getText();
  const relPath = vscode.workspace.asRelativePath(document.uri);

  // Load the prompt ruleset from the prompts/ directory
  const systemPrompt = loadPromptRuleset(promptName) || getDefaultLinterPrompt();

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `Review the following file and return a JSON array of findings.

File: ${relPath} (${document.languageId})

\`\`\`${document.languageId}
${fileContent}
\`\`\`

Respond with ONLY a JSON array of objects with these fields:
- severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO"
- rule: short rule name (e.g., "NO_IMPLICIT_ANY", "MISSING_ERROR_HANDLING")
- location: description of where in the file
- line: line number (1-based) if identifiable
- message: description of the issue
- suggestion: how to fix it (optional)

If no issues found, return an empty array: []`,
    },
  ];

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Window,
        title: `LAI: Reviewing ${path.basename(relPath)}...`,
      },
      async () => {
        const response = await client.chatCompletion(messages, {
          temperature: 0.3,
          maxTokens: 2048,
        });

        const findings = parseFindings(response);
        const diagnostics = findingsToDiagnostics(findings, document);
        diagnosticCollection.set(document.uri, diagnostics);

        if (findings.length === 0) {
          vscode.window.showInformationMessage(
            `LAI: No issues found in ${path.basename(relPath)}.`
          );
        } else {
          vscode.window.showInformationMessage(
            `LAI: Found ${findings.length} issue(s) in ${path.basename(relPath)}.`
          );
        }
      }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`LAI Linter Error: ${msg}`);
  }
}

/**
 * Parses the AI response into structured LintFinding objects.
 */
function parseFindings(rawResponse: string): LintFinding[] {
  // Try to extract a JSON array from the response
  const jsonMatch = rawResponse.match(/\[[\s\S]*?\]/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as LintFinding[];
      if (Array.isArray(parsed)) {
        return parsed.map((f) => ({
          severity: f.severity || "MEDIUM",
          rule: f.rule || "AI_REVIEW",
          location: f.location || "unknown",
          message: f.message || "No description provided.",
          suggestion: f.suggestion,
          line: f.line,
        }));
      }
    } catch {
      // JSON parse failed
    }
  }

  // If the response isn't empty but not JSON, create a single finding
  if (rawResponse.trim()) {
    return [
      {
        severity: "MEDIUM",
        rule: "AI_REVIEW",
        location: "file-level",
        message: rawResponse.trim().slice(0, 500),
      },
    ];
  }

  return [];
}

/**
 * Converts LintFindings to VS Code Diagnostic objects.
 */
function findingsToDiagnostics(
  findings: LintFinding[],
  document: vscode.TextDocument
): vscode.Diagnostic[] {
  return findings.map((f) => {
    // Determine the line (0-based for VS Code)
    let lineNumber = 0;
    if (f.line && f.line > 0) {
      lineNumber = Math.min(f.line - 1, document.lineCount - 1);
    }

    const line = document.lineAt(lineNumber);
    const range = line.range;

    // Map severity
    let severity: vscode.DiagnosticSeverity;
    switch (f.severity) {
      case "CRITICAL":
      case "HIGH":
        severity = vscode.DiagnosticSeverity.Error;
        break;
      case "MEDIUM":
        severity = vscode.DiagnosticSeverity.Warning;
        break;
      case "LOW":
      case "INFO":
        severity = vscode.DiagnosticSeverity.Information;
        break;
      default:
        severity = vscode.DiagnosticSeverity.Warning;
    }

    const message = f.suggestion
      ? `[${f.rule}] ${f.message}\n💡 Suggestion: ${f.suggestion}`
      : `[${f.rule}] ${f.message}`;

    const diagnostic = new vscode.Diagnostic(range, message, severity);
    diagnostic.source = DIAGNOSTIC_SOURCE;
    diagnostic.code = f.rule;

    return diagnostic;
  });
}

/**
 * Loads a prompt ruleset from the prompts/ directory.
 * Searches in both the workspace and the extension's bundled prompts.
 */
function loadPromptRuleset(name: string): string | null {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) return null;

  const root = workspaceFolders[0]!.uri.fsPath;

  // Search paths for the prompt file
  const searchPaths = [
    path.join(root, "prompts", `${name}.md`),
    path.join(root, ".lai", "prompts", `${name}.md`),
    // Look in the parent ProjectLAI repo's prompts/ dir
    path.join(root, "..", "prompts", `${name}.md`),
  ];

  for (const p of searchPaths) {
    try {
      if (fs.existsSync(p)) {
        return fs.readFileSync(p, "utf-8");
      }
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Returns the default linter prompt when no custom ruleset is found.
 */
function getDefaultLinterPrompt(): string {
  return `You are Project LAI, an expert code reviewer and static analysis engine.
Analyze the provided source code for:
1. Bugs and logical errors
2. Type safety issues and potential runtime exceptions
3. Security vulnerabilities (injection, auth bypass, data exposure)
4. Performance anti-patterns (N+1 queries, unnecessary re-renders, memory leaks)
5. Code quality and maintainability concerns
6. Missing error handling and edge cases

Be concise and actionable. Only report genuine issues, not stylistic preferences.`;
}

/**
 * Code Action provider that offers "Fix with LAI" quick-fix options
 * for each LAI diagnostic.
 */
class LaiCodeActionProvider implements vscode.CodeActionProvider {
  constructor(private readonly _client: OpenAIClient) {}

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    _token: vscode.CancellationToken
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    for (const diagnostic of context.diagnostics) {
      if (diagnostic.source !== DIAGNOSTIC_SOURCE) continue;

      const action = new vscode.CodeAction(
        `💡 Fix with Project LAI: ${diagnostic.code}`,
        vscode.CodeActionKind.QuickFix
      );
      action.diagnostics = [diagnostic];
      action.isPreferred = true;

      // The fix command will trigger inline edit with the diagnostic context
      action.command = {
        command: "lai.inlineEdit",
        title: "Fix with LAI",
      };

      actions.push(action);
    }

    return actions;
  }
}
