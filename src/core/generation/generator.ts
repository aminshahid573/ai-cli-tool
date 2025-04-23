// src/core/generation/generator.ts
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../../utils/logger.js';
import { type ToolResult } from '../ai/tools.js'; // Import ToolResult

/**
 * Creates a file, optionally with content. Includes parent directories.
 * @param targetPath The relative or absolute path to the file.
 * @param content Optional initial content (defaults to empty string).
 * @returns A ToolResult object indicating success or failure.
 */
export async function createFile(targetPath: string, content: string = ''): Promise<ToolResult> {
    const absolutePath = path.resolve(targetPath); // Resolve relative to cwd
    const dirName = path.dirname(absolutePath);
    logger.info(`Attempting to create file: ${absolutePath}`);

    try {
        // Ensure parent directory exists
        await fs.mkdir(dirName, { recursive: true });
        logger.debug(`Ensured directory exists: ${dirName}`);

        // Write the file (creates if not exist, overwrites if exists)
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
    const absolutePath = path.resolve(targetPath); // Resolve relative to cwd
     logger.info(`Attempting to update file: ${absolutePath}`);
     try {
         // Ensure directory exists first.
         const dirName = path.dirname(absolutePath);
         await fs.mkdir(dirName, { recursive: true });
         logger.debug(`Ensured directory exists: ${dirName}`);

         // Write/overwrite the file
         await fs.writeFile(absolutePath, content, 'utf-8');
         logger.debug(`Updated/Wrote file: ${absolutePath}`);
         return { success: true, output: `File updated successfully at ${absolutePath}` };
     } catch (error: any) {
         logger.error(`Error updating file ${targetPath}: ${error.message}`);
         return { success: false, error: `Failed to update file: ${error.message}` };
     }
 }


// Function used by the manual /create command
export async function createFileOrDirectory(targetPath: string, type: 'file' | 'directory'): Promise<boolean> {
     if (type === 'file') {
         const result = await createFile(targetPath); // Use the new function
         // Log success/failure based on result (optional, as createFile logs)
         return result.success;
     } else {
        // Logic to create only a directory
         const absolutePath = path.resolve(targetPath);
         logger.info(`Attempting to create directory: ${absolutePath}`);
         try {
             await fs.mkdir(absolutePath, { recursive: true });
             logger.debug(`Created directory: ${absolutePath}`);
             return true;
         } catch (error: any) {
              // Check if error is because it already exists (EEXIST) - treat as success?
             if (error.code === 'EEXIST') {
                 logger.warn(`Directory already exists: ${absolutePath}`);
                 return true; // Or false if strict creation is needed
             }
             logger.error(`Error creating directory ${targetPath}: ${error.message}`);
             return false;
         }
     }
}