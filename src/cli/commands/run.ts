// src/cli/commands/run.ts
import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { logger } from '../../utils/logger.js';
import { executeShellCommandAndGetResult } from '../../core/execution/runner.js'; // Correct import
import { addTurnToHistory } from '../../core/session.js';
import { type ToolResult } from '../../core/ai/tools.js';

export function registerRunCommand(program: Command, config: any) {
    program
        .command('run <command...>')
        .description('Manually execute a shell command after confirmation.')
        .action(async (commandParts: string[]) => {
            const commandStr = commandParts.join(' ');
            // User turn for /run already added in index.ts

            logger.info(`Manual request to run command: ${chalk.yellow(commandStr)}`);

            try {
                const { confirm } = await inquirer.prompt([
                    {
                        type: 'confirm', name: 'confirm',
                        message: `Do you want to execute this command in your shell?\n  ${chalk.cyan(commandStr)}\n`,
                        default: false, // Default to NO for manual /run safety
                    }
                ]);

                if (confirm) {
                    logger.info('Executing command...');
                    // Add confirmation message to history
                    addTurnToHistory({ role: 'model', parts: [{ text: `Okay, running the command you requested: \`${commandStr}\`` }] });

                    const result: ToolResult = await executeShellCommandAndGetResult(commandStr);

                    // Add tool execution result to history using 'tool' role
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