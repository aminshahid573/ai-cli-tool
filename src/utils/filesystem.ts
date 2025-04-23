// src/utils/filesystem.ts
import fs from 'fs/promises';
import path from 'path';
import { logger } from './logger.js'; // Assuming logger exists

/**
 * Checks if a given path exists and is a directory.
 * @param dirPath The path to check.
 * @returns True if the path exists and is a directory, false otherwise.
 */
export async function directoryExists(dirPath: string): Promise<boolean> {
    try {
        const stats = await fs.stat(path.resolve(dirPath)); // Resolve path
        return stats.isDirectory();
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            return false; // Doesn't exist
        }
        // Log other errors but return false
        logger.error(`Error checking directory existence ${dirPath}: ${error.message}`);
        return false;
    }
}

/**
 * Reads all files in a directory recursively (simple version).
 * Filters based on common source code extensions and ignores common patterns.
 * @param dirPath The directory to read.
 * @param baseDir The original base directory for calculating relative paths.
 * @returns A promise resolving to an array of objects { absolutePath: string, relativePath: string }.
 */
export async function readDirectoryRecursive(dirPath: string, baseDir: string = dirPath): Promise<{ absolutePath: string, relativePath: string }[]> {
    let files: { absolutePath: string, relativePath: string }[] = [];
    const absoluteDirPath = path.resolve(dirPath); // Ensure absolute path

    try {
        const entries = await fs.readdir(absoluteDirPath, { withFileTypes: true });
        for (const entry of entries) {
            const absolutePath = path.join(absoluteDirPath, entry.name);
            const relativePath = path.relative(baseDir, absolutePath);

            // Basic ignore patterns (customize as needed)
            const ignorePatterns = ['node_modules', '.git', 'dist', 'build', '.vscode', '.idea', '.env'];
            if (ignorePatterns.includes(entry.name)) {
                continue;
            }

            if (entry.isDirectory()) {
                files = files.concat(await readDirectoryRecursive(absolutePath, baseDir));
            } else if (entry.isFile()) {
                // Basic filtering for common source code/text files
                const ext = path.extname(entry.name).toLowerCase();
                const allowedExts = ['.js', '.jsx', '.ts', '.tsx', '.py', '.go', '.java', '.cs', '.rb', '.php', '.html', '.css', '.scss', '.json', '.md', '.yaml', '.yml', '.sh', '.bat', '.txt', 'readme'];
                if (allowedExts.includes(ext) || entry.name.toLowerCase() === 'readme') {
                    files.push({ absolutePath, relativePath });
                }
            }
        }
    } catch (error: any) {
        // Log error but allow returning potentially partial results if needed
        logger.error(`Error reading directory ${absoluteDirPath}: ${error.message}`);
        // Depending on desired behavior, you might want to re-throw or return partial results
    }
    return files;
}

/**
 * Reads the content of a file.
 * @param filePath Path to the file (relative or absolute).
 * @returns File content as a string, or null if reading fails.
 */
export async function readFileContent(filePath: string): Promise<string | null> {
    const absolutePath = path.resolve(filePath); // Resolve relative to cwd
    try {
        logger.debug(`Reading file content: ${absolutePath}`);
        return await fs.readFile(absolutePath, 'utf-8');
    } catch (error: any) {
        if (error.code === 'ENOENT') {
             logger.warn(`File not found for reading: ${absolutePath}`);
        } else {
            logger.error(`Error reading file ${absolutePath}: ${error.message}`);
        }
        return null; // Return null on any read error
    }
}