/**
 * @module project-lai-extension
 * Main extension entry point — activation and registration.
 *
 * This file wires together all providers (chat, inline edit, autocomplete,
 * diagnostics) and manages the extension lifecycle.
 *
 * @license Apache-2.0
 */

import * as vscode from "vscode";
import { OpenAIClient } from "./client/openai-client";
import { loadConfig, getPrimaryModel, getAutocompleteModel } from "./config/config-loader";
import { ChatViewProvider } from "./providers/chat-view";
import { registerInlineEditCommand } from "./providers/inline-edit";
import { registerAutocompleteProvider } from "./providers/autocomplete";
import { registerDiagnosticsProvider } from "./providers/diagnostics";

let chatViewProvider: ChatViewProvider | undefined;

/**
 * Extension activation entry point.
 * Called by VS Code when the extension is first loaded.
 */
export function activate(context: vscode.ExtensionContext): void {
  console.log("[Project LAI] Activating extension...");

  // ─── Load Configuration ─────────────────────────────────────────────────
  const config = loadConfig();
  const primaryModel = getPrimaryModel(config);
  const autocompleteModel = getAutocompleteModel(config);

  const systemPrompt =
    config.systemPrompt ||
    vscode.workspace
      .getConfiguration("lai")
      .get<string>(
        "systemPrompt",
        "You are Project LAI, an expert AI coding assistant. You provide concise, accurate, and well-structured code reviews and suggestions. Always respond with clear explanations and working code examples."
      );

  // ─── Initialize Clients ─────────────────────────────────────────────────
  const chatClient = new OpenAIClient(primaryModel);
  const autocompleteClient = new OpenAIClient(autocompleteModel);

  // ─── Status Bar ─────────────────────────────────────────────────────────
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.text = "$(hubot) LAI";
  statusBarItem.tooltip = `Project LAI — ${primaryModel.model}\n${primaryModel.apiBase}`;
  statusBarItem.command = "lai.openChat";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // ─── Health Check (non-blocking) ────────────────────────────────────────
  chatClient.healthCheck().then((result) => {
    if (result.ok) {
      statusBarItem.text = "$(hubot) LAI ✓";
      statusBarItem.tooltip = `Project LAI — Connected\nModel: ${primaryModel.model}\nEndpoint: ${primaryModel.apiBase}`;
      console.log("[Project LAI] Server connection verified.");
    } else {
      statusBarItem.text = "$(hubot) LAI ✗";
      statusBarItem.tooltip = `Project LAI — Disconnected\n${result.error}\n\nClick to open chat. Ensure your inference server is running.`;
      statusBarItem.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.warningBackground"
      );
      console.warn(`[Project LAI] Server health check failed: ${result.error}`);
    }
  });

  // ─── Register Sidebar Chat ──────────────────────────────────────────────
  chatViewProvider = new ChatViewProvider(
    context.extensionUri,
    chatClient,
    systemPrompt
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ChatViewProvider.viewType,
      chatViewProvider,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  // ─── Register Commands ──────────────────────────────────────────────────

  // Open Chat
  context.subscriptions.push(
    vscode.commands.registerCommand("lai.openChat", () => {
      vscode.commands.executeCommand("lai.chatView.focus");
    })
  );

  // Reset Chat
  context.subscriptions.push(
    vscode.commands.registerCommand("lai.resetChat", () => {
      chatViewProvider?.resetChat();
    })
  );

  // Toggle Autocomplete
  context.subscriptions.push(
    vscode.commands.registerCommand("lai.toggleAutocomplete", async () => {
      const cfg = vscode.workspace.getConfiguration("lai");
      const current = cfg.get<boolean>("autocomplete.enabled", true);
      await cfg.update(
        "autocomplete.enabled",
        !current,
        vscode.ConfigurationTarget.Global
      );
      vscode.window.showInformationMessage(
        `LAI: Tab autocomplete ${!current ? "enabled" : "disabled"}.`
      );
    })
  );

  // ─── Register Inline Edit (Ctrl+I) ─────────────────────────────────────
  registerInlineEditCommand(context, chatClient, systemPrompt);

  // ─── Register Tab Autocomplete ──────────────────────────────────────────
  registerAutocompleteProvider(context, autocompleteClient);

  // ─── Register Linter Diagnostics ────────────────────────────────────────
  registerDiagnosticsProvider(context, chatClient);

  // ─── Watch for Configuration Changes ────────────────────────────────────
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("lai")) {
        const newConfig = loadConfig();
        const newPrimary = getPrimaryModel(newConfig);
        const newAutocomplete = getAutocompleteModel(newConfig);

        chatClient.updateConfig(newPrimary);
        autocompleteClient.updateConfig(newAutocomplete);

        statusBarItem.tooltip = `Project LAI — ${newPrimary.model}\n${newPrimary.apiBase}`;

        console.log("[Project LAI] Configuration reloaded.");
      }
    })
  );

  // ─── Done ───────────────────────────────────────────────────────────────
  console.log("[Project LAI] Extension activated successfully.");
  console.log(`[Project LAI] Model: ${primaryModel.model}`);
  console.log(`[Project LAI] Endpoint: ${primaryModel.apiBase}`);
}

/**
 * Extension deactivation handler.
 * Called by VS Code when the extension is being disabled or unloaded.
 */
export function deactivate(): void {
  console.log("[Project LAI] Extension deactivated.");
}
