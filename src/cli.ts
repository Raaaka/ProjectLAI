#!/usr/bin/env node
/**
 * @module project-lai/cli
 * CLI entry point for Project LAI.
 *
 * Routes between Agent Mode (interactive) and CI Mode (headless)
 * based on parsed arguments using Node.js native parseArgs.
 *
 * @license Apache-2.0
 */

import { parseArgs } from "node:util";
import * as path from "node:path";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import { GemmaModelEngine } from "./core/model-engine.js";
import { startAgentMode } from "./modes/agent-mode.js";
import { startCIMode } from "./modes/ci-mode.js";
import type { CLIArgs } from "./types/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Package metadata ──────────────────────────────────────────────────────
const VERSION = "1.0.0";
const TOOL_NAME = "Project LAI — Local AI Linter";

// ─── Help text ─────────────────────────────────────────────────────────────
const USAGE = `
${TOOL_NAME} v${VERSION}
Offline, privacy-first code review powered by local LLMs.

Usage:
  lai                                  Start interactive Agent Mode
  lai --file <path>                    Run CI Mode on a single file
  lai --file <path> --prompt <name>    Use a specific review prompt
  lai --help                           Show this help message
  lai --version                        Show version

Options:
  -f, --file <path>       Target file for CI/CD Mode analysis.
  -i, --interactive       Force interactive Agent Mode.
  -m, --model <path>      Path to GGUF model file (overrides default).
  -p, --prompt <name>     Prompt ruleset name (default: playwright-review).
  -j, --json              Force JSON output in CI Mode (default: true).
  -h, --help              Show this help message.
  -v, --version           Show version number.

Environment Variables:
  LAI_MODEL_PATH          Default path to the GGUF model file.

Examples:
  lai                                          # Start chat agent
  lai -f ./src/tests/login.spec.ts             # Lint a file (JSON output)
  lai -f ./steps.ts -p playwright-review       # Lint with specific prompt
  lai -f ./steps.ts --no-json                  # Lint with human-readable output
`;

// ─── Resolve default model path ────────────────────────────────────────────
function resolveModelPath(cliModelPath?: string): string {
  // Priority: CLI flag → env var → default location
  if (cliModelPath) return path.resolve(cliModelPath);

  const envPath = process.env["LAI_MODEL_PATH"];
  if (envPath) return path.resolve(envPath);

  // Default: look in models/ directory relative to project root
  const defaultPaths = [
    path.resolve(__dirname, "../models"),      // From dist/
    path.resolve(__dirname, "../../models"),    // From src/cli.ts during dev
    path.resolve(process.cwd(), "models"),      // CWD fallback
  ];

  for (const dir of defaultPaths) {
    if (fs.existsSync(dir)) {
      const ggufFiles = fs
        .readdirSync(dir)
        .filter((f) => f.endsWith(".gguf"));
      if (ggufFiles.length > 0) {
        return path.join(dir, ggufFiles[0]!);
      }
    }
  }

  console.error("❌ No GGUF model file found.");
  console.error("   Place a .gguf file in the models/ directory,");
  console.error("   or set LAI_MODEL_PATH environment variable,");
  console.error("   or use the --model flag.\n");
  process.exit(1);
}

// ─── Main ──────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  // Parse CLI arguments
  let args: CLIArgs;
  try {
    const { values } = parseArgs({
      options: {
        file: { type: "string", short: "f" },
        interactive: { type: "boolean", short: "i" },
        model: { type: "string", short: "m" },
        prompt: { type: "string", short: "p" },
        json: { type: "boolean", short: "j" },
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" },
      },
      strict: true,
    });
    args = values as CLIArgs;
  } catch (err) {
    console.error(
      `❌ Invalid arguments: ${err instanceof Error ? err.message : String(err)}`
    );
    console.error(USAGE);
    process.exit(1);
  }

  // Handle --help
  if (args.help) {
    console.log(USAGE);
    process.exit(0);
  }

  // Handle --version
  if (args.version) {
    console.log(`${TOOL_NAME} v${VERSION}`);
    process.exit(0);
  }

  // Resolve model path
  const modelPath = resolveModelPath(args.model);
  console.error(`📦 Model: ${path.basename(modelPath)}`);

  // Initialize model engine
  const engine = new GemmaModelEngine(modelPath);
  await engine.load();

  // ── Mode routing ─────────────────────────────────────────────────
  if (args.file) {
    // CI/CD Mode
    const result = await startCIMode(args.file, engine, {
      prompt: args.prompt,
      modelPath,
      json: args.json,
    });

    await engine.dispose();
    process.exit(result.summary.pass ? 0 : 1);
  } else {
    // Agent Mode (interactive or default)
    await startAgentMode(engine, {
      prompt: args.prompt,
      modelPath,
    });
  }
}

// Run
main().catch((err) => {
  console.error(`\n💥 Fatal error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(2);
});
