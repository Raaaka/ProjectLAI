/**
 * @module project-lai-extension/providers/autocomplete
 * Tab autocomplete provider — real-time ghost text suggestions.
 *
 * Implements vscode.InlineCompletionItemProvider to provide Fill-In-The-Middle
 * (FIM) completions using the local LLM. Requests are debounced and cancellable
 * to avoid flooding the inference server during rapid typing.
 *
 * Compatible FIM formats:
 *   - Qwen2.5-Coder:  <|fim_prefix|>...<|fim_suffix|>...<|fim_middle|>
 *   - DeepSeek-Coder:  <｜fim▁begin｜>...<｜fim▁hole｜>...<｜fim▁end｜>
 *   - Gemma / Generic: prefix + suffix concatenation fallback
 *
 * @license Apache-2.0
 */

import * as vscode from "vscode";
import { OpenAIClient } from "../client/openai-client";

/** FIM token templates for supported model families. */
const FIM_TEMPLATES: Record<
  string,
  { prefix: string; suffix: string; middle: string }
> = {
  qwen: {
    prefix: "<|fim_prefix|>",
    suffix: "<|fim_suffix|>",
    middle: "<|fim_middle|>",
  },
  deepseek: {
    prefix: "<｜fim▁begin｜>",
    suffix: "<｜fim▁hole｜>",
    middle: "<｜fim▁end｜>",
  },
  starcoder: {
    prefix: "<fim_prefix>",
    suffix: "<fim_suffix>",
    middle: "<fim_middle>",
  },
  codellama: {
    prefix: "<PRE>",
    suffix: " <SUF>",
    middle: " <MID>",
  },
};

/**
 * Detects the FIM template to use based on the model name.
 */
function detectFimTemplate(modelName: string): {
  prefix: string;
  suffix: string;
  middle: string;
} {
  const lower = modelName.toLowerCase();
  if (lower.includes("qwen")) return FIM_TEMPLATES["qwen"]!;
  if (lower.includes("deepseek")) return FIM_TEMPLATES["deepseek"]!;
  if (lower.includes("starcoder")) return FIM_TEMPLATES["starcoder"]!;
  if (lower.includes("codellama") || lower.includes("code-llama"))
    return FIM_TEMPLATES["codellama"]!;
  // Default to Qwen format (most widely supported)
  return FIM_TEMPLATES["qwen"]!;
}

/**
 * Registers the InlineCompletionItemProvider for tab autocomplete.
 * Returns a Disposable to unregister it.
 */
export function registerAutocompleteProvider(
  context: vscode.ExtensionContext,
  client: OpenAIClient
): vscode.Disposable {
  const provider = new LaiAutocompleteProvider(client);

  const disposable = vscode.languages.registerInlineCompletionItemProvider(
    { pattern: "**" }, // All file types
    provider
  );

  context.subscriptions.push(disposable);
  return disposable;
}

class LaiAutocompleteProvider
  implements vscode.InlineCompletionItemProvider
{
  private _debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private _pendingAbort: AbortController | null = null;

  constructor(private readonly _client: OpenAIClient) {}

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _context: vscode.InlineCompletionContext,
    cancellationToken: vscode.CancellationToken
  ): Promise<vscode.InlineCompletionItem[] | undefined> {
    // Check if autocomplete is enabled
    const cfg = vscode.workspace.getConfiguration("lai");
    if (!cfg.get<boolean>("autocomplete.enabled", true)) {
      return undefined;
    }

    // Cancel any in-flight request
    this._pendingAbort?.abort();
    this._pendingAbort = null;

    // Clear existing debounce timer
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }

    // Debounce — wait before sending the request
    const debounceMs = cfg.get<number>("autocomplete.debounceMs", 250);

    return new Promise((resolve) => {
      this._debounceTimer = setTimeout(async () => {
        if (cancellationToken.isCancellationRequested) {
          resolve(undefined);
          return;
        }

        try {
          const result = await this._getCompletion(
            document,
            position,
            cancellationToken
          );
          resolve(result);
        } catch {
          resolve(undefined);
        }
      }, debounceMs);

      // If VS Code cancels (user typed more), clear the timer
      cancellationToken.onCancellationRequested(() => {
        if (this._debounceTimer) {
          clearTimeout(this._debounceTimer);
          this._debounceTimer = null;
        }
        this._pendingAbort?.abort();
        resolve(undefined);
      });
    });
  }

  private async _getCompletion(
    document: vscode.TextDocument,
    position: vscode.Position,
    cancellationToken: vscode.CancellationToken
  ): Promise<vscode.InlineCompletionItem[] | undefined> {
    const cfg = vscode.workspace.getConfiguration("lai");
    const maxTokens = cfg.get<number>("autocomplete.maxTokens", 256);

    // Build FIM prompt
    const prefix = document.getText(
      new vscode.Range(new vscode.Position(0, 0), position)
    );
    const suffix = document.getText(
      new vscode.Range(
        position,
        document.lineAt(document.lineCount - 1).range.end
      )
    );

    // Limit context window (keep ~2000 chars before and ~500 after cursor)
    const trimmedPrefix = prefix.slice(-2000);
    const trimmedSuffix = suffix.slice(0, 500);

    const modelName = this._client.getModel();
    const fim = detectFimTemplate(modelName);

    const prompt = `${fim.prefix}${trimmedPrefix}${fim.suffix}${trimmedSuffix}${fim.middle}`;

    // Create abort controller
    const abortController = new AbortController();
    this._pendingAbort = abortController;

    cancellationToken.onCancellationRequested(() => {
      abortController.abort();
    });

    try {
      // Collect the full completion (non-streaming for ghost text)
      let completionText = "";
      for await (const token of this._client.streamCompletion(prompt, {
        signal: abortController.signal,
        temperature: 0.2,
        maxTokens,
        stop: ["\n\n", fim.suffix, "<|endoftext|>", "<|end|>"],
      })) {
        completionText += token;

        // Stop if we have enough content (avoid runaway generation)
        if (completionText.length > 500) break;
      }

      completionText = completionText.trimEnd();

      if (!completionText) {
        return undefined;
      }

      const item = new vscode.InlineCompletionItem(
        completionText,
        new vscode.Range(position, position)
      );

      return [item];
    } catch {
      return undefined;
    } finally {
      this._pendingAbort = null;
    }
  }
}
