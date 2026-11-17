/**
 * @module project-lai-extension/providers/inline-edit
 * Inline edit provider — the Ctrl+I experience.
 *
 * Captures the current editor selection (or the full function/block),
 * asks the user for an instruction via a quick-input prompt,
 * streams the AI-generated replacement, and presents an interactive
 * diff view for the user to accept or reject.
 *
 * @license Apache-2.0
 */

import * as vscode from "vscode";
import { OpenAIClient } from "../client/openai-client";
import type { ChatMessage } from "../client/types";

const INLINE_EDIT_SYSTEM_PROMPT = `You are Project LAI, an expert AI code editor. The user will provide a code selection and an instruction for how to modify it.

Rules:
1. Output ONLY the replacement code — no explanations, no markdown fences, no preamble.
2. Preserve the original indentation style and formatting conventions.
3. If the instruction is unclear, make the most reasonable interpretation.
4. Do NOT add comments explaining what you changed unless the user asks for them.`;

/**
 * Registers the lai.inlineEdit command.
 */
export function registerInlineEditCommand(
  context: vscode.ExtensionContext,
  client: OpenAIClient,
  systemPrompt?: string
): void {
  const command = vscode.commands.registerCommand(
    "lai.inlineEdit",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage("No active editor.");
        return;
      }

      // Get the selection or expand to the enclosing block
      let selection = editor.selection;
      if (selection.isEmpty) {
        // Expand to the full line the cursor is on
        const line = editor.document.lineAt(selection.active.line);
        selection = new vscode.Selection(line.range.start, line.range.end);
      }

      const selectedText = editor.document.getText(selection);
      if (!selectedText.trim()) {
        vscode.window.showWarningMessage("No code selected for inline edit.");
        return;
      }

      // Ask the user for their edit instruction
      const instruction = await vscode.window.showInputBox({
        prompt: "What would you like LAI to do with this code?",
        placeHolder:
          "e.g., Refactor to use async/await, Add error handling, Optimize...",
        ignoreFocusOut: true,
      });

      if (!instruction) return; // User cancelled

      // Show progress
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "LAI: Generating edit...",
          cancellable: true,
        },
        async (progress, token) => {
          const abortController = new AbortController();
          token.onCancellationRequested(() => abortController.abort());

          const fileName = vscode.workspace.asRelativePath(
            editor.document.uri
          );
          const languageId = editor.document.languageId;
          const startLine = selection.start.line + 1;
          const endLine = selection.end.line + 1;

          const messages: ChatMessage[] = [
            {
              role: "system",
              content: systemPrompt || INLINE_EDIT_SYSTEM_PROMPT,
            },
            {
              role: "user",
              content: `File: ${fileName} (${languageId}, lines ${startLine}-${endLine})

Selected code:
\`\`\`${languageId}
${selectedText}
\`\`\`

Instruction: ${instruction}

Output ONLY the replacement code, nothing else.`,
            },
          ];

          try {
            let generatedCode = "";
            progress.report({ message: "Streaming response..." });

            for await (const chunk of client.streamChatCompletion(messages, {
              signal: abortController.signal,
              temperature: 0.3,
            })) {
              generatedCode += chunk;
            }

            // Strip markdown code fences if the model wrapped the output
            generatedCode = stripCodeFences(generatedCode);

            if (!generatedCode.trim()) {
              vscode.window.showWarningMessage(
                "LAI returned an empty response."
              );
              return;
            }

            // Show diff and let the user accept or reject
            await showInlineDiff(
              editor,
              selection,
              selectedText,
              generatedCode
            );
          } catch (err: unknown) {
            if (
              err instanceof Error &&
              err.message === "Request aborted"
            ) {
              vscode.window.showInformationMessage(
                "LAI: Inline edit cancelled."
              );
            } else {
              const msg =
                err instanceof Error ? err.message : String(err);
              vscode.window.showErrorMessage(`LAI Error: ${msg}`);
            }
          }
        }
      );
    }
  );

  context.subscriptions.push(command);
}

/**
 * Shows a diff between the original and generated code, with accept/reject options.
 */
async function showInlineDiff(
  editor: vscode.TextEditor,
  selection: vscode.Selection,
  originalCode: string,
  generatedCode: string
): Promise<void> {
  const choice = await vscode.window.showInformationMessage(
    "LAI: Review the suggested edit",
    { modal: false },
    "✅ Accept",
    "👁 Preview Diff",
    "❌ Reject"
  );

  if (choice === "✅ Accept") {
    // Apply the edit
    await editor.edit((editBuilder) => {
      editBuilder.replace(selection, generatedCode);
    });
    vscode.window.showInformationMessage("LAI: Edit applied.");
  } else if (choice === "👁 Preview Diff") {
    // Show diff in a temporary file comparison
    const originalUri = vscode.Uri.parse(
      `untitled:Original (before LAI edit)`
    );
    const modifiedUri = vscode.Uri.parse(
      `untitled:Modified (LAI suggestion)`
    );

    // Create virtual documents for diff
    const originalDoc = await vscode.workspace.openTextDocument({
      content: originalCode,
      language: editor.document.languageId,
    });
    const modifiedDoc = await vscode.workspace.openTextDocument({
      content: generatedCode,
      language: editor.document.languageId,
    });

    await vscode.commands.executeCommand(
      "vscode.diff",
      originalDoc.uri,
      modifiedDoc.uri,
      "LAI: Original ↔ Suggested"
    );

    // Ask again after showing diff
    const finalChoice = await vscode.window.showInformationMessage(
      "Apply the LAI suggestion?",
      "✅ Accept",
      "❌ Reject"
    );

    if (finalChoice === "✅ Accept") {
      await editor.edit((editBuilder) => {
        editBuilder.replace(selection, generatedCode);
      });
      vscode.window.showInformationMessage("LAI: Edit applied.");
    }
  }
  // "Reject" or dismiss = do nothing
}

/**
 * Strips markdown code fences from the model output if present.
 */
function stripCodeFences(code: string): string {
  const trimmed = code.trim();

  // Match ```lang\n...\n``` pattern
  const fenceMatch = trimmed.match(/^```\w*\n([\s\S]*?)\n```$/);
  if (fenceMatch) {
    return fenceMatch[1]!;
  }

  // Match ``` at start and end without language
  if (trimmed.startsWith("```") && trimmed.endsWith("```")) {
    const inner = trimmed.slice(3, -3).trim();
    // Remove optional language identifier on first line
    const firstNewline = inner.indexOf("\n");
    if (firstNewline >= 0 && firstNewline < 20) {
      const firstLine = inner.slice(0, firstNewline).trim();
      if (/^\w*$/.test(firstLine)) {
        return inner.slice(firstNewline + 1);
      }
    }
    return inner;
  }

  return trimmed;
}
