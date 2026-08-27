# Changelog

All notable changes to Project LAI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-08-26

### Added
- **Agent Mode**: Interactive CLI chat with `/reset`, `/review`, `/prompt`, `/prompts`, `/help`, `/exit` commands.
- **CI/CD Mode**: Headless single-shot file analysis with structured JSON output and exit codes.
- **Native argument parsing**: Uses `node:util.parseArgs` — zero third-party CLI dependencies.
- **Externalized prompts**: System prompts stored as editable Markdown files in `prompts/`.
- **Typed public API**: Full TypeScript type exports for IDE IntelliSense when used as a library.
- **Model auto-discovery**: Automatically finds `.gguf` files in the `models/` directory.
- **Apache 2.0 License**: Enterprise-ready licensing with explicit patent protection.
- **Dual output format**: JSON (default for CI) and human-readable (for terminal use).
- Default `playwright-review` prompt for Playwright/Cucumber test analysis.
