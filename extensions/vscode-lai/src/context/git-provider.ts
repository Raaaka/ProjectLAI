/**
 * @module project-lai-extension/context/git-provider
 * Resolves @diff and @git context mentions using VS Code's built-in Git extension.
 *
 * @license Apache-2.0
 */

import * as vscode from "vscode";
import { execSync } from "node:child_process";
import * as path from "node:path";
import type { ContextItem } from "../client/types";

/**
 * Returns the current git diff (uncommitted changes) as a ContextItem.
 * Falls back to running `git diff` via CLI if the Git extension isn't available.
 */
export async function getDiffContext(): Promise<ContextItem | null> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) return null;

  const root = workspaceFolders[0]!.uri.fsPath;

  try {
    // Try staged + unstaged diff
    const stagedDiff = runGitCommand("git diff --cached", root);
    const unstagedDiff = runGitCommand("git diff", root);

    const parts: string[] = [];
    if (stagedDiff.trim()) {
      parts.push("// === Staged Changes ===\n" + stagedDiff);
    }
    if (unstagedDiff.trim()) {
      parts.push("// === Unstaged Changes ===\n" + unstagedDiff);
    }

    if (parts.length === 0) {
      return {
        type: "diff",
        label: "git diff (no changes)",
        content: "// No uncommitted changes detected.",
      };
    }

    return {
      type: "diff",
      label: "git diff",
      content: parts.join("\n\n"),
    };
  } catch (err) {
    console.warn("[LAI Context] Git diff failed:", err);
    return null;
  }
}

/**
 * Returns the diff for a specific file.
 */
export async function getFileDiffContext(
  filePath: string
): Promise<ContextItem | null> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) return null;

  const root = workspaceFolders[0]!.uri.fsPath;
  const relPath = path.relative(root, filePath);

  try {
    const diff = runGitCommand(`git diff -- "${relPath}"`, root);
    if (!diff.trim()) {
      return null;
    }

    return {
      type: "diff",
      label: `diff: ${relPath}`,
      content: `// Git diff for: ${relPath}\n${diff}`,
    };
  } catch {
    return null;
  }
}

/**
 * Returns the git log (last N commits) as context.
 */
export async function getGitLogContext(
  count: number = 10
): Promise<ContextItem | null> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) return null;

  const root = workspaceFolders[0]!.uri.fsPath;

  try {
    const log = runGitCommand(
      `git log --oneline -${count}`,
      root
    );

    if (!log.trim()) return null;

    return {
      type: "diff",
      label: `git log (last ${count})`,
      content: `// Recent commits:\n${log}`,
    };
  } catch {
    return null;
  }
}

/**
 * Executes a git command synchronously and returns stdout.
 */
function runGitCommand(command: string, cwd: string): string {
  try {
    return execSync(command, {
      cwd,
      encoding: "utf-8",
      timeout: 10_000,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch {
    return "";
  }
}
