// src/core/generation/generator.ts
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../../utils/logger.js';
import { type ToolResult } from '../ai/tools.js';

/**
 * Creates a file, optionally with content. Includes parent directories.
 * @param targetPath The relative or absolute path to the file.
 * @param content Optional initial content (defaults to empty string).
 * @returns A ToolResult object indicating success or failure.
 */
export async function createFile(targetPath: string, content: string = ''): Promise<ToolResult> {
    const absolutePath = path.resolve(targetPath);
    const dirName = path.dirname(absolutePath);
    logger.info(`Attempting to create file: ${absolutePath}`);
    try {
        await fs.mkdir(dirName, { recursive: true });
        logger.debug(`Ensured directory exists: ${dirName}`);
        await fs.writeFile(absolutePath, content, 'utf-8');
        logger.debug(`Created/Wrote file: ${absolutePath}`);
        return { success: true, output: `File created successfully at ${absolutePath}` };
    } catch (error: any) {
        logger.error(`Error creating file ${targetPath}: ${error.message}`);
        return { success: false, error: `Failed to create file: ${error.message}` };
    }
}

/**
 * Updates/overwrites an existing file with new content. Creates the file if it doesn't exist.
 * @param targetPath The relative or absolute path to the file.
 * @param content The new content for the file.
 * @returns A ToolResult object indicating success or failure.
 */
 export async function updateFile(targetPath: string, content: string): Promise<ToolResult> {
    const absolutePath = path.resolve(targetPath);
     logger.info(`Attempting to update file: ${absolutePath}`);
     try {
         const dirName = path.dirname(absolutePath);
         await fs.mkdir(dirName, { recursive: true });
         logger.debug(`Ensured directory exists: ${dirName}`);
         await fs.writeFile(absolutePath, content, 'utf-8');
         logger.debug(`Updated/Wrote file: ${absolutePath}`);
         return { success: true, output: `File updated successfully at ${absolutePath}` };
     } catch (error: any) {
         logger.error(`Error updating file ${targetPath}: ${error.message}`);
         return { success: false, error: `Failed to update file: ${error.message}` };
     }
 }

 /**
 * Creates a directory, including parent directories.
 * @param targetPath The relative or absolute path to the directory.
 * @returns A ToolResult object indicating success or failure.
 */
export async function createDirectory(targetPath: string): Promise<ToolResult> {
    const absolutePath = path.resolve(targetPath);
    logger.info(`Attempting to create directory: ${absolutePath}`);
    try {
        await fs.mkdir(absolutePath, { recursive: true });
        try {
            const stats = await fs.stat(absolutePath);
            if (stats.isDirectory()) {
                logger.debug(`Directory created or already exists: ${absolutePath}`);
                return { success: true, output: `Directory created successfully at ${absolutePath}` };
            } else {
                throw new Error("Path exists but is not a directory after attempting creation.");
            }
        } catch (statError) {
              throw new Error(`Failed to verify directory after creation attempt: ${statError}`);
        }
    } catch (error: any) {
        logger.error(`Error creating directory ${targetPath}: ${error.message}`);
        return { success: false, error: `Failed to create directory: ${error.message}` };
    }
}

// Function used by the manual /create command (calls newer functions)
export async function createFileOrDirectory(targetPath: string, type: 'file' | 'directory'): Promise<boolean> {
     if (type === 'file') {
         const result = await createFile(targetPath);
         return result.success;
     } else {
         const result = await createDirectory(targetPath);
         return result.success;
     }
}