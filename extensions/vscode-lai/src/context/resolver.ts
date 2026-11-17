/**
 * @module project-lai-extension/context/resolver
 * Parses @ mentions in user messages and resolves them into context items.
 *
 * Supported mentions:
 *   @file:<path>     — Injects the contents of a workspace file
 *   @selection       — Injects the current editor selection
 *   @diff            — Injects uncommitted git changes
 *   @problems        — Injects current IDE diagnostics (errors/warnings)
 *
 * @license Apache-2.0
 */

import type { ChatMessage, ContextItem } from "../client/types";
import { resolveFileContext, getSelectionContext } from "./file-provider";
import { getDiffContext } from "./git-provider";
import { getProblemsContext } from "./problems-provider";

/** Regex to match @mention patterns in user input. */
const MENTION_PATTERN = /@(file:[\w./\\-]+|selection|diff|problems)/g;

/**
 * Scans a user message for @ mentions, resolves each one to a ContextItem,
 * and returns the enriched message with context injected as a system preamble.
 */
export async function resolveContext(
  userMessage: string
): Promise<{ cleanMessage: string; contextItems: ContextItem[] }> {
  const mentions = [...userMessage.matchAll(MENTION_PATTERN)];
  const contextItems: ContextItem[] = [];

  for (const match of mentions) {
    const mention = match[1]!;
    let item: ContextItem | null = null;

    if (mention.startsWith("file:")) {
      const filePath = mention.slice(5);
      item = await resolveFileContext(filePath);
    } else if (mention === "selection") {
      item = getSelectionContext();
    } else if (mention === "diff") {
      item = await getDiffContext();
    } else if (mention === "problems") {
      item = getProblemsContext();
    }

    if (item) {
      contextItems.push(item);
    }
  }

  // Strip @ mentions from the displayed message
  const cleanMessage = userMessage.replace(MENTION_PATTERN, "").trim();

  return { cleanMessage, contextItems };
}

/**
 * Builds the full messages array for the OpenAI API request,
 * injecting resolved context items as system messages.
 */
export function buildMessagesWithContext(
  systemPrompt: string,
  chatHistory: ChatMessage[],
  userMessage: string,
  contextItems: ContextItem[]
): ChatMessage[] {
  const messages: ChatMessage[] = [];

  // System prompt
  messages.push({ role: "system", content: systemPrompt });

  // Inject context items as system messages
  if (contextItems.length > 0) {
    const contextBlock = contextItems
      .map(
        (item) =>
          `--- Context: ${item.label} (${item.type}) ---\n${item.content}`
      )
      .join("\n\n");

    messages.push({
      role: "system",
      content: `The user has attached the following context:\n\n${contextBlock}`,
    });
  }

  // Chat history
  messages.push(...chatHistory);

  // Current user message
  messages.push({ role: "user", content: userMessage });

  return messages;
}

/**
 * Returns the list of available @ mention completions for the webview UI.
 */
export function getAvailableMentions(): Array<{
  trigger: string;
  label: string;
  description: string;
}> {
  return [
    {
      trigger: "@file:",
      label: "@file:<path>",
      description: "Attach a workspace file to the prompt",
    },
    {
      trigger: "@selection",
      label: "@selection",
      description: "Attach the current editor selection",
    },
    {
      trigger: "@diff",
      label: "@diff",
      description: "Attach uncommitted git changes",
    },
    {
      trigger: "@problems",
      label: "@problems",
      description: "Attach current IDE errors and warnings",
    },
  ];
}
