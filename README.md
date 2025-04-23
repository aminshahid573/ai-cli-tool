# AI CLI Tool

A powerful command-line interface tool powered by AI to assist developers with coding tasks, project creation, and code analysis.

## Overview

AI CLI Tool is an interactive command-line application that leverages AI models (currently Gemini) to help developers with various coding tasks. It provides a natural language interface to interact with your codebase, create files, run commands, and get AI-powered assistance.

## Features

- **Natural Language Interaction**: Ask questions or give instructions in plain English
- **Code Analysis**: Analyze your codebase and get insights
- **File Operations**: Create, read, and update files through natural language commands
- **Command Execution**: Run shell commands with AI assistance
- **Conversation History**: Maintain context across multiple interactions
- **Multiple AI Models**: Support for different AI models (currently Gemini)

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

### Available Commands

- **Natural Language**: Type any question or instruction
- **/create**: Create files or directories
- **/run**: Execute shell commands
- **/model**: Select the AI model to use
- **/history**: View conversation history
- **/clear**: Clear conversation history
- **/help**: Show available commands
- **/quit**: Exit the application

## Current Functionality

The AI CLI Tool currently supports:

1. **Basic File Operations**:
   - Creating files with content
   - Reading file contents
   - Updating existing files

2. **Shell Command Execution**:
   - Running commands with confirmation
   - Capturing and displaying command output

3. **Code Analysis**:
   - Analyzing codebase structure
   - Providing insights about code

4. **AI Interaction**:
   - Natural language queries
   - Context-aware responses
   - Conversation history

5. **Project Management**:
   - Basic project scaffolding
   - Dependency installation

## Contributing

Contributions are welcome! Here's how you can contribute:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Commit your changes**: `git commit -m 'Add some amazing feature'`
4. **Push to the branch**: `git push origin feature/amazing-feature`
5. **Open a Pull Request**

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

- `src/cli`: Command-line interface implementation
- `src/core`: Core functionality
  - `ai`: AI model adapters and tools
  - `config`: Configuration management
  - `execution`: Command execution
  - `generation`: File generation
  - `analysis`: Code analysis
- `src/utils`: Utility functions

## Roadmap

- [ ] Enhanced project scaffolding
- [ ] Automated dependency management
- [ ] Code refactoring capabilities
- [ ] Integration with more AI models
- [ ] Plugin system for extensibility
- [ ] Improved code generation
- [ ] Interactive development mode

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Author

**Shahid Amin** - [GitHub](https://github.com/yourusername)

## Acknowledgments

- Google Gemini AI for providing the AI capabilities
- The open-source community for inspiration and tools 