# Project LAI — Local AI Copilot (VS Code Extension)

> Offline, privacy-first AI coding assistant powered by local LLMs.  
> **Zero telemetry, zero cloud calls, 100% air-gapped.**

Project LAI VS Code Extension is an in-house alternative to the Continue.dev extension, built specifically for enterprise environments with strict security, DLP policies, or restricted VS Code Marketplace access.

---

## Features

- 💬 **Sidebar Chat Panel (`Ctrl+Shift+L`)**
  - Streaming conversational interface powered by local models.
  - Formatted markdown with syntax highlighting, single-click code copy, and insertion at cursor.
  - Slash commands: `/reset`, `/review`, `/help`.

- ⚡ **Inline Code Generation & Diff Review (`Ctrl+I`)**
  - Select any block of code, press `Ctrl+I` (`Cmd+I` on macOS), and describe the desired change.
  - Side-by-side or inline diff comparison with **Accept** (`✅`) and **Reject** (`❌`) options.

- 👻 **Tab Autocomplete (Ghost Text)**
  - Real-time Fill-In-The-Middle (FIM) suggestions as you type.
  - Built-in FIM templates for **Qwen2.5-Coder**, **DeepSeek-Coder**, and **Gemma-4**.
  - Configurable debounce (default: 250ms) and automatic cancellation on rapid typing.

- 📎 **Dynamic Context Providers (`@` Mentions)**
  - `@file:<path>` — Injects contents of any workspace file.
  - `@selection` — Injects current editor selection.
  - `@diff` — Injects uncommitted Git changes (staged and unstaged).
  - `@problems` — Injects active compiler/linter errors from VS Code's Problems panel.

- 🔍 **Integrated AI Linter & Code Actions**
  - Evaluates files on save against markdown prompt rulesets (e.g. `prompts/playwright-review.md`).
  - Populates the VS Code **Problems** tab with severity-ranked findings.
  - Provides **💡 Fix with Project LAI** lightbulb quick-fixes on error lines.

- 🔒 **Enterprise Air-Gap Guarantee**
  - No external analytics, telemetry pings, or cloud checks (no PostHog, Segment, or Sentry).
  - Only communicates with the configured local/LAN `apiBase` endpoint.

---

## Installation

### Method 1: Automated PowerShell Install
Run from terminal:
```powershell
.\install-lai-extension.ps1
```

### Method 2: Manual VSIX Install
```powershell
code --install-extension project-lai-1.0.0.vsix --force
```
Or in VS Code:
1. Press `Ctrl+Shift+P`
2. Search and select: **Extensions: Install from VSIX...**
3. Select `project-lai-1.0.0.vsix`

---

## Configuration

The extension connects to any OpenAI-compatible API endpoint (such as `llama-server.exe`, Ollama, LM Studio, or vLLM).

### Option A: Continue-Compatible YAML (`.lai/config.yaml`)
Create `.lai/config.yaml` in your workspace root:

```yaml
name: Main Config
version: 1.0.0
schema: v1
models:
  - name: Project LAI (Local)
    provider: openai
    model: gemma4-e2b
    apiBase: http://127.0.0.1:8080/v1
    apiKey: local
tabAutocompleteModel:
  name: LAI Autocomplete
  provider: openai
  model: gemma4-e2b
  apiBase: http://127.0.0.1:8080/v1
  apiKey: local
```

### Option B: VS Code Settings (`settings.json`)
```json
{
  "lai.apiBase": "http://127.0.0.1:8080/v1",
  "lai.model": "gemma4-e2b",
  "lai.apiKey": "local",
  "lai.autocomplete.enabled": true,
  "lai.autocomplete.debounceMs": 250,
  "lai.linter.enabled": true,
  "lai.linter.prompt": "playwright-review"
}
```

---

## Keyboard Shortcuts

| Shortcut | Command | Description |
|:---|:---|:---|
| `Ctrl+Shift+L` | `lai.openChat` | Focus Project LAI chat panel |
| `Ctrl+I` | `lai.inlineEdit` | Trigger inline edit on current selection/line |
| `Tab` | (built-in) | Accept ghost-text autocomplete suggestion |

---

## Development & Building

```powershell
# Install dev dependencies
npm install

# Type check
npm run lint

# Build extension bundle
npm run build

# Watch mode for live development
npm run watch

# Package into .vsix
npm run package
```
