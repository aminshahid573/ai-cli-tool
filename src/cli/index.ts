#!/usr/bin/env node
import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import ora from 'ora';

import { loadConfig, type Config } from '../core/config/loader.js';
import { registerCreateCommand } from './commands/create.js';
import { registerRunCommand } from './commands/run.js';
import { logger } from '../utils/logger.js';
import {
    initializeSession, getSession, updateSession, addTurnToHistory, clearHistory,
    AVAILABLE_MODELS, isValidModelId, type AvailableModelId, type SessionState,
    // FIX: Import EXPORTED part types from session.ts
    type ConversationTurn, type TextPart, type FunctionCallPart, type FunctionResponsePart
} from '../core/session.js';
import { getAiClient } from '../core/ai/client.js';
import { analyzeCodebase, type CodebaseInfo } from '../core/analysis/parser.js';
import { availableTools, geminiToolConfig, type ToolName, type ToolResult } from '../core/ai/tools.js';
import { type AiToolResponse } from '../core/ai/adapters/interface.js'; // Import from interface

// --- Setup Package Info & Config ---
let pkg: { version: string; name?: string; description?: string };
let config: Config;
try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const packageJsonPath = path.resolve(__dirname, '../../package.json');
    const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
    pkg = JSON.parse(packageJsonContent);
    config = await loadConfig();
    initializeSession(config);
    logger.debug("Configuration and session loaded.");
} catch (error) {
    console.error(chalk.red('Fatal Error: Failed to load package.json or config'), error);
    pkg = { version: '0.0.0', name: 'ai-cli-tool (unknown)' };
    process.exit(1);
}

// --- Define Slash Commands ---
const SLASH_COMMANDS = {
    '/create': 'Manually create file/dir (e.g., /create file path/to/file.txt).',
    '/run': 'Manually run a shell command after confirmation (e.g., /run npm install).',
    '/model': 'Select the AI model to use.',
    '/history': 'Show conversation history.',
    '/clear': 'Clear conversation history.',
    '/help': 'Show available commands and usage.',
    '/quit': 'Exit the AI CLI.',
} as const;
type SlashCommand = keyof typeof SLASH_COMMANDS;

const GREETINGS = ['hi', 'hello', 'hey', 'yo', 'greetings', 'sup'];

// --- Main Application Logic ---
async function main() {
    const program = new Command();
    program
        .name(pkg.name || 'ai-cli (interactive)')
        .description(pkg.description || 'AI-powered CLI assistant')
        .version(pkg.version)
        .exitOverride();

    registerCreateCommand(program, config);
    registerRunCommand(program, config);

    logger.log(chalk.cyanBright(`\nWelcome to AI CLI v${pkg.version}!`));
    logger.log(`I can help with code questions, file operations, commands, and project setup.`);
    logger.log(`Current directory: ${chalk.yellow(process.cwd())}`);
    logger.log(`Type your request or use ${chalk.yellow('/help')}.`);

    await interactiveLoop(program);
}

// --- Interactive Prompt Loop ---
async function interactiveLoop(program: Command) {
    while (true) {
        const session = getSession();
        const currentDir = path.basename(process.cwd());
        const promptPrefix = `[${chalk.blue(session.currentModel)}] ${chalk.gray(currentDir)} >`;

        try {
            const { userInput } = await inquirer.prompt({
                type: 'input' as const, name: 'userInput', message: promptPrefix,
            });

            const trimmedInput = userInput.trim();
            if (!trimmedInput) continue;

            addTurnToHistory({ role: 'user', parts: [{ text: trimmedInput }] });

            if (GREETINGS.includes(trimmedInput.toLowerCase().split(' ')[0])) {
                await handleGreeting(trimmedInput);
                continue;
            }

            if (trimmedInput.startsWith('/')) {
                const [command, ...args] = trimmedInput.split(' ');
                const slashCmd = command as SlashCommand;
                switch (slashCmd) {
                    case '/quit': logger.log(chalk.yellow('Goodbye!')); process.exit(0);
                    case '/help': handleHelp(); break;
                    // FIX: Ensure handler is called
                    case '/model': await handleModelSelection(); break;
                    case '/create': await handleManualCreateCommand(program, args); break;
                    case '/run': await handleManualRunCommand(program, args); break;
                    case '/history': handleShowHistory(); break;
                    case '/clear': handleClearHistory(); break;
                    default:
                        const errorMsg = `Unknown command: ${command}. Type ${chalk.yellow('/help')} for options.`;
                        logger.error(chalk.red(errorMsg));
                        addTurnToHistory({ role: 'model', parts: [{ text: errorMsg }] });
                }
            } else {
                // Handle all natural language input via the tool loop
                logger.info(`Processing: "${trimmedInput}"...`);
                await handleNaturalLanguageWithToolLoop(program, trimmedInput);
            }

        } catch (error: any) {
             if (error.code === 'commander.exit') {
                logger.debug(`Commander exit override caught (Code: ${error.exitCode}).`);
             } else if (error.isTtyError) {
                logger.error(chalk.red("Interactive prompt failed: Unsupported terminal environment."));
             } else {
                logger.error(chalk.red(`Loop Error:`), error.message);
                logger.debug(error);
                addTurnToHistory({ role: 'model', parts: [{ text: `An unexpected error occurred: ${error.message}` }] });
             }
        }
        logger.log('');
    }
}

// --- AI Interaction with Tool Planning and Execution ---

async function handleNaturalLanguageWithToolLoop(program: Command, userInput: string) {
    logger.debug(`Entering tool loop for input: "${userInput}"`);
    const session = getSession();
    const MAX_TOOL_ITERATIONS = 10;
    let iterations = 0;

    // The user's request turn is already added in interactiveLoop

    while (iterations < MAX_TOOL_ITERATIONS) {
        iterations++;
        logger.debug(`Tool loop iteration ${iterations}`);

        let historyForAI = [...session.history]; // Get current history

        // --- Inject System Prompt / Context ---
        // Providing context helps the AI make better decisions
        let analysisDetails = "No codebase analysis performed for this request.";
        // Optionally run analysis if the request seems code-related (could use prior intent classification)
        if (userInput.toLowerCase().includes('code') || userInput.toLowerCase().includes('file')) { // Simple check
            try {
                 const cwd = process.cwd();
                 const analysisInfo = await analyzeCodebase(cwd, false); // Run quick analysis
                 if (analysisInfo && analysisInfo.files.length > 0) {
                     analysisDetails = `Code analysis summary: ${analysisInfo.files.length} files found, including ${analysisInfo.files.slice(0,5).map(f=>f.relativePath).join(', ')}...`;
                 } else if (analysisInfo) {
                      analysisDetails = "Code analysis ran, but no relevant files were found.";
                 } else {
                      analysisDetails = "Code analysis could not be performed (invalid directory?).";
                 }
            } catch (e) { analysisDetails = "Error during code analysis."; }
        }

        const systemPromptTurn: ConversationTurn = {
            role: 'user',
            parts: [{
                text: `System Context: You are a helpful AI assistant operating in a CLI environment on behalf of the user.
Current Directory: ${process.cwd()}
User's Goal: Fulfill the user's latest request ("${userInput}").

Instructions:
1. Analyze the user's goal. If it involves multiple steps (like creating a project, installing dependencies, and generating code), plan the sequence of tool calls required.
2. Respond with EITHER:
   a) The *next* single function call required in your plan. Use the available tools.
   b) A final text answer if the request is complete, requires clarification, or cannot be fulfilled with the tools.
3. **Crucially**: When using 'run_shell_command' *after* creating a new directory (e.g., for 'npm install' inside 'new-project'), you MUST use the 'cwd' parameter to specify the relative path to that directory (e.g., { command: 'npm install', cwd: './new-project' }).
4. **DO NOT** use 'cd some-dir && other-command' inside the 'command' field if the goal is to run 'other-command' inside 'some-dir'. Instead, use the 'cwd' parameter: { command: 'other-command', cwd: './some-dir' }.
5. For complex goals, expect to make multiple tool calls sequentially. After each tool execution result, reassess and call the next tool in your plan until the goal is achieved.

Available Tools:
${Object.values(availableTools).map(t => `- ${t.declaration.name}: ${t.declaration.description}`).join('\n')}
Directory Analysis: ${analysisDetails}

Provide ONLY the next required function call from your plan OR the final text response.`
            }]
        };

        // Inject before the last *user* message if appropriate
        // Find last user message index
        let lastUserIndex = historyForAI.length - 1;
        while(lastUserIndex >= 0 && historyForAI[lastUserIndex].role !== 'user') {
            lastUserIndex--;
        }
        if (lastUserIndex >= 0) {
             historyForAI.splice(lastUserIndex, 0, systemPromptTurn); // Insert before last user turn
        } else {
             historyForAI.unshift(systemPromptTurn); // Add at beginning if no user turn yet
        }


        const aiSpinner = ora(`AI Processing (Iteration ${iterations})...`).start();
        let aiResponse: AiToolResponse; // Expecting the structured response now

        try {
            const aiClient = getAiClient(config, session.currentModel);
            aiSpinner.text = `Sending to ${session.currentModel} (Iteration ${iterations})...`;
            // Generate expects string | ConversationTurn[], returns AiToolResponse
            const rawResponse = await aiClient.generate(historyForAI);

            // Ensure we always have an AiToolResponse object
            if (typeof rawResponse === 'string') {
                 logger.warn("AI Adapter returned string unexpectedly, wrapping in AiToolResponse.");
                 aiResponse = { text: rawResponse };
            } else {
                 aiResponse = rawResponse;
            }
            aiSpinner.stop();

        } catch (error: any) {
            aiSpinner.fail('AI query failed.');
            const errorMsg = `Error interacting with AI: ${error.message}`;
            logger.error(errorMsg);
            addTurnToHistory({ role: 'model', parts: [{ text: `Sorry, encountered an AI error: ${error.message}` }] });
            break; // Exit loop on AI error
        }

        // --- Process AI Response ---
        const responseText = aiResponse.text?.trim();
        const functionCall = aiResponse.functionCall;

        // 1. Handle Text Response (if provided)
        if (responseText) {
            logger.aiResponse(responseText);
            addTurnToHistory({ role: 'model', parts: [{ text: responseText }] });
            // If AI gives only text, assume task is done or needs user input
            if (!functionCall) {
                 logger.debug("AI provided text only. Exiting tool loop.");
                 break;
            }
             // If text AND function call, log text but proceed with function call
             logger.debug("AI provided text explanation before function call.");
        }

        // 2. Handle Function Call (if provided)
        if (functionCall) {
             const toolName = functionCall.name as ToolName;
             const toolArgs = functionCall.args ?? {};

             logger.info(`AI wants to run tool: ${chalk.yellow(toolName)} with args:`, toolArgs);

            // Add function call request to history
            addTurnToHistory({ role: 'model', parts: [{ functionCall: { name: toolName, args: toolArgs } }] });

            const toolToExecute = availableTools[toolName];
            if (toolToExecute) {
                // --- CONFIRMATION STEP ---
                let confirm = false;
                const requiresConfirmation = ['run_shell_command', 'update_file', 'delete_file']; // Define risky tools
                let commandDesc = JSON.stringify(toolArgs);
                 if (toolName === 'run_shell_command' && toolArgs.command) {
                     commandDesc = toolArgs.command;
                 } else if (toolName === 'delete_file' && toolArgs.path) {
                      commandDesc = `Delete file at ${toolArgs.path}`;
                 }


                if (requiresConfirmation.includes(toolName)) {
                    logger.log(''); // Spacing
                     const confirmResult = await inquirer.prompt([ {
                         type: 'confirm', name: 'confirm',
                         message: `AI wants to run ${chalk.yellow(toolName)}. ${chalk.bold.red('Confirm execution?')}\n  Details: ${chalk.cyan(commandDesc)}\n`,
                         default: false, // Default to NO for safety
                     }]);
                     confirm = confirmResult.confirm;
                     logger.log('');
                 } else {
                    confirm = true; // Auto-confirm safer tools
                    logger.debug(`Auto-confirming safe tool: ${toolName}`);
                 }

                 if (confirm) {
                     const toolSpinner = ora(`Executing tool: ${toolName}...`).start();
                     let toolResult: ToolResult;
                     try {
                         // FIX: Cast args to any for now to satisfy complex union type in function signature
                         toolResult = await toolToExecute.function(toolArgs as any);
                         toolSpinner.succeed(`Tool ${toolName} executed.`);
                     } catch (execError: any) {
                         toolSpinner.fail(`Tool ${toolName} failed during execution.`);
                         logger.error(`Tool execution error: ${execError.message}`);
                         toolResult = { success: false, error: `Tool function threw error: ${execError.message}` };
                     }

                     logger.debug("Tool Result:", toolResult);

                     // Add the function response (result) to history using 'tool' role
                     addTurnToHistory({
                         role: 'tool',
                         parts: [{ functionResponse: { name: toolName, response: toolResult } }]
                     });

                     if (!toolResult.success) {
                         logger.error(`Tool ${toolName} reported failure: ${toolResult.error || 'Unknown reason'}`);
                         // Let the loop continue, AI will see the error and can react
                     }
                     // Continue the loop to send tool result back to AI

                 } else { // User cancelled
                     logger.log(chalk.yellow('Tool execution cancelled by user.'));
                      addTurnToHistory({
                         role: 'tool',
                         parts: [{ functionResponse: { name: toolName, response: { success: false, error: 'User cancelled execution.' } } }]
                     });
                      break; // Exit loop after user cancellation
                 }
            } else { // Unknown tool
                logger.error(`AI requested unknown tool: ${toolName}`);
                 addTurnToHistory({
                     role: 'tool',
                     parts: [{ functionResponse: { name: toolName, response: { success: false, error: `Unknown tool requested: ${toolName}` } } }]
                 });
                break; // Stop loop if unknown tool
            }
        } else {
            // No function call AND no text (or only text processed above and loop didn't break)
            // If we are here, it likely means AI gave only text previously and loop should have ended.
             // Or AI gave neither text nor function call.
            logger.debug("AI provided no further actions or text. Exiting tool loop.");
            break; // Exit the while loop
        }
    } // End while loop

    if (iterations >= MAX_TOOL_ITERATIONS) {
         logger.warn("Reached maximum tool execution iterations.");
         addTurnToHistory({ role: 'model', parts: [{ text: "It seems this task requires more steps than expected. Please try breaking it down or refine the request." }] });
    }

} // End handleNaturalLanguageWithToolLoop


// --- Other Handlers ---

async function handleGreeting(userInput: string) {
    const greetingResponse = `👋 Hello there! I'm AI CLI v${pkg.version}. Ready for your requests!`;
    logger.log(chalk.magenta(greetingResponse));
    addTurnToHistory({ role: 'model', parts: [{ text: greetingResponse }] });
}

async function handleManualCreateCommand(program: Command, args: string[]) {
    if (args.length < 2 || !['file', 'directory', 'dir'].includes(args[0].toLowerCase())) {
        const errorMsg = 'Usage: /create <file|directory> <path>';
        logger.error(chalk.red(errorMsg));
        addTurnToHistory({ role: 'model', parts: [{ text: `Command format error. ${errorMsg}` }] });
        return;
    }
    const subcommand = args[0].toLowerCase();
    const targetPath = args.slice(1).join(' ');
    logger.debug('Executing manual create command programmatically:', ['create', subcommand, targetPath]);
    try {
        await program.parseAsync(['create', subcommand, targetPath], { from: 'user' });
    } catch (error: any) {
        logger.error(chalk.red(`Error executing '/create' command logic: ${error.message}`), error);
        addTurnToHistory({ role: 'model', parts: [{ text: `Sorry, I failed to execute the create command: ${error.message}` }] });
    }
}

async function handleManualRunCommand(program: Command, args: string[]) {
     if (args.length === 0) {
        const errorMsg = 'Usage: /run <command_to_execute...>';
        logger.error(chalk.red(errorMsg));
        addTurnToHistory({ role: 'model', parts: [{ text: `Missing command. ${errorMsg}` }] });
        return;
    }
    const cmdArgs = ['run', ...args];
    logger.debug('Executing manual run command programmatically:', cmdArgs);
    try {
        await program.parseAsync(cmdArgs, { from: 'user' });
    } catch (error: any) {
         logger.error(chalk.red(`Error executing '/run' command logic: ${error.message}`), error);
         addTurnToHistory({ role: 'model', parts: [{ text: `Sorry, I failed to execute the run command: ${error.message}` }] });
    }
}

function handleShowHistory() {
    const session = getSession();
    logger.log(chalk.cyanBright('\n--- Conversation History ---'));
    if (session.history.length === 0) {
        logger.log(chalk.gray('(No history yet)'));
    } else {
        session.history.forEach((turn) => {
            let prefix = '';
            let contentStr = '';
            const part = turn.parts[0]; // Assume single part for simplicity

            switch (turn.role) {
                case 'user': prefix = chalk.blue('You:'); break;
                case 'model': prefix = chalk.green('AI:'); break;
                case 'tool': prefix = chalk.yellow(`Tool Result `); break;
                default: prefix = chalk.red(`${turn.role}:`);
            }

            try {
                 // Use type guards for safe access
                 if ('text' in part && part.text) {
                     contentStr = part.text;
                 } else if ('functionCall' in part && part.functionCall) {
                     prefix = chalk.green('AI -> Tool:');
                     contentStr = chalk.magenta(`Call: ${part.functionCall.name}(${JSON.stringify(part.functionCall.args)})`);
                 } else if ('functionResponse' in part && part.functionResponse) {
                     const resp = part.functionResponse.response;
                     prefix = chalk.yellow(`Tool Result (${part.functionResponse.name}):`);
                     // Truncate long outputs/errors for display
                     const outputStr = resp.output ? ` | Output: ${resp.output.substring(0, 100)}${resp.output.length > 100 ? '...' : ''}` : '';
                     const errorStr = resp.error ? ` | Error: ${resp.error.substring(0, 150)}${resp.error.length > 150 ? '...' : ''}` : '';
                     contentStr = `${resp.success ? chalk.green('Success') : chalk.red('Failed')}${outputStr}${errorStr}`;
                 } else {
                     contentStr = '[Empty or Unknown Part]';
                 }
            } catch (e) { contentStr = '[Error formatting history part]'; }

            if (prefix.trim() || contentStr.trim()) {
                logger.log(`${prefix} ${contentStr}`);
            }
        });
        logger.log(chalk.cyanBright('--- End of History ---'));
    }
}


function handleClearHistory() {
    clearHistory();
    const clearMsg = "Conversation history cleared.";
    logger.log(chalk.yellow(clearMsg));
    addTurnToHistory({ role: 'model', parts: [{ text: clearMsg }] });
}

// FIX: Add the handleModelSelection function definition
async function handleModelSelection() {
    const session = getSession();
    try {
        const { selectedModel } = await inquirer.prompt<{ selectedModel: AvailableModelId }>([
            {
                type: 'list', name: 'selectedModel', message: 'Select AI Model:',
                choices: AVAILABLE_MODELS, default: session.currentModel,
            }
        ]);
        updateSession({ currentModel: selectedModel });
        const successMsg = `AI Model set to: ${selectedModel}`;
        logger.log(chalk.green(successMsg));
        addTurnToHistory({ role: 'model', parts: [{ text: successMsg }] });
    } catch (error: any) {
         logger.error(chalk.red(`Failed to update model selection: ${error.message}`));
         addTurnToHistory({ role: 'model', parts: [{ text: `Error changing model: ${error.message}` }] });
    }
}

function handleHelp() {
    logger.log(chalk.cyanBright('\nAvailable Commands:'));
    let helpText = 'Available Commands:\n';
    for (const [cmd, desc] of Object.entries(SLASH_COMMANDS)) {
        const line = `  ${chalk.yellow(cmd)}: ${desc}`;
        logger.log(line);
        helpText += `  ${cmd}: ${desc}\n`;
    }
    const usageMsg = `\nJust type your request or question directly! Examples:\n` +
                     `  "explain the main loop function in index.ts"\n` +
                     `  "create a react vite app called my-demo"\n` +
                     `  "install chalk using pnpm"\n` +
                     `  "what is node.js?"\n` +
                     `  "read the package.json file"\n` +
                     `  "create a file named 'notes.txt' with content 'Remember to test'"`;
    logger.log(usageMsg);
    helpText += `\nUsage Examples:\n${usageMsg.replace(/\u001b\[.*?m/g, '')}`;

    addTurnToHistory({ role: 'model', parts: [{ text: helpText }] });
}

// --- Start the Application ---
main().catch(error => {
    logger.error(chalk.red("An unexpected critical error occurred in main:"), error);
    process.exit(1);
});