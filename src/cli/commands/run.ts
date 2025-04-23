// src/cli/commands/run.ts
import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { logger } from '../../utils/logger.js';
// FIX: Import the correct function name
import { executeShellCommandAndGetResult } from '../../core/execution/runner.js';
import { addTurnToHistory } from '../../core/session.js';
import { type ToolResult } from '../../core/ai/tools.js';

export function registerRunCommand(program: Command, config: any) {
    program
        .command('run <command...>') // Capture command and args
        .description('Manually execute a shell command after confirmation.')
        .action(async (commandParts: string[]) => {
            const commandStr = commandParts.join(' ');
            // User turn already added in index.ts before calling this handler

            logger.info(`Manual request to run command: ${chalk.yellow(commandStr)}`);

            try {
                const { confirm } = await inquirer.prompt([
                    {
                        type: 'confirm',
                        name: 'confirm',
                        message: `Do you want to execute this command in your shell?\n  ${chalk.cyan(commandStr)}\n`,
                        default: false, // Default to NO for manual /run safety
                    }
                ]);

                if (confirm) {
                    logger.info('Executing command...');
                    // Add confirmation message to history
                    addTurnToHistory({ role: 'model', parts: [{ text: `Okay, running the command you requested: \`${commandStr}\`` }] });

                    // FIX: Use the function that returns ToolResult
                    const result: ToolResult = await executeShellCommandAndGetResult(commandStr);

                    // Add tool execution result to history (mimics AI tool use flow)
                    // We use 'run_shell_command' as the "tool name" here for consistency
                    addTurnToHistory({
                        role: 'tool',
                        parts: [{ functionResponse: { name: 'run_shell_command', response: result } }]
                    });

                } else {
                    const cancelMsg = 'Command execution cancelled.';
                    logger.log(chalk.yellow(cancelMsg));
                    addTurnToHistory({ role: 'model', parts: [{ text: cancelMsg }] });
                }
            } catch (error: any) {
                 logger.error(`Error during manual run confirmation/execution: ${error.message}`);
                  addTurnToHistory({ role: 'model', parts: [{ text: `Error during /run command: ${error.message}` }] });
            }
        });
}