/**
 * @module project-lai-extension/providers/chat-view
 * Sidebar chat webview provider — the primary conversational UI.
 *
 * Implements vscode.WebviewViewProvider to render an interactive chat panel
 * in the VS Code sidebar with real-time SSE token streaming, code block
 * rendering, copy/insert actions, and @ mention support.
 *
 * @license Apache-2.0
 */

import * as vscode from "vscode";
import { OpenAIClient } from "../client/openai-client";
import { resolveContext, buildMessagesWithContext } from "../context/resolver";
import type { ChatMessage } from "../client/types";

export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "lai.chatView";

  private _view?: vscode.WebviewView;
  private _chatHistory: ChatMessage[] = [];
  private _abortController: AbortController | null = null;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _client: OpenAIClient,
    private readonly _systemPrompt: string
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlContent(webviewView.webview);

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case "sendMessage":
          await this._handleUserMessage(message.text);
          break;
        case "stopGeneration":
          this._abortController?.abort();
          break;
        case "resetChat":
          this.resetChat();
          break;
        case "insertCode":
          this._insertCodeAtCursor(message.code);
          break;
        case "copyCode":
          await vscode.env.clipboard.writeText(message.code);
          vscode.window.showInformationMessage("Code copied to clipboard.");
          break;
      }
    });
  }

  /** Resets the chat session, clearing all history. */
  public resetChat(): void {
    this._chatHistory = [];
    this._view?.webview.postMessage({ type: "clearChat" });
    vscode.window.showInformationMessage("LAI: Chat session reset.");
  }

  /** Sends a message programmatically (e.g., from /review command). */
  public async sendMessage(text: string): Promise<void> {
    // Ensure the sidebar is visible
    if (this._view) {
      this._view.show?.(true);
    }
    await this._handleUserMessage(text);
  }

  // ─── Private Methods ──────────────────────────────────────────────────────

  private async _handleUserMessage(rawText: string): Promise<void> {
    if (!this._view) return;

    // Resolve @ mentions
    const { cleanMessage, contextItems } = await resolveContext(rawText);

    // Show the user message in the UI (display what they typed, not the resolved version)
    this._view.webview.postMessage({
      type: "addMessage",
      role: "user",
      content: rawText,
    });

    // Build the full messages array with context
    const messages = buildMessagesWithContext(
      this._systemPrompt,
      this._chatHistory,
      cleanMessage || rawText,
      contextItems
    );

    // Start streaming
    this._abortController = new AbortController();
    this._view.webview.postMessage({ type: "startStreaming" });

    let fullResponse = "";

    try {
      for await (const token of this._client.streamChatCompletion(messages, {
        signal: this._abortController.signal,
      })) {
        fullResponse += token;
        this._view.webview.postMessage({
          type: "streamToken",
          token,
        });
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "Request aborted") {
        this._view.webview.postMessage({
          type: "streamToken",
          token: "\n\n*(Generation stopped by user.)*",
        });
      } else {
        const errorMsg =
          err instanceof Error ? err.message : "Unknown error occurred";
        this._view.webview.postMessage({
          type: "streamError",
          error: errorMsg,
        });
        vscode.window.showErrorMessage(`LAI Error: ${errorMsg}`);
      }
    } finally {
      this._abortController = null;
      this._view.webview.postMessage({ type: "endStreaming" });
    }

    // Append to chat history
    if (fullResponse) {
      this._chatHistory.push({ role: "user", content: cleanMessage || rawText });
      this._chatHistory.push({ role: "assistant", content: fullResponse });

      // Trim history to keep context window manageable (last 20 exchanges)
      if (this._chatHistory.length > 40) {
        this._chatHistory = this._chatHistory.slice(-40);
      }
    }
  }

  private _insertCodeAtCursor(code: string): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage("No active editor to insert code into.");
      return;
    }

    editor.edit((editBuilder) => {
      if (editor.selection.isEmpty) {
        editBuilder.insert(editor.selection.active, code);
      } else {
        editBuilder.replace(editor.selection, code);
      }
    });
  }

  // ─── Webview HTML ─────────────────────────────────────────────────────────

  private _getHtmlContent(_webview: vscode.Webview): string {
    return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Project LAI Chat</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-editor-foreground);
      --border: var(--vscode-panel-border, #333);
      --input-bg: var(--vscode-input-background);
      --input-fg: var(--vscode-input-foreground);
      --input-border: var(--vscode-input-border, #444);
      --button-bg: var(--vscode-button-background);
      --button-fg: var(--vscode-button-foreground);
      --button-hover: var(--vscode-button-hoverBackground);
      --code-bg: var(--vscode-textCodeBlock-background, #1e1e1e);
      --user-bg: var(--vscode-badge-background, #0e639c);
      --user-fg: var(--vscode-badge-foreground, #fff);
      --muted: var(--vscode-descriptionForeground, #888);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family, system-ui, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      color: var(--fg);
      background: var(--bg);
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }

    /* Header */
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
    }
    .header h3 { font-size: 13px; font-weight: 600; }
    .header-actions button {
      background: none;
      border: none;
      color: var(--muted);
      cursor: pointer;
      padding: 4px;
      font-size: 14px;
    }
    .header-actions button:hover { color: var(--fg); }

    /* Status bar */
    .status-bar {
      padding: 4px 12px;
      font-size: 11px;
      color: var(--muted);
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
    }
    .status-bar .dot {
      display: inline-block;
      width: 6px; height: 6px;
      border-radius: 50%;
      margin-right: 4px;
      vertical-align: middle;
    }
    .dot.connected { background: #4caf50; }
    .dot.disconnected { background: #f44336; }

    /* Messages area */
    #messages {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .message {
      max-width: 100%;
      line-height: 1.5;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }
    .message.user {
      align-self: flex-end;
      background: var(--user-bg);
      color: var(--user-fg);
      padding: 8px 12px;
      border-radius: 12px 12px 2px 12px;
      max-width: 85%;
    }
    .message.assistant {
      align-self: flex-start;
      max-width: 100%;
    }
    .message.error {
      color: #f44336;
      font-style: italic;
      padding: 8px;
      border-left: 3px solid #f44336;
    }

    /* Code blocks */
    .code-block {
      position: relative;
      background: var(--code-bg);
      border-radius: 6px;
      margin: 8px 0;
      overflow: hidden;
    }
    .code-block-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 4px 10px;
      font-size: 11px;
      color: var(--muted);
      border-bottom: 1px solid var(--border);
    }
    .code-block-actions button {
      background: none;
      border: 1px solid var(--border);
      color: var(--muted);
      cursor: pointer;
      padding: 2px 8px;
      border-radius: 3px;
      font-size: 11px;
      margin-left: 4px;
    }
    .code-block-actions button:hover {
      color: var(--fg);
      background: var(--input-bg);
    }
    .code-block pre {
      margin: 0;
      padding: 10px;
      overflow-x: auto;
      font-family: var(--vscode-editor-font-family, 'Consolas', monospace);
      font-size: var(--vscode-editor-font-size, 13px);
      line-height: 1.4;
      white-space: pre;
    }

    /* Streaming cursor */
    .streaming-cursor::after {
      content: '▌';
      animation: blink 0.8s infinite;
      color: var(--button-bg);
    }
    @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }

    /* Input area */
    .input-area {
      border-top: 1px solid var(--border);
      padding: 10px 12px;
      display: flex;
      gap: 8px;
      align-items: flex-end;
      flex-shrink: 0;
    }
    #userInput {
      flex: 1;
      background: var(--input-bg);
      color: var(--input-fg);
      border: 1px solid var(--input-border);
      border-radius: 6px;
      padding: 8px 10px;
      font-family: inherit;
      font-size: inherit;
      resize: none;
      min-height: 36px;
      max-height: 150px;
      outline: none;
    }
    #userInput:focus { border-color: var(--button-bg); }
    #userInput::placeholder { color: var(--muted); }
    .send-btn {
      background: var(--button-bg);
      color: var(--button-fg);
      border: none;
      border-radius: 6px;
      padding: 8px 14px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .send-btn:hover { background: var(--button-hover); }
    .send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .send-btn.stop-btn { background: #d32f2f; }

    /* Welcome screen */
    .welcome {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      flex: 1;
      text-align: center;
      padding: 20px;
      color: var(--muted);
    }
    .welcome h2 { font-size: 16px; color: var(--fg); margin-bottom: 12px; }
    .welcome p { margin-bottom: 8px; font-size: 12px; }
    .welcome code {
      background: var(--code-bg);
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h3>🤖 Project LAI</h3>
    <div class="header-actions">
      <button onclick="resetChat()" title="Reset Chat">↺</button>
    </div>
  </div>
  <div class="status-bar">
    <span class="dot connected" id="statusDot"></span>
    <span id="statusText">Ready</span>
  </div>

  <div id="messages">
    <div class="welcome" id="welcome">
      <h2>Welcome to Project LAI</h2>
      <p>Offline, privacy-first AI coding assistant.</p>
      <p>Try: <code>@file:src/index.ts</code> <code>@selection</code> <code>@diff</code> <code>@problems</code></p>
      <p>Type a message below or use <code>Ctrl+I</code> for inline edit.</p>
    </div>
  </div>

  <div class="input-area">
    <textarea id="userInput" rows="1" placeholder="Ask LAI anything... (@ for context)" autofocus></textarea>
    <button class="send-btn" id="sendBtn" onclick="sendMessage()">Send</button>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const messagesContainer = document.getElementById('messages');
    const userInput = document.getElementById('userInput');
    const sendBtn = document.getElementById('sendBtn');
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    const welcome = document.getElementById('welcome');

    let isStreaming = false;
    let currentAssistantDiv = null;
    let currentRawContent = '';

    // ── Auto-resize textarea ──────────────────────────────────────
    userInput.addEventListener('input', () => {
      userInput.style.height = 'auto';
      userInput.style.height = Math.min(userInput.scrollHeight, 150) + 'px';
    });

    // ── Keyboard shortcuts ────────────────────────────────────────
    userInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (isStreaming) stopGeneration();
        else sendMessage();
      }
    });

    // ── Send / Stop ──────────────────────────────────────────────
    function sendMessage() {
      const text = userInput.value.trim();
      if (!text || isStreaming) return;
      vscode.postMessage({ type: 'sendMessage', text });
      userInput.value = '';
      userInput.style.height = 'auto';
    }

    function stopGeneration() {
      vscode.postMessage({ type: 'stopGeneration' });
    }

    function resetChat() {
      vscode.postMessage({ type: 'resetChat' });
    }

    // ── Render markdown-ish content ──────────────────────────────
    function renderContent(raw) {
      let html = escapeHtml(raw);

      // Code blocks with language
      html = html.replace(/\`\`\`(\\w*?)\\n([\\s\\S]*?)\`\`\`/g, (_, lang, code) => {
        const langLabel = lang || 'code';
        return '<div class="code-block">' +
          '<div class="code-block-header"><span>' + langLabel + '</span>' +
          '<div class="code-block-actions">' +
          '<button onclick="copyCode(this)">Copy</button>' +
          '<button onclick="insertCode(this)">Insert</button>' +
          '</div></div>' +
          '<pre data-code="' + encodeURIComponent(code) + '">' + code + '</pre></div>';
      });

      // Inline code
      html = html.replace(/\`([^\`]+)\`/g, '<code>$1</code>');

      // Bold
      html = html.replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>');

      // Italic
      html = html.replace(/\\*(.+?)\\*/g, '<em>$1</em>');

      // Line breaks
      html = html.replace(/\\n/g, '<br>');

      return html;
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    // ── Code block actions ───────────────────────────────────────
    function copyCode(btn) {
      const pre = btn.closest('.code-block').querySelector('pre');
      const code = decodeURIComponent(pre.dataset.code || pre.textContent);
      vscode.postMessage({ type: 'copyCode', code });
    }

    function insertCode(btn) {
      const pre = btn.closest('.code-block').querySelector('pre');
      const code = decodeURIComponent(pre.dataset.code || pre.textContent);
      vscode.postMessage({ type: 'insertCode', code });
    }

    // ── Handle messages from extension ───────────────────────────
    window.addEventListener('message', (event) => {
      const msg = event.data;

      switch (msg.type) {
        case 'addMessage': {
          if (welcome) welcome.style.display = 'none';
          const div = document.createElement('div');
          div.className = 'message ' + msg.role;
          if (msg.role === 'user') {
            div.textContent = msg.content;
          } else {
            div.innerHTML = renderContent(msg.content);
          }
          messagesContainer.appendChild(div);
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
          break;
        }

        case 'startStreaming': {
          if (welcome) welcome.style.display = 'none';
          isStreaming = true;
          currentRawContent = '';
          currentAssistantDiv = document.createElement('div');
          currentAssistantDiv.className = 'message assistant streaming-cursor';
          messagesContainer.appendChild(currentAssistantDiv);
          sendBtn.textContent = 'Stop';
          sendBtn.className = 'send-btn stop-btn';
          sendBtn.onclick = stopGeneration;
          statusText.textContent = 'Generating...';
          break;
        }

        case 'streamToken': {
          if (currentAssistantDiv) {
            currentRawContent += msg.token;
            currentAssistantDiv.innerHTML = renderContent(currentRawContent);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
          }
          break;
        }

        case 'endStreaming': {
          if (currentAssistantDiv) {
            currentAssistantDiv.classList.remove('streaming-cursor');
            currentAssistantDiv.innerHTML = renderContent(currentRawContent);
          }
          isStreaming = false;
          currentAssistantDiv = null;
          currentRawContent = '';
          sendBtn.textContent = 'Send';
          sendBtn.className = 'send-btn';
          sendBtn.onclick = sendMessage;
          statusText.textContent = 'Ready';
          break;
        }

        case 'streamError': {
          const errDiv = document.createElement('div');
          errDiv.className = 'message error';
          errDiv.textContent = '⚠ Error: ' + msg.error;
          messagesContainer.appendChild(errDiv);
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
          break;
        }

        case 'clearChat': {
          messagesContainer.innerHTML = '';
          if (welcome) {
            messagesContainer.appendChild(welcome);
            welcome.style.display = 'flex';
          }
          break;
        }
      }
    });
  </script>
</body>
</html>`;
  }
}
