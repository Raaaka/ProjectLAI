# Project LAI: Comprehensive Implementation & Setup Summary

## Overview & Architecture

Project LAI (Local AI) is a lightweight, decentralized, local-first execution plan designed for teams to run AI coding assistants, automated linter tools, and browser automation agents directly on local hardware without incurring cloud costs, breaching corporate VPN restrictions, or violating Data Loss Prevention (DLP) policies \[cite: 1, 2, 11\].

---

## Hardware & Environment Sizing Matrix

For local execution on standard enterprise hardware (such as the Dell Pro 14 Plus with Intel Core Ultra 5 or personal laptops with NVIDIA GTX 1650 GPUs), models are selected based on strict performance and memory budgets:

| Tier | Target Models | Quantization | RAM / VRAM Needed | Recommended Compute Setup | Expected Speed & Use Case |
| :---- | :---- | :---- | :---- | :---- | :---- |
| **Lightweight (CPU / Low VM)** | Qwen2.5-Coder-1.5B Qwen2.5-Coder-3B Gemma-2-2B Gemma 4 (E2B / E4B) | Q4\_K\_M / Q4\_0 | **4 GB – 8 GB RAM** (\~2–4 GB VRAM if GPU) | 4 vCPU (AVX2 support) or entry GPU (GTX 1650, T4, Intel Arc iGPU) | **15–35 tok/s on CPU**. Ideal for single-file linting, fast code checks, and local workstation setups \[cite: 2, 11\]. |

---

## Step-by-Step Setup Guide

### Phase 1: Local Single-Machine Baseline

1. **Verify Prerequisites:** Ensure Node.js (\$\\ge\$ v18) and Git are installed. Create a dedicated project directory (e.g., `C:\ProjectLAI`) with a `models` subfolder \[cite: 1, 6, 7\].  
2. **Download Inference Engine:** Obtain the appropriate precompiled binary for your system:  
   - For NVIDIA GPUs (e.g., GTX 1650): Download the CUDA 12.4 version of `llama-server` and its companion CUDA runtime DLL archive \[cite: 1, 10\].  
   - For Intel/AMD integrated graphics: Use the Vulkan build.  
3. **Download Quantized Model Weights:** Download a 4-bit quantized GGUF file (such as `gemma4-e2b.gguf` or `gemma4-e4b.gguf`) from Hugging Face and place it in the `models` folder \[cite: 1, 2, 8\].  
4. **Launch the Inference Engine (Localhost):** Start the server bound strictly to localhost:

```
llama-server.exe -m .\models\gemma4-e2b.gguf --host 127.0.0.1 --port 8080 -c 4096 -t 6 -ngl 99
```

5. **Health Check:** Open a second terminal window and verify the API endpoint is responsive:

```
curl http://127.0.0.1:8080/health
```

### Phase 2: Client Integration & Dual-Mode CLI (`ai-linter.ts`)

1. **IDE Configuration:** Install **Roo Code** or **Continue.dev** in VS Code. Configure the provider as **OpenAI-Compatible** with Base URL `http://127.0.0.1:8080/v1` \[cite: 1, 8\].  
2. **Dual-Mode Linter Execution:**  
   - **Mode 1 (Agent Mode):** Run interactively via terminal (`npm run ai:chat`) using native Node.js `readline` and session memory, complete with a `/reset` command \[cite: 3, 13\].  
   - **Mode 2 (CI/CD Mode):** Run statelessly via file targets (`npm run ai:lint -- --file <path>`) leveraging native `node:util.parseArgs` for lightweight, dependency-free flag parsing \[cite: 3, 13\].  
3. **Playwright MCP Server Integration:** Register the Playwright Model Context Protocol server in VS Code to enable the AI to autonomously launch headless Chromium browsers, inspect live DOM trees, and verify data-testid locators \[cite: 3, 13\].

### Phase 3: Network Expansion (One-to-Many Architecture / "Gojira" & "Titans")

1. **Configure Host (Gojira):**  
   - Identify the host machine's local IPv4 address using `ipconfig` \[cite: 7\].  
   - Create an inbound Windows Firewall rule allowing TCP traffic on port `8080` \[cite: 1, 7\].  
   - Launch `llama-server` bound to all network interfaces with continuous batching and parallel slots enabled \[cite: 1, 6, 8\]:

```
llama-server.exe -m .\models\gemma4-e2b.gguf --host 0.0.0.0 --port 8080 -c 4096 -t 6 -ngl 99 --cont-batching -np 2
```

2. **Connect Clients (Titans):** Connect consumer laptops on the same Wi-Fi network by pointing their IDE extensions or API requests to `http://<GOJIRA_IP>:8080/v1` \[cite: 1, 8\].

---

## Telemetry & Sizing Metrics to Capture

Record baseline consumption metrics during test workloads to build an enterprise scaling model:

* **Idle RAM Footprint:** Baseline system memory usage (\< 5 GB) \[cite: 2\].  
* **Active Inference RAM:** Total model \+ KV cache memory footprint (\~3.5 GB to 6 GB) \[cite: 2\].  
* **Token Generation Speed:** Target generation throughput (15–30 tok/s for lightweight models) \[cite: 2\].  
* **Browser Automation Overhead:** Resource spikes when launching Playwright Chromium alongside active LLM context \[cite: 2, 3\].