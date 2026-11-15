/**
 * @module project-lai/core/model-engine
 * Encapsulates the node-llama-cpp model lifecycle.
 *
 * All LLM interaction is isolated behind the IModelEngine interface,
 * making it swappable for llama-server or Ollama in Phase 3.
 *
 * @license Apache-2.0
 */

import { getLlama, LlamaChatSession } from "node-llama-cpp";
import type { Llama, LlamaModel, LlamaContext } from "node-llama-cpp";
import type { IModelEngine } from "../types/index.js";

export class GemmaModelEngine implements IModelEngine {
  private modelPath: string;
  private llama: Llama | null = null;
  private model: LlamaModel | null = null;
  private context: LlamaContext | null = null;
  private session: LlamaChatSession | null = null;
  private loaded = false;

  constructor(modelPath: string) {
    this.modelPath = modelPath;
  }

  async load(): Promise<void> {
    if (this.loaded) return;

    console.log("🔄 Loading model into memory... (this may take a moment)");
    this.llama = await getLlama();
    this.model = await this.llama.loadModel({ modelPath: this.modelPath });
    this.context = await this.model.createContext({ contextSize: 4096 });
    this.session = new LlamaChatSession({
      contextSequence: this.context.getSequence(),
    });
    this.loaded = true;
    console.log("✅ Model loaded successfully.\n");
  }

  async prompt(text: string): Promise<string> {
    if (!this.session) {
      throw new Error("Model not loaded. Call load() first.");
    }
    return await this.session.prompt(text);
  }

  async resetSession(): Promise<void> {
    if (!this.context) {
      throw new Error("Model not loaded. Call load() first.");
    }
    // Create a fresh session on the same context — model stays in memory
    this.session = new LlamaChatSession({
      contextSequence: this.context.getSequence(),
    });
    console.log("🔄 Chat session reset. Context history cleared.\n");
  }

  async dispose(): Promise<void> {
    if (this.llama) {
      await this.llama.dispose();
      this.llama = null;
      this.model = null;
      this.context = null;
      this.session = null;
      this.loaded = false;
    }
  }

  isLoaded(): boolean {
    return this.loaded;
  }
}
