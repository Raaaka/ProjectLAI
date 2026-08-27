# Contributing to Project LAI

Thank you for your interest in contributing to Project LAI! This document provides guidelines and instructions for contributing.

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for everyone.

## How to Contribute

### Reporting Issues
- Use GitHub Issues to report bugs or request features.
- Include steps to reproduce for bugs.
- Specify your Node.js version and OS.

### Pull Requests
1. **Fork** the repository and create a branch from `main`.
2. **Install dependencies**: `npm install`
3. **Make your changes** in the `src/` directory.
4. **Build**: `npm run build` to verify the project compiles.
5. **Test locally**: Run `npm run ai:chat` to verify Agent Mode works.
6. **Submit** a pull request with a clear description of your changes.

### Adding New Prompts
To add support for a new language or framework:
1. Create a new `.md` file in the `prompts/` directory (e.g., `prompts/react-review.md`).
2. Follow the structure of `prompts/playwright-review.md`.
3. The prompt is automatically discovered — no code changes needed.
4. Users can select it with `--prompt react-review` or `/prompt react-review`.

## Development Setup

```bash
# Clone the repository
git clone https://github.com/Raaaka/project-lai.git
cd project-lai

# Install dependencies
npm install

# Place a GGUF model in the models/ directory
# e.g., models/gemma-4-E4B-it-Q4_K_M.gguf

# Run in development mode
npm run ai:chat

# Build for production
npm run build
```

## Project Structure

```
src/
├── cli.ts              # CLI entry point (parseArgs routing)
├── index.ts            # Library public API exports
├── core/
│   ├── analyzer.ts     # Pure analysis function
│   └── model-engine.ts # LLM lifecycle management
├── modes/
│   ├── agent-mode.ts   # Interactive chat
│   └── ci-mode.ts      # Headless CI/CD
└── types/
    └── index.ts        # Public TypeScript interfaces
```

## License

By contributing, you agree that your contributions will be licensed under the Apache License 2.0.
