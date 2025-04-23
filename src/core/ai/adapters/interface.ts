// src/core/ai/adapters/interface.ts
import { type ConversationTurn } from '../../session.js';
// Define AiToolResponse structure here OR import from implementation
// Let's define it here for clarity if other adapters might use it
export interface AiToolResponse {
    text?: string;
    functionCall?: {
        name: string;
        args: Record<string, any>;
    };
    finishReason?: string;
}


export interface AiModelAdapter {
    /**
     * Generates a response from the AI model, potentially involving tool calls.
     * @param promptOrHistory - The input prompt string or an array of conversation turns including tool interactions.
     * @param options - Model-specific options (e.g., temperature, max tokens, safety settings).
     * @returns A promise resolving to the AI's response (text and/or function call) structure.
     * @throws Error if the API call fails or returns an error.
     */
     // Return type is always AiToolResponse now for consistency
    generate(promptOrHistory: string | ConversationTurn[], options?: Record<string, any>): Promise<AiToolResponse>;

    getModelId?(): string;
}

export type ModelProvider = 'gemini' | 'openai' | 'anthropic';