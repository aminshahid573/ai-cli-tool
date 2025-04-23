// src/core/analysis/parser.ts
import fs from 'fs/promises'; // Need fs here too
import path from 'path';
// Assuming these exist and work based on previous steps
import { readDirectoryRecursive, readFileContent } from '../../utils/filesystem.js';
import { logger } from '../../utils/logger.js';

export interface CodeFileInfo {
    absolutePath: string;
    relativePath: string;
    content?: string; // Optional content
}

export interface CodebaseInfo {
    basePath: string;
    files: CodeFileInfo[];
}

/**
 * Analyzes a codebase directory. Handles non-existent or non-directory paths.
 * Retrieves a list of source files.
 *
 * @param basePath The root directory of the codebase to analyze.
 * @param includeContent Whether to include the content of the files. Default: false.
 * @returns A promise resolving to CodebaseInfo or null if the path is invalid/inaccessible.
 */
export async function analyzeCodebase(basePath: string, includeContent: boolean = false): Promise<CodebaseInfo | null> {
    const absolutePath = path.resolve(basePath); // Ensure absolute path relative to cwd

    // --- Check Path Validity and Accessibility ---
    try {
        await fs.access(absolutePath); // Check existence and permissions
        const stats = await fs.stat(absolutePath);
        if (!stats.isDirectory()) {
            logger.warn(`Analysis target path is not a directory: ${absolutePath}`);
            return null;
        }
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            logger.warn(`Analysis target path does not exist: ${absolutePath}`);
        } else if (error.code === 'EACCES') {
             logger.warn(`Permission denied accessing analysis target: ${absolutePath}`);
        } else {
             logger.error(`Error accessing analysis target ${absolutePath}: ${error.message}`);
        }
        return null; // Path doesn't exist or is inaccessible
    }

    // --- Proceed with Reading Directory ---
    logger.debug(`Starting analysis of codebase at: ${absolutePath}`);
    try {
        // Use the utility function to get file list
        const fileList = await readDirectoryRecursive(absolutePath, absolutePath); // Pass absolute path

        let filesWithContentIfNeeded: CodeFileInfo[] = fileList.map(f => ({ ...f, content: undefined }));

        if (includeContent && fileList.length > 0) {
            logger.debug(`Reading content for ${fileList.length} files...`);
            filesWithContentIfNeeded = []; // Reset array
            const MAX_CONTENT_FILES = 10; // Limit number of files to read content from
            let contentReadCount = 0;

            for (const fileInfo of fileList) {
                 // Add file info even if content isn't read
                 let fileData: CodeFileInfo = { ...fileInfo, content: undefined };

                if(contentReadCount < MAX_CONTENT_FILES) {
                    const content = await readFileContent(fileInfo.absolutePath); // Use utility
                    if (content !== null) {
                        const MAX_CONTENT_LENGTH = 5000; // Limit length per file
                        const truncatedContent = content.length > MAX_CONTENT_LENGTH ? content.substring(0, MAX_CONTENT_LENGTH) + "\n... (truncated)" : content;
                        fileData.content = truncatedContent;
                        contentReadCount++;
                    }
                     // Keep fileData even if content is null (read failed)
                }
                 filesWithContentIfNeeded.push(fileData);
            }
            logger.debug(`Finished reading content for ${contentReadCount} files (limited to ${MAX_CONTENT_FILES}).`);

        } else {
            logger.debug(`Analysis found ${fileList.length} files (content not read).`);
        }

        // Return info, even if fileList is empty (valid empty directory)
        return { basePath: absolutePath, files: filesWithContentIfNeeded };

    } catch (readError: any) {
        // This catch might be redundant if readDirectoryRecursive handles its own errors,
        // but keep it as a safeguard.
        logger.error(`Error during recursive directory read for ${absolutePath}: ${readError.message}`);
        // Return structure indicating analysis failed during read
        return { basePath: absolutePath, files: [] };
    }
}