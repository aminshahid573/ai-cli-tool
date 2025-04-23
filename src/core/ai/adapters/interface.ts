// src/core/ai/adapters/interface.ts
import { type ConversationTurn } from '../../session.js'; // Correct path
// Define AiToolResponse structure here or import from gemini.ts
import { type AiToolResponse } from './gemini.js';

export interface AiModelAdapter {
    /**
     * Generates a response from the AI model, potentially involving tool calls.
     * @param promptOrHistory - The input prompt string or an array of conversation turns including tool interactions.
     * @param options - Model-specific options (e.g., temperature, max tokens, safety settings).
     * @returns A promise resolving to the AI's response (text and/or function call).
     * @throws Error if the API call fails or returns an error.
     */
    generate(promptOrHistory: string | ConversationTurn[], options?: Record<string, any>): Promise<string | AiToolResponse>;

    getModelId?(): string;
}

export type ModelProvider = 'gemini' | 'openai' | 'anthropic';