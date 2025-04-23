#!/usr/bin/env node
import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import ora from 'ora';

import { loadConfig, type Config } from '../core/config/loader.js';
// import { registerAskCommand } from './commands/ask.js'; // Removed
import { registerCreateCommand } from './commands/create.js';
import { registerRunCommand } from './commands/run.js';
import { logger } from '../utils/logger.js';
import {
    initializeSession,
    getSession,
    updateSession,
    addTurnToHistory,
    clearHistory,
    AVAILABLE_MODELS,
    isValidModelId,
    type AvailableModelId,
    type SessionState,
    type ConversationTurn,
    // FIX: Import exported types
    type TextPart,
    type FunctionCallPart,
    type FunctionResponsePart
} from '../core/session.js';
import { getAiClient } from '../core/ai/client.js';
import { analyzeCodebase, type CodebaseInfo } from '../core/analysis/parser.js';
// FIX: Import the correct function from runner
import { executeShellCommandAndGetResult } from '../core/execution/runner.js';
import { availableTools, geminiToolConfig, type ToolName, type ToolResult } from '../core/ai/tools.js';
import { type AiToolResponse } from '../core/ai/adapters/gemini.js';

// --- Setup Package Info & Config ---
let pkg: { version: string; name?: string; description?: string };
let config: Config;
// ... (Loading pkg and config - code remains the same) ...
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

// --- Define Intents (Example) ---
type UserIntent =
    | 'general_chat' | 'code_query' | 'file_create' | 'directory_create'
    | 'command_run' | 'task_execute_command' | 'project_scaffold' | 'unknown';

// --- Define Slash Commands (Reduced) ---
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
    registerRunCommand(program, config); // Register the manual run command

    logger.log(chalk.cyanBright(`\nWelcome to AI CLI v${pkg.version}!`));
    logger.log(`Ask questions, give tasks (like "create react app"), or use ${chalk.yellow('/help')}.`);

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
                    // FIX: Add handleModelSelection back
                    case '/model': await handleModelSelection(); break;
                    case '/create': await handleManualCreateCommand(program, args); break;
                    case '/run': await handleManualRunCommand(program, args); break; // Keep manual run
                    case '/history': handleShowHistory(); break;
                    case '/clear': handleClearHistory(); break;
                    default:
                        const errorMsg = `Unknown command: ${command}. Type ${chalk.yellow('/help')} for options.`;
                        logger.error(chalk.red(errorMsg));
                        addTurnToHistory({ role: 'model', parts: [{ text: errorMsg }] });
                }
            } else {
                logger.info(`Processing: "${trimmedInput}"...`);
                await handleNaturalLanguageInput(program, trimmedInput);
            }

        } catch (error: any) {
             if (error.code === 'commander.exit') {
                logger.debug(`Commander exit override caught (Code: ${error.exitCode}).`);
             } else if (error.isTtyError) {
                logger.error(chalk.red("Interactive prompt failed: Unsupported terminal environment."));
             } else {
                logger.error(chalk.red(`Loop Error:`), error.message);
                logger.debug(error);
             }
        }
        logger.log(''); // Spacing
    }
}

// --- Intent Classification & Natural Language Handling ---

async function classifyIntent(userInput: string): Promise<UserIntent> {
    const spinner = ora('Understanding request...').start();
    try {
        const session = getSession();
        const aiClient = getAiClient(config, 'gemini-1.5-flash-latest');

        const historySummary = session.history.slice(-4).map(turn => {
             const part = turn.parts[0];
             let text = "[non-text part]";
             // FIX: Use type guards for safe access
             if ('text' in part && typeof part.text === 'string') {
                 text = part.text;
                 if (text.length > 100) text = text.substring(0, 100) + '...'; // Correct length check
             } else if ('functionCall' in part) {
                 text = `[functionCall: ${part.functionCall.name}]`;
             } else if ('functionResponse' in part) {
                  text = `[functionResponse: ${part.functionResponse.name}]`;
             }
            return `${turn.role}: ${text}`;
        }).join('\n');


        const classificationPrompt = `You are an intent classifier... Intent:`; // Prompt content omitted for brevity

        const classificationResultRaw = await aiClient.generate(classificationPrompt);
        spinner.stop();

        // FIX: Handle string | AiToolResponse and access .text safely
        let classificationResultText: string | undefined;
        if (typeof classificationResultRaw === 'string') {
            classificationResultText = classificationResultRaw;
        } else if (classificationResultRaw && typeof classificationResultRaw === 'object' && 'text' in classificationResultRaw) {
            classificationResultText = classificationResultRaw.text;
        }

        if (!classificationResultText) {
            logger.warn(`Classification returned no text. Defaulting to general_chat.`);
            return 'general_chat';
        }

        // FIX: Apply trim/lower/split only if classificationResultText is not undefined
        const intent = classificationResultText.trim().toLowerCase().split('\n')[0] as UserIntent;
        logger.debug(`Classified intent: ${intent}`);

        const validIntents: UserIntent[] = ['general_chat', 'code_query', 'file_create', 'directory_create', 'task_execute_command', 'project_scaffold', 'unknown'];
        if (validIntents.includes(intent)) {
            return intent;
        }
        logger.warn(`Unknown classification result: ${classificationResultText}. Defaulting to general_chat.`);
        return 'general_chat';

    } catch (error: any) {
        spinner.fail('Intent classification failed.');
        logger.error(`Error during classification: ${error.message}`);
        return 'general_chat';
    }
}

// --- REVISED handleNaturalLanguageInput with Tool Loop ---
async function handleNaturalLanguageInput(program: Command, userInput: string) {
    logger.debug(`Entering tool loop for input: "${userInput}"`);
    const session = getSession();

    const MAX_TOOL_ITERATIONS = 5;
    let iterations = 0;

    while (iterations < MAX_TOOL_ITERATIONS) {
        iterations++;
        logger.debug(`Tool loop iteration ${iterations}`);

        const historyForAI = [...session.history];
        const aiSpinner = ora(`AI Processing (Iteration ${iterations})...`).start();
        let aiResponseRaw: string | AiToolResponse; // Use Raw suffix for clarity

        try {
            const aiClient = getAiClient(config, session.currentModel);
            aiSpinner.text = `Sending to ${session.currentModel} (Iteration ${iterations})...`;
            aiResponseRaw = await aiClient.generate(historyForAI); // Expecting string | AiToolResponse
            aiSpinner.stop();

        } catch (error: any) {
            aiSpinner.fail('AI query failed.');
            const errorMsg = `Error interacting with AI: ${error.message}`;
            logger.error(errorMsg);
            addTurnToHistory({ role: 'model', parts: [{ text: `Sorry, encountered an AI error: ${error.message}` }] });
            break;
        }

        // --- Process AI Response ---
        let responseText: string | undefined = undefined;
        let functionCall: AiToolResponse['functionCall'] | undefined = undefined;

        // FIX: Safely extract text and function call
        if (typeof aiResponseRaw === 'string') {
            responseText = aiResponseRaw;
             logger.warn("AI returned plain string unexpectedly during tool use flow.");
        } else if (aiResponseRaw && typeof aiResponseRaw === 'object') {
             responseText = aiResponseRaw.text;
             functionCall = aiResponseRaw.functionCall;
        }

        const trimmedResponseText = responseText?.trim();
        if (trimmedResponseText) {
            logger.aiResponse(trimmedResponseText);
            // FIX: Ensure text part is added correctly
            addTurnToHistory({ role: 'model', parts: [{ text: trimmedResponseText }] });
        }

        if (functionCall) {
             const toolName = functionCall.name as ToolName;
             const toolArgs = functionCall.args ?? {};

             logger.info(`AI requested tool: ${chalk.yellow(toolName)} with args:`, toolArgs);

            addTurnToHistory({
                role: 'model',
                 parts: [{ functionCall: { name: toolName, args: toolArgs } }]
             });

            const toolToExecute = availableTools[toolName];
            if (toolToExecute) {
                let confirm = false;
                const requiresConfirmation = ['run_shell_command', 'create_file', 'update_file'];
                const commandDesc = toolName === 'run_shell_command' ? toolArgs.command : JSON.stringify(toolArgs);

                if (requiresConfirmation.includes(toolName)) {
                     logger.log('');
                     const confirmResult = await inquirer.prompt([ {
                         type: 'confirm', name: 'confirm',
                         message: `AI wants to run ${chalk.yellow(toolName)}. Proceed?\n  Details: ${chalk.cyan(commandDesc)}\n`,
                         default: true,
                     }]);
                     confirm = confirmResult.confirm;
                     logger.log('');
                 } else {
                    confirm = true;
                 }

                 if (confirm) {
                     const toolSpinner = ora(`Executing tool: ${toolName}...`).start();
                     let toolResult: ToolResult;
                     try {
                         // FIX: Cast toolArgs to 'any' to resolve complex type mismatch for now
                         toolResult = await toolToExecute.function(toolArgs as any);
                         toolSpinner.succeed(`Tool ${toolName} executed.`);
                     } catch (execError: any) {
                         toolSpinner.fail(`Tool ${toolName} failed during execution.`);
                         logger.error(`Tool execution error: ${execError.message}`);
                         toolResult = { success: false, error: `Tool function threw error: ${execError.message}` };
                     }

                     logger.debug("Tool Result:", toolResult);

                     addTurnToHistory({
                         role: 'tool', // Use 'tool' role for Function Response parts for Gemini
                         parts: [{ functionResponse: { name: toolName, response: toolResult } }]
                     });

                     if (!toolResult.success) {
                         logger.error(`Tool ${toolName} reported failure: ${toolResult.error}`);
                     }

                 } else {
                     logger.log(chalk.yellow('Tool execution cancelled by user.'));
                      addTurnToHistory({
                         role: 'tool',
                         parts: [{ functionResponse: { name: toolName, response: { success: false, error: 'User cancelled execution.' } } }]
                     });
                     break;
                 }
            } else {
                logger.error(`AI requested unknown tool: ${toolName}`);
                 addTurnToHistory({
                     role: 'tool',
                     parts: [{ functionResponse: { name: toolName, response: { success: false, error: `Unknown tool requested: ${toolName}` } } }]
                 });
                break;
            }
        } else {
            logger.debug("AI finished or provided text only. Exiting tool loop.");
            break;
        }
    } // End while loop

    if (iterations >= MAX_TOOL_ITERATIONS) {
         logger.warn("Reached maximum tool execution iterations.");
         addTurnToHistory({ role: 'model', parts: [{ text: "Reached maximum steps for this task. Please start a new request if needed." }] });
    }
} // End handleNaturalLanguageInput


// --- Specific Intent Handlers (Simplified - most logic is now in the tool loop) ---

async function handleGreeting(userInput: string) {
    const greetingResponse = `👋 Hello there! I'm AI CLI v${pkg.version}. Ready for your requests!`;
    logger.log(chalk.magenta(greetingResponse));
    addTurnToHistory({ role: 'model', parts: [{ text: greetingResponse }] });
}

// --- Manual Command Handlers (/create, /run) ---

async function handleManualCreateCommand(program: Command, args: string[]) {
    // ... (code remains the same) ...
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
    // This handler still calls the registered 'run' command from run.ts
     if (args.length === 0) {
        const errorMsg = 'Usage: /run <command_to_execute...>';
        logger.error(chalk.red(errorMsg));
        addTurnToHistory({ role: 'model', parts: [{ text: `Missing command. ${errorMsg}` }] });
        return;
    }
    const cmdArgs = ['run', ...args]; // Command name 'run' + arguments
    logger.debug('Executing manual run command programmatically:', cmdArgs);
    try {
        // Let Commander parse the 'run' command and its arguments
        await program.parseAsync(cmdArgs, { from: 'user' });
         // The action defined in run.ts will handle confirmation and execution
    } catch (error: any) {
         logger.error(chalk.red(`Error executing '/run' command logic: ${error.message}`), error);
         addTurnToHistory({ role: 'model', parts: [{ text: `Sorry, I failed to execute the run command: ${error.message}` }] });
    }
}


// --- History Handlers ---
function handleShowHistory() {
    const session = getSession();
    logger.log(chalk.cyanBright('\n--- Conversation History ---'));
    if (session.history.length === 0) {
        logger.log(chalk.gray('(No history yet)'));
    } else {
        session.history.forEach((turn) => {
            let prefix = '';
            let contentStr = '';
            const part = turn.parts[0]; // Assume single part for now for simplicity in logging

            switch (turn.role) {
                case 'user': prefix = chalk.blue('You:'); break;
                case 'model': prefix = chalk.green('AI:'); break;
                case 'tool': prefix = chalk.yellow(`Tool Result `); break;
                default: prefix = chalk.red(`${turn.role}:`);
            }

            try {
                 // FIX: Use type guards for safe access
                 if ('text' in part) {
                     contentStr = part.text;
                 } else if ('functionCall' in part) {
                     prefix = chalk.green('AI -> Tool:'); // Change prefix for clarity
                     contentStr = chalk.magenta(`Call: ${part.functionCall.name}(${JSON.stringify(part.functionCall.args)})`);
                 } else if ('functionResponse' in part) {
                     const resp = part.functionResponse.response;
                     prefix = chalk.yellow(`Tool Result (${part.functionResponse.name}):`); // Add tool name
                     contentStr = `${resp.success ? chalk.green('Success') : chalk.red('Failed')}${resp.output ? ` | Output: ${resp.output.substring(0,150)}...` : ''}${resp.error ? ` | Error: ${resp.error}` : ''}`;
                 } else {
                     contentStr = '[Unknown Part Type]';
                 }
            } catch (e) { contentStr = '[Error formatting history part]'; }

            logger.log(`${prefix} ${contentStr}`);
        });
        logger.log(chalk.cyanBright('--- End of History ---'));
    }
}

function handleClearHistory() { /* ... (remains the same) ... */ }
// --- FIX: Add missing handleModelSelection function ---
async function handleModelSelection() {
    const session = getSession();
    try {
        const { selectedModel } = await inquirer.prompt<{ selectedModel: AvailableModelId }>([
            {
                type: 'list',
                name: 'selectedModel',
                message: 'Select AI Model:',
                choices: AVAILABLE_MODELS,
                default: session.currentModel,
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


function handleHelp() { /* ... (remains the same) ... */ }

// --- Start the Application ---
main().catch(error => {
    logger.error(chalk.red("An unexpected critical error occurred in main:"), error);
    process.exit(1);
});