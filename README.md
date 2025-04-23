# AI CLI Tool

A powerful command-line interface tool powered by AI to assist developers with coding tasks, project creation, and code analysis.

## Overview

AI CLI Tool is an interactive command-line application that leverages AI models (currently Gemini) to help developers with various coding tasks. It provides a natural language interface to interact with your codebase, create files, run commands, and get AI-powered assistance.

## Features

- **Natural Language Interaction**: Ask questions or give instructions in plain English.
- **Improved Multi-Step Task Handling**: Enhanced ability for the AI to plan and execute sequential tasks, especially for project scaffolding.
- **Context-Aware Command Execution**: The AI can now execute shell commands within specific subdirectories using the `cwd` parameter.
- **Code Analysis**: Analyze your codebase structure.
- **File Operations**: Create, read, and update files through natural language or specific commands.
- **Conversation History**: Maintain context across multiple interactions.
- **Multiple AI Models**: Support for different AI models (currently Gemini).

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/ai-cli-tool.git
cd ai-cli-tool

# Install dependencies
pnpm install

# Build the project
pnpm build
```

## Configuration

Create a `.env` file in the root directory with your API keys:

```
GEMINI_API_KEY=your_gemini_api_key_here
```

You can also create a `.ai-cli-config.json` file to customize the tool's behavior:

```json
{
  "defaultModel": "gemini-1.5-flash-latest",
  "apiKeyEnvVar": "GEMINI_API_KEY",
  "cache": {
    "enabled": true,
    "ttl": 3600
  },
  "output": {
    "colors": true
  }
}
```

## Usage

Run the tool:

```bash
node dist/cli/index.js
```

Interact with the AI using natural language for tasks like:
- "Explain the function `foo` in `bar.js`"
- "Create a file named `config.yaml` with basic settings"
- "Install the `chalk` package using pnpm"
- "Create a basic Vite React project called `my-app`" (The AI will now plan and execute `npm create`, `npm install` in the correct directory)

### Available Commands

- **Natural Language**: Type any question or instruction. The AI will attempt to plan and execute the necessary steps.
- **/create**: Manually create files or directories (e.g., `/create file path/to/file.txt`).
- **/run**: Manually execute a single shell command (e.g., `/run git status`).
- **/model**: Select the AI model to use.
- **/history**: View conversation history.
- **/clear**: Clear conversation history.
- **/help**: Show available commands.
- **/quit**: Exit the application.

## Current Functionality

The AI CLI Tool currently supports:

1.  **File Operations**: Creating, reading, and updating files.
2.  **Enhanced Shell Command Execution**:
    *   Running commands with confirmation.
    *   Executing commands in specified subdirectories (using `cwd`).
    *   Capturing and displaying command output.
3.  **Code Analysis**: Basic analysis of codebase structure.
4.  **AI Interaction**:
    *   Natural language queries.
    *   Improved planning for multi-step tasks.
    *   Context-aware responses.
    *   Conversation history.
5.  **Project Scaffolding**: Improved ability to handle project creation workflows (e.g., creating directories, running initial setup commands, installing dependencies in the correct context).

## Contributing

Contributions are welcome! Here's how you can contribute:

1.  **Fork the repository**
2.  **Create a feature branch**: `git checkout -b feature/amazing-feature`
3.  **Commit your changes**: `git commit -m 'Add some amazing feature'`
4.  **Push to the branch**: `git push origin feature/amazing-feature`
5.  **Open a Pull Request**

### Development Setup

```bash
# Install dependencies
pnpm install

# Build the project
pnpm build

# Run tests (when available)
pnpm test
```

### Project Structure

- `src/cli`: Command-line interface logic (`index.ts`), command handlers.
- `src/core`: Core functionality:
    - `ai`: AI model adapters (`gemini.ts`, `interface.ts`), tool definitions (`tools.ts`).
    - `config`: Configuration loading (`loader.ts`).
    - `execution`: Shell command execution logic (`runner.ts`).
    - `generation`: File/directory creation logic (`generator.ts`).
    - `analysis`: Codebase analysis (`parser.ts`).
    - `session.ts`: Conversation history and session state management.
- `src/utils`: Utility functions (logging, filesystem).

## Roadmap

- [ ] Further enhance project scaffolding automation (reduce confirmations).
- [ ] Automated dependency detection and management.
- [ ] Code generation and refactoring capabilities.
- [ ] Integration with more AI models.
- [ ] Plugin system for extensibility.
- [ ] Interactive development mode.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Author

**Shahid Amin** - [GitHub](https://github.com/aminshahid573)

## Acknowledgments

- Google Gemini AI for providing the AI capabilities.
- The open-source community for inspiration and tools 