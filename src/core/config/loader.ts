import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../../utils/logger.js'; // Adjust path as necessary

// Define the structure of our config file
export interface Config {
  defaultModel: string;
  apiKeyEnvVar: string; // Environment variable name for the API key
  cache: {
    enabled: boolean;
    ttl: number; // Time-to-live in seconds
  };
  output: {
    colors: boolean;
  };
  // Allow any other properties potentially added later
  [key: string]: any;
}

// Find project root (assuming package.json is in the root)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Navigate up levels from src/core/config to find the root
const projectRoot = path.resolve(__dirname, '../../../');

const configFilePath = path.join(projectRoot, '.ai-cli-config.json');
const envFilePath = path.join(projectRoot, '.env');

const defaultConfig: Config = {
  defaultModel: 'gemini-1.5-flash-latest',
  apiKeyEnvVar: 'GEMINI_API_KEY',
  cache: {
    enabled: true,
    ttl: 3600,
  },
  output: {
    colors: true,
  },
};

let loadedConfig: Config | null = null;

export async function loadConfig(): Promise<Config> {
  if (loadedConfig) {
    return loadedConfig;
  }

  // Load .env file first
  dotenv.config({ path: envFilePath });

  let userConfig: Partial<Config> = {};
  try {
    const configFileContent = await fs.readFile(configFilePath, 'utf-8');
    userConfig = JSON.parse(configFileContent);
    logger.debug(`Loaded user config from ${configFilePath}`);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      logger.warn(
        `.ai-cli-config.json not found at ${projectRoot}. Using default configuration.`
      );
      // Optional: Create a default config file if it doesn't exist
      // try {
      //   await fs.writeFile(configFilePath, JSON.stringify(defaultConfig, null, 2));
      //   logger.info(`Created default config file at ${configFilePath}`);
      // } catch (writeError) {
      //   logger.error(`Failed to create default config file: ${writeError}`);
      // }
    } else {
      logger.error(`Error reading config file ${configFilePath}: ${error.message}`);
      // Proceed with defaults even if parsing fails
    }
  }

  // Merge default config with user config
  loadedConfig = {
    ...defaultConfig,
    ...userConfig,
    // Ensure nested objects are merged correctly
    cache: { ...defaultConfig.cache, ...userConfig.cache },
    output: { ...defaultConfig.output, ...userConfig.output },
  };

  logger.debug('Final loaded configuration:', loadedConfig);
  return loadedConfig;
}

/**
 * Gets the API key from the environment variable specified in the config.
 * @param config The loaded configuration object.
 * @returns The API key string or undefined if not found.
 */
export function getApiKey(config: Config): string | undefined {
    const apiKey = process.env[config.apiKeyEnvVar];
    if (!apiKey) {
        logger.warn(`API Key not found in environment variable: ${config.apiKeyEnvVar}`);
        logger.warn(`Please ensure ${config.apiKeyEnvVar} is set in your .env file or system environment.`);
    }
    return apiKey;
}