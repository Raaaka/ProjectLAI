/**
 * @module project-lai-extension/client/openai-client
 * Zero-dependency OpenAI-compatible streaming HTTP client.
 *
 * Uses Node.js native http/https modules for maximum compatibility.
 * Parses Server-Sent Events (SSE) for real-time token streaming.
 * Supports both /v1/chat/completions and /v1/completions (FIM).
 *
 * @license Apache-2.0
 */

import * as http from "node:http";
import * as https from "node:https";
import { URL } from "node:url";
import type { ChatMessage, LaiModelConfig, StreamOptions } from "./types";

/**
 * Makes an HTTP/HTTPS request and resolves with the IncomingMessage.
 */
function makeRequest(
  url: URL,
  body: string,
  apiKey: string,
  signal?: AbortSignal
): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const isHttps = url.protocol === "https:";
    const transport = isHttps ? https : http;

    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port || (isHttps ? "443" : "80"),
      path: url.pathname + url.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        Accept: "text/event-stream",
      },
    };

    const req = transport.request(options, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        let errorBody = "";
        res.on("data", (chunk) => (errorBody += chunk.toString()));
        res.on("end", () => {
          reject(
            new Error(
              `HTTP ${res.statusCode}: ${res.statusMessage}\n${errorBody}`
            )
          );
        });
        return;
      }
      resolve(res);
    });

    req.on("error", reject);

    if (signal) {
      if (signal.aborted) {
        req.destroy();
        reject(new Error("Request aborted"));
        return;
      }
      signal.addEventListener(
        "abort",
        () => {
          req.destroy();
          reject(new Error("Request aborted"));
        },
        { once: true }
      );
    }

    req.write(body);
    req.end();
  });
}

/**
 * Parses an SSE stream from an HTTP response, yielding content tokens.
 */
async function* parseSSEStream(
  response: http.IncomingMessage,
  mode: "chat" | "completion"
): AsyncGenerator<string, void, undefined> {
  let buffer = "";

  for await (const chunk of response) {
    buffer += chunk.toString();

    // SSE events are separated by double newlines
    const parts = buffer.split("\n");
    // Keep the last potentially-incomplete line in the buffer
    buffer = parts.pop() || "";

    for (const line of parts) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(":")) {
        continue; // skip empty lines and SSE comments
      }

      if (trimmed.startsWith("data: ")) {
        const data = trimmed.slice(6).trim();
        if (data === "[DONE]") {
          return;
        }

        try {
          const parsed = JSON.parse(data);
          let content = "";

          if (mode === "chat") {
            content = parsed.choices?.[0]?.delta?.content || "";
          } else {
            content = parsed.choices?.[0]?.text || "";
          }

          if (content) {
            yield content;
          }
        } catch {
          // Malformed JSON chunk — skip silently
        }
      }
    }
  }
}

/**
 * OpenAI-compatible streaming client.
 *
 * Connects to any endpoint that implements the OpenAI REST API
 * (llama-server, Ollama, vLLM, LiteLLM, LM Studio, etc.).
 *
 * Example:
 * ```typescript
 * const client = new OpenAIClient({
 *   name: 'local', provider: 'openai',
 *   model: 'gemma4-e2b', apiBase: 'http://127.0.0.1:8080/v1', apiKey: 'local'
 * });
 *
 * for await (const token of client.streamChatCompletion(messages)) {
 *   process.stdout.write(token);
 * }
 * ```
 */
export class OpenAIClient {
  private apiBase: string;
  private apiKey: string;
  private model: string;

  constructor(config: LaiModelConfig) {
    this.apiBase = config.apiBase.replace(/\/+$/, "");
    this.apiKey = config.apiKey;
    this.model = config.model;
  }

  /** Update connection parameters at runtime (e.g., after config reload). */
  updateConfig(config: LaiModelConfig): void {
    this.apiBase = config.apiBase.replace(/\/+$/, "");
    this.apiKey = config.apiKey;
    this.model = config.model;
  }

  getModel(): string {
    return this.model;
  }

  getApiBase(): string {
    return this.apiBase;
  }

  // ─── Chat Completions ────────────────────────────────────────────────────

  /**
   * Stream chat completions. Yields content tokens as they arrive.
   * Uses POST /v1/chat/completions with stream: true.
   */
  async *streamChatCompletion(
    messages: ChatMessage[],
    options: StreamOptions = {}
  ): AsyncGenerator<string, void, undefined> {
    const body = JSON.stringify({
      model: this.model,
      messages,
      stream: true,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 4096,
      ...(options.stop ? { stop: options.stop } : {}),
    });

    const url = new URL(`${this.apiBase}/chat/completions`);
    const response = await makeRequest(url, body, this.apiKey, options.signal);
    yield* parseSSEStream(response, "chat");
  }

  /**
   * Non-streaming chat completion. Returns the full response string.
   */
  async chatCompletion(
    messages: ChatMessage[],
    options: StreamOptions = {}
  ): Promise<string> {
    const tokens: string[] = [];
    for await (const token of this.streamChatCompletion(messages, options)) {
      tokens.push(token);
    }
    return tokens.join("");
  }

  // ─── Text Completions (FIM / Autocomplete) ──────────────────────────────

  /**
   * Stream text completions. Yields text tokens as they arrive.
   * Uses POST /v1/completions with stream: true.
   * Designed for Fill-In-The-Middle (FIM) autocomplete.
   */
  async *streamCompletion(
    prompt: string,
    options: StreamOptions = {}
  ): AsyncGenerator<string, void, undefined> {
    const body = JSON.stringify({
      model: this.model,
      prompt,
      stream: true,
      temperature: options.temperature ?? 0.2,
      max_tokens: options.maxTokens ?? 256,
      ...(options.stop ? { stop: options.stop } : {}),
    });

    const url = new URL(`${this.apiBase}/completions`);
    const response = await makeRequest(url, body, this.apiKey, options.signal);
    yield* parseSSEStream(response, "completion");
  }

  /**
   * Non-streaming text completion. Returns the full response string.
   */
  async completion(
    prompt: string,
    options: StreamOptions = {}
  ): Promise<string> {
    const tokens: string[] = [];
    for await (const token of this.streamCompletion(prompt, options)) {
      tokens.push(token);
    }
    return tokens.join("");
  }

  // ─── Health Check ────────────────────────────────────────────────────────

  /**
   * Tests connectivity to the inference server.
   * Returns true if the /v1/models endpoint responds successfully.
   */
  async healthCheck(): Promise<{ ok: boolean; error?: string }> {
    try {
      const url = new URL(`${this.apiBase}/models`);
      const isHttps = url.protocol === "https:";
      const transport = isHttps ? https : http;

      return new Promise((resolve) => {
        const req = transport.get(
          {
            hostname: url.hostname,
            port: url.port || (isHttps ? "443" : "80"),
            path: url.pathname,
            headers: { Authorization: `Bearer ${this.apiKey}` },
            timeout: 5000,
          },
          (res) => {
            let body = "";
            res.on("data", (chunk) => (body += chunk.toString()));
            res.on("end", () => {
              if (res.statusCode && res.statusCode < 400) {
                resolve({ ok: true });
              } else {
                resolve({
                  ok: false,
                  error: `HTTP ${res.statusCode}: ${body}`,
                });
              }
            });
          }
        );
        req.on("error", (err) => resolve({ ok: false, error: err.message }));
        req.on("timeout", () => {
          req.destroy();
          resolve({ ok: false, error: "Connection timed out (5s)" });
        });
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg };
    }
  }
}
