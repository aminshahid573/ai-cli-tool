// src/cli/commands/create.ts
import { Command } from 'commander';
import chalk from 'chalk';
import { logger } from '../../utils/logger.js';
// Use the boolean returning function for the simple manual command
import { createFileOrDirectory } from '../../core/generation/generator.js';
import { addTurnToHistory } from '../../core/session.js';

export function registerCreateCommand(program: Command, config: any) {
    // Main 'create' command (acts as namespace)
    const createCmd = program.command('create')
        .description('Manually create files or directories.');

    // Subcommand 'file'
    createCmd
        .command('file <filepath>')
        .description('Create an empty file (including parent directories if needed).')
        .action(async (filepath: string) => {
             // User turn already added in index.ts before calling this handler
             logger.info(`Attempting to create file via /create: ${filepath}`);

             const success = await createFileOrDirectory(filepath, 'file');

             if (success) {
                 const successMsg = `Successfully created file: ${filepath}`;
                 logger.log(chalk.green(successMsg));
                 // Add model confirmation to history
                 addTurnToHistory({ role: 'model', parts: [{ text: `Okay, I created the file: ${filepath}` }] });
             } else {
                 const errorMsg = `Failed to create file: ${filepath}`;
                 logger.error(chalk.red(errorMsg));
                 // Add model error message to history
                 addTurnToHistory({ role: 'model', parts: [{ text: `Sorry, I couldn't create the file: ${filepath}` }] });
             }
        });

    // Subcommand 'directory'
    createCmd
        .command('directory <dirpath>')
        .alias('dir')
        .description('Create a directory (including parent directories if needed).')
        .action(async (dirpath: string) => {
             // User turn already added in index.ts
             logger.info(`Attempting to create directory via /create: ${dirpath}`);

             const success = await createFileOrDirectory(dirpath, 'directory');

             if (success) {
                 const successMsg = `Successfully created directory: ${dirpath}`;
                 logger.log(chalk.green(successMsg));
                 addTurnToHistory({ role: 'model', parts: [{ text: `Okay, I created the directory: ${dirpath}` }] });
             } else {
                 const errorMsg = `Failed to create directory: ${dirpath}`;
                 logger.error(chalk.red(errorMsg));
                  addTurnToHistory({ role: 'model', parts: [{ text: `Sorry, I couldn't create the directory: ${dirpath}` }] });
             }
        });
}