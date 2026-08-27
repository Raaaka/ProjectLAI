/**
 * @module project-lai/modes/agent-mode
 * Interactive CLI chat mode — the "Agent" experience.
 *
 * Uses Node.js native readline/promises for zero-dependency terminal I/O.
 * Supports special commands: /reset, /review, /prompt, /help, /exit.
 *
 * @license Apache-2.0
 */

import * as readline from "node:readline/promises";
import * as fs from "node:fs";
import * as path from "node:path";
import { stdin as input, stdout as output } from "node:process";
import type { IModelEngine } from "../types/index.js";
import { analyzeFile, listAvailablePrompts, loadPrompt } from "../core/analyzer.js";

const BANNER = `
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🤖  Project LAI — Local AI Linter                      ║
║   ────────────────────────────────────────                ║
║   Offline, privacy-first code review agent.               ║
║                                                           ║
║   Type /help for available commands.                      ║
║   Type /exit or press Ctrl+C to quit.                     ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
`;

const HELP_TEXT = `
Available Commands:
  /review <filepath>    Analyze a file against the active prompt ruleset.
  /prompt <name>        Switch the active system prompt (e.g., /prompt playwright-review).
  /prompts              List all available prompt rulesets.
  /reset                Clear chat history (model stays loaded in memory).
  /help                 Show this help message.
  /exit                 Gracefully shutdown and exit.

You can also type any free-text message to chat with the AI directly.
`;

/**
 * Starts the interactive Agent Mode.
 * This function blocks until the user exits.
 */
export async function startAgentMode(
  engine: IModelEngine,
  options: { prompt?: string; modelPath?: string } = {}
): Promise<void> {
  console.log(BANNER);

  let activePrompt = options.prompt || "playwright-review";
  console.log(`📋 Active prompt: ${activePrompt}`);
  console.log(`📂 Model: ${options.modelPath || "default"}\n`);

  const rl = readline.createInterface({ input, output });

  // Handle Ctrl+C gracefully
  rl.on("close", async () => {
    console.log("\n\n👋 Shutting down LAI...");
    await engine.dispose();
    process.exit(0);
  });

  // Main loop
  while (true) {
    let userInput: string;
    try {
      userInput = await rl.question("🤖 LAI > ");
    } catch {
      // readline closed (e.g., Ctrl+C)
      break;
    }

    const trimmed = userInput.trim();
    if (!trimmed) continue;

    // ── Special Commands ─────────────────────────────────────────────
    if (trimmed === "/exit" || trimmed === "/quit") {
      console.log("\n👋 Shutting down LAI...");
      rl.close();
      await engine.dispose();
      return;
    }

    if (trimmed === "/help") {
      console.log(HELP_TEXT);
      continue;
    }

    if (trimmed === "/reset") {
      await engine.resetSession();
      continue;
    }

    if (trimmed === "/prompts") {
      const available = listAvailablePrompts();
      console.log(`\n📋 Available prompts: ${available.join(", ")}`);
      console.log(`   Active: ${activePrompt}\n`);
      continue;
    }

    if (trimmed.startsWith("/prompt ")) {
      const newPrompt = trimmed.slice("/prompt ".length).trim();
      try {
        loadPrompt(newPrompt); // Validate it exists
        activePrompt = newPrompt;
        console.log(`\n✅ Switched to prompt: ${activePrompt}\n`);
      } catch (err) {
        console.error(
          `\n❌ ${err instanceof Error ? err.message : String(err)}\n`
        );
      }
      continue;
    }

    if (trimmed.startsWith("/review ")) {
      const filePath = trimmed.slice("/review ".length).trim();
      if (!fs.existsSync(filePath)) {
        console.error(`\n❌ File not found: ${filePath}\n`);
        continue;
      }
      console.log(
        `\n📝 Analyzing: ${path.basename(filePath)} (prompt: ${activePrompt})...\n`
      );
      try {
        const result = await analyzeFile(filePath, engine, {
          prompt: activePrompt,
          modelPath: options.modelPath,
        });
        console.log("─── AI Architecture Review ───────────────────────");
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
          console.log(
            `   Result: ${result.summary.pass ? "✅ PASS" : "❌ FAIL"}`
          );
        }
        console.log("──────────────────────────────────────────────────\n");
      } catch (err) {
        console.error(
          `\n❌ Analysis error: ${err instanceof Error ? err.message : String(err)}\n`
        );
      }
      continue;
    }

    // Unknown command
    if (trimmed.startsWith("/")) {
      console.log(
        `\n❌ Unknown command: ${trimmed.split(" ")[0]}. Type /help for available commands.\n`
      );
      continue;
    }

    // ── Free-text chat ───────────────────────────────────────────────
    try {
      console.log("\n🤔 Thinking...\n");
      const response = await engine.prompt(trimmed);
      console.log(`${response}\n`);
    } catch (err) {
      console.error(
        `\n❌ Model error: ${err instanceof Error ? err.message : String(err)}\n`
      );
    }
  }
}
