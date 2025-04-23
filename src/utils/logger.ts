import chalk from 'chalk';

// Basic logger configuration (could be expanded later)
const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  AI: 4, // Special level for AI responses
  NONE: 5,
} as const;

type LogLevelKey = keyof typeof LogLevel;

// Determine log level from environment or default to INFO
const currentLogLevel: number = LogLevel[(process.env.LOG_LEVEL?.toUpperCase() as LogLevelKey) ?? 'INFO'] ?? LogLevel.INFO;

const logger = {
  debug: (...args: any[]) => {
    if (currentLogLevel <= LogLevel.DEBUG) {
      console.debug(chalk.gray('[DEBUG]'), ...args);
    }
  },
  info: (...args: any[]) => {
    if (currentLogLevel <= LogLevel.INFO) {
      console.info(chalk.blueBright('[INFO]'), ...args);
    }
  },
  warn: (...args: any[]) => {
    if (currentLogLevel <= LogLevel.WARN) {
      console.warn(chalk.yellowBright('[WARN]'), ...args);
    }
  },
  error: (...args: any[]) => {
    if (currentLogLevel <= LogLevel.ERROR) {
      console.error(chalk.redBright('[ERROR]'), ...args);
    }
  },
  // Special logger for AI responses
  aiResponse: (message: string) => {
    if (currentLogLevel <= LogLevel.AI) {
        // Using green for AI responses, but feel free to choose another color
        console.log(chalk.greenBright('\n🤖 AI Response:'));
        console.log(chalk.green(message)); // Keep AI response less decorated
    }
  },
   // Simple log for direct output without prefix/color
   log: (...args: any[]) => {
       console.log(...args);
   }
};

// Example on how to set log level via environment variable (in PowerShell):
// $env:LOG_LEVEL="DEBUG"; pnpm dev ask "what is this?"
// Or CMD:
// set LOG_LEVEL=DEBUG && pnpm dev ask "what is this?"

// Or add LOG_LEVEL=DEBUG to your .env file

export { logger };