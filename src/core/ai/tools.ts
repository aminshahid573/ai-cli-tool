// src/core/ai/tools.ts
import {
    FunctionDeclaration,
    FunctionDeclarationSchemaType,
    FunctionDeclarationsTool,
    HarmCategory,
    HarmBlockThreshold
} from "@google/generative-ai";
import { logger } from "../../utils/logger.js";

// Define the structure for tool execution results
export interface ToolResult {
    output?: string;
    error?: string;
    success: boolean;
}

// Define the available tools the AI can call
export const availableTools = {
    run_shell_command: {
        function: async (args: { command: string; cwd?: string }): Promise<ToolResult> => {
            logger.debug("Executing tool: run_shell_command", args);
            if (!args.command) return { success: false, error: "Missing 'command' argument." };
            const { executeShellCommandAndGetResult } = await import('../execution/runner.js');
            return await executeShellCommandAndGetResult(args.command, args.cwd);
        },
        declaration: {
            name: "run_shell_command",
            description: "Executes a non-interactive shell command. Use for installations(npm, pnpm, yarn), running build scripts, version control(git), listing files(ls, dir), etc. Optionally specify a 'cwd' (current working directory) relative to the main project root where the command should run. Cannot be used for commands requiring user interaction.",
            parameters: {
                type: FunctionDeclarationSchemaType.OBJECT,
                properties: {
                    command: {
                        type: FunctionDeclarationSchemaType.STRING,
                        description: "The exact, non-interactive shell command to execute (e.g., 'npm install express', 'git status').",
                    },
                    cwd: {
                        type: FunctionDeclarationSchemaType.STRING,
                        description: "Optional: The relative path from the main project root to the directory where the command should be executed (e.g., './new-project'). Defaults to the main project root if omitted.",
                        nullable: true
                    },
                },
                required: ["command"],
            },
        } as FunctionDeclaration
    },
    create_directory: {
        function: async (args: { path: string }): Promise<ToolResult> => {
            logger.debug("Executing tool: create_directory", args);
             if (!args.path) return { success: false, error: "Missing 'path' argument." };
            const { createDirectory } = await import('../generation/generator.js');
            return await createDirectory(args.path);
        },
        declaration: {
            name: "create_directory",
            description: "Creates a new directory (including parent directories if needed) at the specified path.",
            parameters: {
                type: FunctionDeclarationSchemaType.OBJECT,
                properties: {
                    path: {
                        type: FunctionDeclarationSchemaType.STRING,
                        description: "The relative (to current dir) or absolute path of the directory to create.",
                    },
                },
                required: ["path"],
            },
        } as FunctionDeclaration
    },
    create_file: {
        function: async (args: { path: string; content?: string }): Promise<ToolResult> => {
            logger.debug("Executing tool: create_file", args);
            if (!args.path) return { success: false, error: "Missing 'path' argument." };
            const { createFile } = await import('../generation/generator.js');
            return await createFile(args.path, args.content);
        },
        declaration: {
            name: "create_file",
            description: "Creates a new file at the specified path, optionally with initial content. Creates parent directories if needed. Overwrites the file if it already exists.",
            parameters: {
                type: FunctionDeclarationSchemaType.OBJECT,
                properties: {
                    path: {
                        type: FunctionDeclarationSchemaType.STRING,
                        description: "The relative (to current dir) or absolute path where the file should be created.",
                    },
                    content: {
                        type: FunctionDeclarationSchemaType.STRING,
                        description: "Optional: The initial text content to write into the file. Use newline characters (\\n) for line breaks.",
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
        declaration: {
            name: "update_file",
            description: "Updates/overwrites the entire content of a file at the specified path. Creates the file if it doesn't exist. Use carefully. Use newline characters (\\n) for line breaks in content.",
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
     delete_file: {
         function: async (args: { path: string }): Promise<ToolResult> => {
             logger.debug("Executing tool: delete_file", args);
             if (!args.path) return { success: false, error: "Missing 'path' argument." };
             // Prefer dedicated fs function if available, otherwise use shell command
             const { deleteFile } = await import('../../utils/filesystem.js'); // Assume this exists now
             if (deleteFile) {
                 return await deleteFile(args.path);
             } else {
                 // Fallback using shell command (less robust)
                 const command = process.platform === "win32" ? `del /F /Q "${args.path}"` : `rm -f "${args.path}"`;
                 logger.warn(`Using shell command for deletion: ${command}`);
                 const { executeShellCommandAndGetResult } = await import('../execution/runner.js');
                 return await executeShellCommandAndGetResult(command);
             }
         },
         declaration: {
             name: "delete_file",
             description: "Deletes a single file at the specified path. Use with extreme caution.",
             parameters: {
                 type: FunctionDeclarationSchemaType.OBJECT,
                 properties: {
                     path: { type: FunctionDeclarationSchemaType.STRING, description: "The relative (to current dir) or absolute path of the file to delete." },
                 },
                 required: ["path"],
             },
         } as FunctionDeclaration
     },
};

// Prepare the tool configuration for the Gemini API
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