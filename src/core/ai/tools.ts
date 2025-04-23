// src/core/ai/tools.ts
import {
    FunctionDeclaration, // Use FunctionDeclaration type for the array items
    FunctionDeclarationSchemaType,
    FunctionDeclarationsTool,
    HarmCategory,
    HarmBlockThreshold
} from "@google/generative-ai";
import { logger } from "../../utils/logger.js";

// Define the structure for our tool functions' execution results
export interface ToolResult {
    output?: string;
    error?: string;
    success: boolean;
}

// Define the available tools the AI can call
export const availableTools = {
    run_shell_command: {
        function: async (args: { command: string }): Promise<ToolResult> => {
            logger.debug("Executing tool: run_shell_command", args);
            if (!args.command) return { success: false, error: "Missing 'command' argument." };
            const { executeShellCommandAndGetResult } = await import('../execution/runner.js');
            return await executeShellCommandAndGetResult(args.command);
        },
        // FIX: Ensure this structure matches FunctionDeclaration
        declaration: {
            name: "run_shell_command",
            description: "Executes a shell command in the current working directory. Use for installations, running build scripts, version control(git), listing files(ls, dir), etc. Cannot be used for interactive commands.",
            parameters: {
                type: FunctionDeclarationSchemaType.OBJECT,
                properties: {
                    command: {
                        type: FunctionDeclarationSchemaType.STRING,
                        description: "The exact, non-interactive shell command to execute.",
                    },
                },
                required: ["command"],
            },
        } as FunctionDeclaration // Cast to the correct type
    },
    create_file: {
        function: async (args: { path: string; content?: string }): Promise<ToolResult> => {
            logger.debug("Executing tool: create_file", args);
            if (!args.path) return { success: false, error: "Missing 'path' argument." };
            const { createFile } = await import('../generation/generator.js');
            return await createFile(args.path, args.content);
        },
        // FIX: Ensure this structure matches FunctionDeclaration
        declaration: {
            name: "create_file",
            description: "Creates a new file at the specified path, optionally with initial content. Creates parent directories if needed. Use for creating source files, config files etc.",
            parameters: {
                type: FunctionDeclarationSchemaType.OBJECT,
                properties: {
                    path: {
                        type: FunctionDeclarationSchemaType.STRING,
                        description: "The relative (to current dir) or absolute path where the file should be created.",
                    },
                    content: {
                        type: FunctionDeclarationSchemaType.STRING,
                        description: "Optional: The initial text content to write into the file.",
                    },
                },
                required: ["path"],
            },
        } as FunctionDeclaration
    },
    read_file: {
        function: async (args: { path: string }): Promise<ToolResult> => {
            logger.debug("Executing tool: read_file", args);
             if (!args.path) return { success: false, error: "Missing 'path' argument." };
             const { readFileContent } = await import('../../utils/filesystem.js');
             const content = await readFileContent(args.path);
             if (content === null) {
                 return { success: false, error: `Failed to read file or file not found: ${args.path}` };
             }
             const MAX_READ_LENGTH = 5000;
             const truncatedContent = content.length > MAX_READ_LENGTH ? content.substring(0, MAX_READ_LENGTH) + "\n... (truncated)" : content;
             return { success: true, output: truncatedContent };
        },
        // FIX: Ensure this structure matches FunctionDeclaration
        declaration: {
            name: "read_file",
            description: "Reads the content of an existing file at the specified path. Returns the content or an error.",
            parameters: {
                type: FunctionDeclarationSchemaType.OBJECT,
                properties: {
                    path: { type: FunctionDeclarationSchemaType.STRING, description: "The relative (to current dir) or absolute path of the file to read." },
                },
                required: ["path"],
            },
        } as FunctionDeclaration
    },
    update_file: {
         function: async (args: { path: string; content: string }): Promise<ToolResult> => {
            logger.debug("Executing tool: update_file", args);
            if (!args.path) return { success: false, error: "Missing 'path' argument." };
            if (args.content === undefined || args.content === null) return { success: false, error: "Missing 'content' argument for update." };
            const { updateFile } = await import('../generation/generator.js');
            return await updateFile(args.path, args.content);
         },
        // FIX: Ensure this structure matches FunctionDeclaration
        declaration: {
            name: "update_file",
            description: "Updates/overwrites the entire content of a file at the specified path. Creates the file if it doesn't exist. Use carefully.",
            parameters: {
                type: FunctionDeclarationSchemaType.OBJECT,
                properties: {
                    path: { type: FunctionDeclarationSchemaType.STRING, description: "The relative (to current dir) or absolute path of the file to update." },
                    content: { type: FunctionDeclarationSchemaType.STRING, description: "The new text content for the file." },
                },
                required: ["path", "content"],
            },
        } as FunctionDeclaration
    },
};

// Prepare the tool configuration for the Gemini API
// FIX: Map the 'declaration' property which matches FunctionDeclaration
export const geminiToolConfig: FunctionDeclarationsTool = {
    functionDeclarations: Object.values(availableTools).map(tool => tool.declaration),
};

// Type helper for tool names
export type ToolName = keyof typeof availableTools;

// Define common safety settings for Gemini
export const defaultSafetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];