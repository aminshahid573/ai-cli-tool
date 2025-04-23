// src/core/execution/runner.ts
import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import { logger } from '../../utils/logger.js';
import { type ToolResult } from '../ai/tools.js';

const execPromise = promisify(exec);

/**
 * Executes a shell command and returns its output/error status.
 * Logs output and errors appropriately.
 * @param command The command string to execute.
 * @param relativeCwd Optional relative path for the command's working directory.
 * @returns A promise resolving to a ToolResult object.
 */
export async function executeShellCommandAndGetResult(command: string, relativeCwd?: string): Promise<ToolResult> {
    const executionCwd = relativeCwd ? path.resolve(process.cwd(), relativeCwd) : process.cwd();
    const displayCwd = relativeCwd ? `./${relativeCwd}` : '.'

    logger.debug(`Attempting to run command in directory: ${executionCwd}`);
    const spinner = ora(`Running: ${chalk.cyan(command)} in ${chalk.magenta(displayCwd)}`).start();

    try {
        const { stdout, stderr } = await execPromise(command, { cwd: executionCwd });
        spinner.succeed(`Command finished: ${command} in ${displayCwd}`);

        const output = stdout?.trim();
        const errorOutput = stderr?.trim();
        const result: ToolResult = { success: true };

        if (output) {
            logger.log(chalk.gray('Output:\n---\n') + output + chalk.gray('\n---'));
            result.output = output;
        }
        if (errorOutput) {
            logger.warn(chalk.yellow('Stderr:\n---\n') + errorOutput + chalk.yellow('\n---'));
            result.error = errorOutput;
        }
        if (!output && !errorOutput) {
            result.output = "(Command executed successfully with no output)";
            logger.log(chalk.gray(result.output));
        }
        return result;

    } catch (error: any) {
        spinner.fail(`Command failed: ${command} in ${displayCwd}`);
        const errorMessage = error.message || 'Unknown execution error';
        const stderr = error.stderr?.trim();
        const stdout = error.stdout?.trim();

        logger.error(chalk.red(`Execution error: ${errorMessage}`));
        if (stderr) logger.log(chalk.red(`Stderr:\n---\n${stderr}\n---`));
        if (stdout) logger.log(chalk.gray(`Stdout (before error):\n---\n${stdout}\n---`));

        const fullError = `Error: ${errorMessage}${stderr ? `\nStderr: ${stderr}` : ''}${stdout ? `\nStdout (before error): ${stdout}` : ''}`;

        return { success: false, error: fullError, output: stdout };
    }
}