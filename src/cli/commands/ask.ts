// src/cli/commands/ask.ts
// NOTE: This command might no longer be directly used if all natural language
// processing goes through the main loop in index.ts. Keep for reference or remove.

import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import path from 'path';
import { type Config } from '../../core/config/loader.js';
import { analyzeCodebase, type CodebaseInfo } from '../../core/analysis/parser.js';
import { getAiClient } from '../../core/ai/client.js';
import { logger } from '../../utils/logger.js';
import { getSession } from '../../core/session.js'; // Needed if -m isn't provided
import { type AiToolResponse } from '../../core/ai/adapters/gemini.js'; // Import tool response type

// Function to build a context prompt for the AI (Might be obsolete)
function buildAskPrompt(query: string, codebaseInfo: CodebaseInfo | null, targetPath: string): string {
    // ... (Implementation remains the same as before, but might not be needed) ...
    let context = `The user is asking a question about a software project.`;
    // ... etc ...
    return context;
}


export function registerAskCommand(program: Command, config: Config) {
  program
    .command('ask <query>')
    .description('[DEPRECATED? Use natural language] Ask a question about a codebase')
    .option('-p, --path <directory>', 'Path to the codebase directory', '.')
    .option('-m, --model <model_id>', 'Specify AI model (overrides session/config)')
    .option('--include-content', 'Include file content snippets', false)
    .action(async (query: string, options: { path: string; model?: string; includeContent: boolean }) => {

        logger.warn("The direct '/ask' command might be deprecated. Please try natural language input.");

        const targetPath = path.resolve(options.path);
        logger.info(`Asking query about path: ${targetPath}`);
        const modelToUse = options.model || getSession().currentModel;
        logger.info(`Using AI model: ${modelToUse}`);
         if(options.includeContent){
            logger.warn(chalk.yellowBright(`'--include-content' is enabled.`));
         }

        const analysisSpinner = ora(`Analyzing codebase at ${targetPath}...`).start();
        let codebaseInfo: CodebaseInfo | null = null;
        try {
            codebaseInfo = await analyzeCodebase(targetPath, options.includeContent);
            if (codebaseInfo) {
                analysisSpinner.succeed(`Codebase analysis complete. Found ${codebaseInfo.files.length} relevant files.`);
            } else {
                analysisSpinner.fail(`Codebase analysis failed for ${targetPath}.`);
                 throw new Error(`Codebase analysis failed.`);
            }
        } catch (error: any) {
            analysisSpinner.fail('Codebase analysis failed.');
            logger.error(`Error during analysis: ${error.message}`);
             throw error;
        }

        const aiSpinner = ora('Sending query to AI model...').start();
        try {
            // Use the old prompt builder for this deprecated command
            const prompt = buildAskPrompt(query, codebaseInfo, targetPath);
            logger.debug(`Generated Prompt (ask command):\n---\n${prompt}\n---`);

            const aiClient = getAiClient(config, modelToUse);
            aiSpinner.text = `Querying AI model (${aiClient.getModelId ? aiClient.getModelId() : 'default'})...`;

            // Generate using string prompt
            const responseRaw = await aiClient.generate(prompt);

            // FIX: Handle string | AiToolResponse
            let responseText: string | undefined;
            if (typeof responseRaw === 'string') {
                 responseText = responseRaw;
            } else {
                 responseText = responseRaw.text; // Extract text if object
                 if (responseRaw.functionCall) {
                     logger.warn("Received unexpected function call from direct /ask command.");
                 }
            }

            aiSpinner.succeed('AI response received.');

            if (responseText) {
                logger.aiResponse(responseText); // Use dedicated logger style
            } else {
                 logger.warn("Received empty text response from /ask command.");
            }

        } catch (error: any) {
            aiSpinner.fail('AI query failed.');
            logger.error(`Error during 'ask' command execution: ${error.message}`);
             if (codebaseInfo) {
                 const failedPrompt = buildAskPrompt(query, codebaseInfo, targetPath);
                 logger.debug("Failed prompt details (ask command):\n", failedPrompt);
             }
             throw error;
        }
    });
}