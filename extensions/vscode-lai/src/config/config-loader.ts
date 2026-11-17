/**
 * @module project-lai-extension/config/config-loader
 * Loads extension configuration from VS Code settings or YAML/JSON config files.
 *
 * Priority order:
 *   1. YAML/JSON config file (if lai.configFile is set)
 *   2. VS Code workspace/user settings (lai.*)
 *
 * Supports the Continue.dev YAML schema for seamless migration.
 *
 * @license Apache-2.0
 */

import * as vscode from "vscode";
import * as fs from "node:fs";
import * as path from "node:path";
import type { LaiConfig, LaiModelConfig } from "../client/types";

// ─── Minimal YAML Parser ──────────────────────────────────────────────────────
// Handles the flat config structure without requiring a YAML dependency.
// Supports: scalars, simple arrays of objects (indented with - prefix), and
// nested keys one level deep. NOT a general-purpose YAML parser.

function parseSimpleYaml(text: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = text.split("\n");

  let currentKey = "";
  let currentArray: Record<string, unknown>[] | null = null;
  let currentArrayItem: Record<string, unknown> | null = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, "");

    // Skip comments and blank lines
    if (line.trim().startsWith("#") || line.trim() === "") continue;

    // Detect top-level key (no leading whitespace)
    const topMatch = line.match(/^(\w[\w.]*):\s*(.*)/);
    if (topMatch) {
      // Flush any pending array
      if (currentArray && currentArrayItem) {
        currentArray.push(currentArrayItem);
        currentArrayItem = null;
      }
      if (currentArray && currentKey) {
        result[currentKey] = currentArray;
        currentArray = null;
      }

      const key = topMatch[1]!;
      const value = topMatch[2]!.trim();

      if (value === "" || value === "|" || value === ">") {
        // This key's value will come from indented lines (array or nested object)
        currentKey = key;
        currentArray = null;
        currentArrayItem = null;
      } else {
        result[key] = parseScalar(value);
        currentKey = "";
      }
      continue;
    }

    // Detect array item start (  - key: value  or  - name: value)
    const arrayItemStart = line.match(/^\s+-\s+(\w+):\s*(.*)/);
    if (arrayItemStart && currentKey) {
      // Flush previous array item
      if (currentArrayItem) {
        if (!currentArray) currentArray = [];
        currentArray.push(currentArrayItem);
      }
      currentArrayItem = {};
      currentArrayItem[arrayItemStart[1]!] = parseScalar(
        arrayItemStart[2]!.trim()
      );
      continue;
    }

    // Detect nested key inside array item or object (    key: value)
    const nestedMatch = line.match(/^\s+(\w+):\s*(.*)/);
    if (nestedMatch) {
      const key = nestedMatch[1]!;
      const value = parseScalar(nestedMatch[2]!.trim());

      if (currentArrayItem) {
        currentArrayItem[key] = value;
      } else if (currentKey) {
        // Nested object (e.g., tabAutocompleteModel.name)
        if (typeof result[currentKey] !== "object" || result[currentKey] === null) {
          result[currentKey] = {};
        }
        (result[currentKey] as Record<string, unknown>)[key] = value;
      }
      continue;
    }
  }

  // Flush remaining
  if (currentArrayItem && currentArray) {
    currentArray.push(currentArrayItem);
  } else if (currentArrayItem && currentKey) {
    currentArray = [currentArrayItem];
  }
  if (currentArray && currentKey) {
    result[currentKey] = currentArray;
  }

  return result;
}

function parseScalar(value: string): string | number | boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^\d+$/.test(value)) return parseInt(value, 10);
  if (/^\d+\.\d+$/.test(value)) return parseFloat(value);
  // Strip surrounding quotes
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

// ─── Config File Loading ───────────────────────────────────────────────────────

function loadConfigFromFile(filePath: string): LaiConfig | null {
  try {
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) return null;

    const content = fs.readFileSync(resolved, "utf-8");
    const ext = path.extname(resolved).toLowerCase();

    let raw: Record<string, unknown>;
    if (ext === ".json") {
      raw = JSON.parse(content) as Record<string, unknown>;
    } else {
      // .yaml or .yml
      raw = parseSimpleYaml(content);
    }

    return normalizeConfig(raw);
  } catch (err) {
    console.error(`[LAI Config] Failed to load config file: ${filePath}`, err);
    return null;
  }
}

function normalizeConfig(raw: Record<string, unknown>): LaiConfig {
  const models = Array.isArray(raw["models"])
    ? (raw["models"] as Record<string, unknown>[]).map(normalizeModelConfig)
    : [];

  let tabAutocomplete: LaiModelConfig | undefined;
  if (raw["tabAutocompleteModel"] && typeof raw["tabAutocompleteModel"] === "object") {
    tabAutocomplete = normalizeModelConfig(
      raw["tabAutocompleteModel"] as Record<string, unknown>
    );
  }

  return {
    name: String(raw["name"] || "Project LAI"),
    version: String(raw["version"] || "1.0.0"),
    schema: String(raw["schema"] || "v1"),
    models,
    tabAutocompleteModel: tabAutocomplete,
  };
}

function normalizeModelConfig(raw: Record<string, unknown>): LaiModelConfig {
  return {
    name: String(raw["name"] || raw["title"] || ""),
    provider: String(raw["provider"] || "openai"),
    model: String(raw["model"] || ""),
    apiBase: String(raw["apiBase"] || "http://127.0.0.1:8080/v1"),
    apiKey: String(raw["apiKey"] || "local"),
  };
}

// ─── VS Code Settings Loading ──────────────────────────────────────────────────

function loadConfigFromSettings(): LaiConfig {
  const cfg = vscode.workspace.getConfiguration("lai");

  const mainModel: LaiModelConfig = {
    name: "Project LAI (Settings)",
    provider: "openai",
    model: cfg.get<string>("model", "gemma4-e2b"),
    apiBase: cfg.get<string>("apiBase", "http://127.0.0.1:8080/v1"),
    apiKey: cfg.get<string>("apiKey", "local"),
  };

  const autoModel = cfg.get<string>("autocomplete.model", "");
  const autoBase = cfg.get<string>("autocomplete.apiBase", "");

  const tabAutocomplete: LaiModelConfig = {
    name: "LAI Autocomplete",
    provider: "openai",
    model: autoModel || mainModel.model,
    apiBase: autoBase || mainModel.apiBase,
    apiKey: mainModel.apiKey,
  };

  return {
    name: "Settings Config",
    version: "1.0.0",
    schema: "v1",
    models: [mainModel],
    tabAutocompleteModel: tabAutocomplete,
    systemPrompt: cfg.get<string>("systemPrompt", ""),
    linter: {
      enabled: cfg.get<boolean>("linter.enabled", true),
      prompt: cfg.get<string>("linter.prompt", "playwright-review"),
    },
  };
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Loads the full LAI configuration.
 * Checks for a config file first, then falls back to VS Code settings.
 */
export function loadConfig(): LaiConfig {
  const cfg = vscode.workspace.getConfiguration("lai");
  const configFilePath = cfg.get<string>("configFile", "");

  // Try config file first
  if (configFilePath) {
    const fileConfig = loadConfigFromFile(configFilePath);
    if (fileConfig) {
      console.log(`[LAI Config] Loaded from file: ${configFilePath}`);
      return fileConfig;
    }
    console.warn(
      `[LAI Config] Config file not found: ${configFilePath}, falling back to settings.`
    );
  }

  // Try well-known locations relative to workspace
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (workspaceFolders) {
    const root = workspaceFolders[0]!.uri.fsPath;
    const wellKnownPaths = [
      path.join(root, ".lai", "config.yaml"),
      path.join(root, ".lai", "config.yml"),
      path.join(root, ".lai", "config.json"),
      path.join(root, ".continue", "config.yaml"),
      path.join(root, ".continue", "config.json"),
    ];

    for (const p of wellKnownPaths) {
      const fileConfig = loadConfigFromFile(p);
      if (fileConfig) {
        console.log(`[LAI Config] Auto-discovered config: ${p}`);
        return fileConfig;
      }
    }
  }

  // Fall back to VS Code settings
  return loadConfigFromSettings();
}

/**
 * Returns the primary model configuration.
 */
export function getPrimaryModel(config: LaiConfig): LaiModelConfig {
  if (config.models.length > 0) {
    return config.models[0]!;
  }
  return {
    name: "default",
    provider: "openai",
    model: "gemma4-e2b",
    apiBase: "http://127.0.0.1:8080/v1",
    apiKey: "local",
  };
}

/**
 * Returns the autocomplete model configuration.
 */
export function getAutocompleteModel(config: LaiConfig): LaiModelConfig {
  if (config.tabAutocompleteModel) {
    return config.tabAutocompleteModel;
  }
  return getPrimaryModel(config);
}
