/**
 * @module project-lai-extension/context/file-provider
 * Resolves @file context mentions by reading workspace files.
 *
 * @license Apache-2.0
 */

import * as vscode from "vscode";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ContextItem } from "../client/types";

/**
 * Resolves a @file:<path> mention to a ContextItem.
 * Supports relative paths from the workspace root and fuzzy basename matching.
 */
export async function resolveFileContext(
  query: string
): Promise<ContextItem | null> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) return null;

  const root = workspaceFolders[0]!.uri.fsPath;

  // Try exact path first (relative to workspace root)
  const exactPath = path.resolve(root, query);
  if (fs.existsSync(exactPath) && fs.statSync(exactPath).isFile()) {
    return readFileAsContext(exactPath, query);
  }

  // Fuzzy search by basename across workspace
  const basename = path.basename(query);
  const matches = await vscode.workspace.findFiles(
    `**/${basename}`,
    "**/node_modules/**",
    5
  );

  if (matches.length === 0) return null;

  // Pick the best match (prefer shortest path)
  const sorted = matches.sort(
    (a, b) => a.fsPath.length - b.fsPath.length
  );
  const best = sorted[0]!;
  const relPath = path.relative(root, best.fsPath);
  return readFileAsContext(best.fsPath, relPath);
}

/**
 * Reads a file and returns it as a ContextItem.
 * Truncates very large files to avoid exceeding context windows.
 */
function readFileAsContext(
  absolutePath: string,
  label: string
): ContextItem | null {
  try {
    const stat = fs.statSync(absolutePath);

    // Skip files larger than 100 KB to avoid context window overflow
    if (stat.size > 100_000) {
      const content = fs.readFileSync(absolutePath, "utf-8").slice(0, 100_000);
      return {
        type: "file",
        label: `${label} (truncated)`,
        content: `// File: ${label} (truncated to 100KB)\n${content}\n// ... (truncated)`,
      };
    }

    const content = fs.readFileSync(absolutePath, "utf-8");
    return {
      type: "file",
      label,
      content: `// File: ${label}\n${content}`,
    };
  } catch {
    return null;
  }
}

/**
 * Returns the content of the currently active editor's selection,
 * or the entire file if nothing is selected.
 */
export function getSelectionContext(): ContextItem | null {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return null;

  const selection = editor.selection;
  const document = editor.document;

  if (!selection.isEmpty) {
    const selectedText = document.getText(selection);
    const startLine = selection.start.line + 1;
    const endLine = selection.end.line + 1;
    const relPath = vscode.workspace.asRelativePath(document.uri);
    return {
      type: "selection",
      label: `${relPath}:L${startLine}-L${endLine}`,
      content: `// Selected from: ${relPath} (Lines ${startLine}-${endLine})\n${selectedText}`,
    };
  }

  return null;
}

/**
 * Returns the full content of the currently active editor file.
 */
export function getActiveFileContext(): ContextItem | null {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return null;

  const document = editor.document;
  const relPath = vscode.workspace.asRelativePath(document.uri);
  return {
    type: "file",
    label: relPath,
    content: `// File: ${relPath}\n${document.getText()}`,
  };
}
