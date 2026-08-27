# Project LAI — Local AI Linter

> Offline, privacy-first code review powered by local LLMs.

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Node.js: >=18](https://img.shields.io/badge/Node.js-%3E%3D18-green.svg)](https://nodejs.org)

Project LAI is a **standalone CLI tool** that runs a local AI model (Gemma 4) to perform code architecture reviews — **completely offline, with zero data leaving your machine**. It supports any language through customizable prompt rulesets and can be used interactively or in CI/CD pipelines.

## Features

- 🤖 **Agent Mode** — Interactive terminal chat with context retention
- ⚡ **CI/CD Mode** — Headless single-shot analysis with structured JSON output
- 🔒 **Fully Offline** — No API keys, no cloud, no data leakage
- 📋 **Customizable Prompts** — Editable Markdown rulesets for any language/framework
- 📦 **Library API** — Import and use programmatically with full TypeScript IntelliSense
- 🪶 **Zero CLI Dependencies** — Native `node:util.parseArgs` and `node:readline`

## Quick Start

### Prerequisites
- Node.js ≥ 18
- A GGUF model file (e.g., [Gemma 4 E4B](https://huggingface.co/google/gemma-4-e4b-it-gguf))

### Installation

```bash
# Clone the repository
git clone https://github.com/Raaaka/project-lai.git
cd project-lai

# Install dependencies
npm install

# Place your GGUF model in the models/ directory
cp /path/to/gemma-4-E4B-it-Q4_K_M.gguf models/
```

### Usage

#### Agent Mode (Interactive Chat)
```bash
npm run ai:chat
# or
npx tsx src/cli.ts
```

Available commands inside Agent Mode:
| Command | Description |
|---------|-------------|
| `/review <path>` | Analyze a file |
| `/prompt <name>` | Switch prompt ruleset |
| `/prompts` | List available prompts |
| `/reset` | Clear chat history |
| `/help` | Show help |
| `/exit` | Quit |

#### CI/CD Mode (Headless)
```bash
# Lint a file (JSON output to stdout)
npm run ai:lint -- --file ./src/tests/login.spec.ts

# With a specific prompt
npx tsx src/cli.ts --file ./steps.ts --prompt playwright-review
```

#### Library API (Programmatic)
```typescript
import { analyzeFile, GemmaModelEngine } from "project-lai";
import type { AnalysisResult } from "project-lai";

const engine = new GemmaModelEngine("./models/gemma-4.gguf");
await engine.load();

const result: AnalysisResult = await analyzeFile("./myTest.ts", engine);
console.log(result.findings);

await engine.dispose();
```

## Adding Custom Prompts

Create a new `.md` file in the `prompts/` directory:

```bash
# Create a Python review prompt
echo "You are a Python code reviewer..." > prompts/python-review.md

# Use it
npx tsx src/cli.ts --file app.py --prompt python-review
```

## JSON Output Schema

```json
{
  "file": "steps.ts",
  "timestamp": "2026-08-26T08:38:00Z",
  "model": "gemma-4-E4B-it-Q4_K_M",
  "findings": [
    {
      "severity": "HIGH",
      "rule": "HARDCODED_DATA",
      "location": "line 32-33",
      "message": "Credentials are hardcoded.",
      "suggestion": "Use environment variables."
    }
  ],
  "summary": {
    "total": 1,
    "high": 1,
    "medium": 0,
    "low": 0,
    "pass": false
  }
}
```

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Analysis passed (no HIGH findings) |
| `1` | Analysis failed (HIGH findings detected) |
| `2` | Error (file not found, model error, etc.) |

## License

This project is licensed under the [Apache License 2.0](LICENSE).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.
