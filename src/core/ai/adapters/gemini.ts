// src/core/ai/adapters/gemini.ts
import {
  GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, GenerateContentResponse,
  GenerateContentResult, GenerateContentRequest, Content, Part,
  FunctionCallPart as GeminiFunctionCallPart, FunctionResponsePart as GeminiFunctionResponsePart,
  GenerationConfig,
} from "@google/generative-ai";
import { type ConversationTurn, TextPart, FunctionCallPart, FunctionResponsePart } from '../../session.js';
import { AiModelAdapter, AiToolResponse } from './interface.js'; // Import shared AiToolResponse type
import { logger } from "../../../utils/logger.js";
import { geminiToolConfig, defaultSafetySettings, type ToolResult } from '../tools.js';

export class GeminiAdapter implements AiModelAdapter {
  private genAI: GoogleGenerativeAI;
  private modelId: string;

  constructor(apiKey: string, modelId: string = 'gemini-1.5-pro-latest') {
      if (!apiKey) {
          throw new Error("GeminiAdapter requires an API key.");
      }
      this.genAI = new GoogleGenerativeAI(apiKey);
      this.modelId = modelId;
      logger.debug(`GeminiAdapter initialized with model: ${this.modelId}`);
  }

  getModelId(): string {
      return this.modelId;
  }

  // FIX: Return type is always AiToolResponse
  async generate(
      promptOrHistory: string | ConversationTurn[],
      options?: Record<string, any>
  ): Promise<AiToolResponse> {
      const modelIdToUse = options?.modelId || this.modelId;
      logger.debug(`Generating with Gemini model: ${modelIdToUse}, Tool support enabled.`);

      try {
          const model = this.genAI.getGenerativeModel({
              model: modelIdToUse,
              safetySettings: options?.safetySettings ?? defaultSafetySettings,
              generationConfig: options?.generationConfig as GenerationConfig | undefined,
              tools: [geminiToolConfig]
          });

          let history: Content[] = [];
          let currentMessageContent: Content;

          if (typeof promptOrHistory === 'string') {
              currentMessageContent = { role: 'user', parts: [{ text: promptOrHistory }] };
              history = [];
          } else if (Array.isArray(promptOrHistory) && promptOrHistory.length > 0) {
              history = promptOrHistory.slice(0, -1).map(this.mapTurnToContent);
              currentMessageContent = this.mapTurnToContent(promptOrHistory[promptOrHistory.length - 1]);
          } else {
              throw new Error("Invalid input: Must be a non-empty string or ConversationTurn array.");
          }

          const contents: Content[] = [...history, currentMessageContent];
          logger.debug("Sending to Gemini:", JSON.stringify(contents.map(c => ({role: c.role, parts: c.parts.length})), null, 2));

          const request: GenerateContentRequest = { contents };
          const result: GenerateContentResult = await model.generateContent(request);
          const response: GenerateContentResponse | undefined = result.response;

          logger.debug("Received from Gemini:", JSON.stringify(response, null, 2));

          if (!response) {
               // FIX: Access promptFeedback from result.response if available
               const blockReason = result.response?.promptFeedback?.blockReason;
               const safetyRatings = result.response?.promptFeedback?.safetyRatings;
               logger.error('Gemini API returned no response object.', { blockReason, safetyRatings });
               throw new Error(`Gemini API returned no response object. Block Reason: ${blockReason || 'Unknown'}`);
          }

          const candidate = response.candidates?.[0];
          if (!candidate) {
               const blockReason = response.promptFeedback?.blockReason;
              throw new Error(`No candidate found in response. Block Reason: ${blockReason || 'Unknown'}`);
          }

          const finishReason = candidate.finishReason;
          logger.debug(`Gemini Finish Reason: ${finishReason}`);

          const funcCallPart = candidate.content?.parts?.find((part: Part): part is GeminiFunctionCallPart => 'functionCall' in part);

          if (funcCallPart && funcCallPart.functionCall) {
              const funcCall = funcCallPart.functionCall;
              logger.info(`AI requested function call: ${funcCall.name}`);
              return { // Return structured tool response
                  functionCall: { name: funcCall.name, args: funcCall.args ?? {} },
                  finishReason: finishReason,
              };
          }

          // FIX: Use result.response.text()
          const text = result.response?.text?.(); // Call text() method if it exists on result.response

          if (text === undefined || text === null ) { // Check for undefined/null text
               const blockReason = response.promptFeedback?.blockReason;
               if (blockReason || finishReason === 'SAFETY' || finishReason === 'OTHER') {
                    // Throw error only if blocked, otherwise return empty text
                    logger.error(`Content generation stopped or empty. Reason: ${blockReason || finishReason}`);
                   throw new Error(`Content generation stopped. Reason: ${blockReason || finishReason}`);
               }
               logger.warn(`Gemini response has no text content and no function call. Finish Reason: ${finishReason}`);
          }

          logger.debug(`Gemini raw response text length: ${text?.length ?? 0}`);
          return { // Return structured response even for text
              text: text ?? "",
              finishReason: finishReason
          };

      } catch (error: any) {
          logger.error(`Error calling Gemini API: ${error.message}`, { model: modelIdToUse, inputType: typeof promptOrHistory });
          // Return a structured error response? Or just throw? Throwing is cleaner for now.
          throw new Error(`Gemini API request failed for model ${modelIdToUse}: ${error.message}`);
      }
  }

  // Helper to map our history format to Gemini's Content format
  private mapTurnToContent(turn: ConversationTurn): Content {
      // FIX: Filter map result to ensure only valid Parts are returned
      const mappedParts: Part[] = turn.parts.map(part => {
          if ('text' in part && typeof part.text === 'string') {
              return { text: part.text };
          } else if ('functionCall' in part && typeof part.functionCall === 'object') {
              return { functionCall: part.functionCall };
          } else if ('functionResponse' in part && typeof part.functionResponse === 'object') {
               return { functionResponse: part.functionResponse };
          } else {
              logger.warn("Mapping unknown part type:", part);
              return { text: "[Unknown Part Type]" }; // Return a valid Part instead of null
          }
      });

      let role = turn.role;
      if (role === 'tool') { // Our internal role for tool result
           role = 'tool'; // Gemini expects 'tool' role for function responses
      }

      if (role !== 'user' && role !== 'model' && role !== 'tool') {
          logger.error(`Invalid role '${role}' being sent to Gemini adapter. Mapping to 'user'.`);
          role = 'user';
      }
      if (mappedParts.length === 0) {
           logger.error(`Turn with role '${role}' resulted in empty parts array after mapping. Adding placeholder.`);
           mappedParts.push({ text: "[Empty Mapped Part]" });
      }

      return {
           role: role as 'user' | 'model' | 'tool',
          parts: mappedParts
      };
  }
}