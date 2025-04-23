// src/core/execution/runner.ts
import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';
import ora from 'ora';
import { logger } from '../../utils/logger.js';
// Removed history import - history should be managed by the caller (index.ts)
import { type ToolResult } from '../ai/tools.js'; // Import ToolResult

const execPromise = promisify(exec);

/**
 * Executes a shell command and returns its output/error status.
 * Logs output and errors appropriately.
 * @param command The command string to execute.
 * @returns A promise resolving to a ToolResult object.
 */
export async function executeShellCommandAndGetResult(command: string): Promise<ToolResult> {
    // Use a spinner for user feedback during execution
    const spinner = ora(`Running: ${chalk.cyan(command)}`).start();
    try {
        // Execute command in the current working directory
        const { stdout, stderr } = await execPromise(command, { cwd: process.cwd() });
        spinner.succeed(`Command finished: ${command}`);

        const output = stdout?.trim();
        const errorOutput = stderr?.trim();
        const result: ToolResult = { success: true };

        if (output) {
            logger.log(chalk.gray('Output:\n---\n') + output + chalk.gray('\n---'));
            result.output = output;
        }
        if (errorOutput) {
            // Treat stderr as a warning for the tool result, but log it clearly
            logger.warn(chalk.yellow('Stderr:\n---\n') + errorOutput + chalk.yellow('\n---'));
            result.error = errorOutput; // Include stderr info
        }
        if (!output && !errorOutput) {
            result.output = "(Command executed successfully with no output)";
            logger.log(chalk.gray(result.output));
        }
        return result;

    } catch (error: any) {
        spinner.fail(`Command failed: ${command}`);
        const errorMessage = error.message || 'Unknown execution error';
        const stderr = error.stderr?.trim();
        const stdout = error.stdout?.trim(); // Output captured before the error occurred

        // Log detailed error information
        logger.error(chalk.red(`Execution error: ${errorMessage}`));
        if (stderr) logger.log(chalk.red(`Stderr:\n---\n${stderr}\n---`));
        if (stdout) logger.log(chalk.gray(`Stdout (before error):\n---\n${stdout}\n---`));

        // Construct a comprehensive error message for the tool result
        const fullError = `Error: ${errorMessage}${stderr ? `\nStderr: ${stderr}` : ''}${stdout ? `\nStdout (before error): ${stdout}` : ''}`;

        return { success: false, error: fullError, output: stdout }; // Return stdout before error if available
    }
}