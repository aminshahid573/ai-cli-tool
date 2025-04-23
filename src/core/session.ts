// src/core/session.ts
import { type Config } from "./config/loader.js";
import { logger } from "../utils/logger.js";
import { type ToolResult } from './ai/tools.js';

// Define available models
export const AVAILABLE_MODELS = [
    "gemini-1.5-flash-latest",
    "gemini-1.5-pro-latest",
    "gemini-2.5-pro-exp-03-25",
] as const;

export type AvailableModelId = typeof AVAILABLE_MODELS[number];

// --- Define structure for conversation history parts ---
// Export these interfaces
export interface TextPart { text: string; }
export interface FunctionCallPart { functionCall: { name: string; args: Record<string, any>; }; }
export interface FunctionResponsePart { functionResponse: { name: string; response: ToolResult; }; }

// Updated ConversationTurn to support tool interactions
export interface ConversationTurn {
    // Role 'tool' is used for the response FROM the tool execution for Gemini
    role: 'user' | 'model' | 'tool';
    parts: (TextPart | FunctionCallPart | FunctionResponsePart)[];
}

// Updated SessionState
export interface SessionState {
    currentModel: AvailableModelId;
    history: ConversationTurn[];
}

let session: SessionState | null = null;

export function initializeSession(config: Config): SessionState {
    if (!session) {
        const initialModel = AVAILABLE_MODELS.includes(config.defaultModel as AvailableModelId)
            ? config.defaultModel as AvailableModelId
            : AVAILABLE_MODELS[0];

        session = {
            currentModel: initialModel,
            history: [],
        };
        logger.debug("Session initialized:", session);
    }
    return session;
}

export function getSession(): SessionState {
    if (!session) {
        logger.error("CRITICAL: Session accessed before initialization!");
        throw new Error("Session not initialized. Application setup error.");
    }
    return session;
}

export function addTurnToHistory(turn: ConversationTurn) {
    try {
        const currentSession = getSession();

        if (!turn || !turn.role || !Array.isArray(turn.parts) || turn.parts.length === 0) {
            logger.warn("Attempted to add invalid turn structure to history:", turn);
            return;
        }
        const firstPart = turn.parts[0];
         // Add stricter validation based on role
        if (turn.role === 'user' && !('text' in firstPart)) { logger.warn("Invalid user turn part:", firstPart); return; }
        if (turn.role === 'model' && !(('text' in firstPart && typeof firstPart.text === 'string') || ('functionCall' in firstPart))) { logger.warn("Invalid model turn part:", firstPart); return; }
        if (turn.role === 'tool' && !('functionResponse' in firstPart)) { logger.warn("Invalid tool response turn part:", firstPart); return; }

        const lastTurn = currentSession.history[currentSession.history.length - 1];
        if (lastTurn && lastTurn.role === turn.role && JSON.stringify(lastTurn.parts) === JSON.stringify(turn.parts)) {
             logger.debug("Skipping duplicate consecutive turn in history.");
             return;
        }

        currentSession.history.push(turn);

        const maxHistoryTurns = 20;
        if (currentSession.history.length > maxHistoryTurns) {
            currentSession.history = currentSession.history.slice(-maxHistoryTurns);
             logger.debug(`History pruned to last ${maxHistoryTurns} turns.`);
        }
        logger.debug(`History updated. Turn count: ${currentSession.history.length}, Last Role: ${turn.role}`);
    } catch (error) {
        logger.error("Failed to add turn to history:", error);
    }
}

export function clearHistory() {
     try {
        const currentSession = getSession();
        currentSession.history = [];
        logger.info("Conversation history cleared.");
     } catch (error) {
         logger.error("Failed to clear history:", error);
     }
}

export function updateSession(updates: Partial<Omit<SessionState, 'history'>>): SessionState {
    const currentSession = getSession();
    const { history, ...validUpdates } = updates as any;
    session = { ...currentSession, ...validUpdates };
    logger.debug("Session updated (model/other state):", session);
    return session!;
}

export function isValidModelId(modelId: string): modelId is AvailableModelId {
     return AVAILABLE_MODELS.includes(modelId as AvailableModelId);
}