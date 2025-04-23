import { type Config, getApiKey } from '../config/loader.js'; // Use 'type' for interface import
import { AiModelAdapter, ModelProvider } from './adapters/interface.js';
import { GeminiAdapter } from './adapters/gemini.js';
// Import future adapters here
// import { OpenAiAdapter } from './adapters/openai.js';
// import { AnthropicAdapter } from './adapters/anthropic.js';
import { logger } from '../../utils/logger.js';

// Simple in-memory cache for adapter instances
const adapterCache = new Map<string, AiModelAdapter>();

/**
 * Selects and returns an AI model adapter based on configuration or explicit request.
 *
 * @param config - The loaded application configuration.
 * @param requestedModelId - An optional specific model ID to override the default.
 * @returns An instance of AiModelAdapter.
 * @throws Error if the required API key is missing or the model provider is unsupported.
 */
export function getAiClient(config: Config, requestedModelId?: string): AiModelAdapter {
  const modelId = requestedModelId || config.defaultModel;
  const cacheKey = modelId; // Cache based on model ID

  if (adapterCache.has(cacheKey)) {
    logger.debug(`Using cached AI adapter for model: ${modelId}`);
    return adapterCache.get(cacheKey)!;
  }

  logger.debug(`Creating new AI adapter for model: ${modelId}`);

  // Determine the provider based on the model ID prefix (simple example)
  let provider: ModelProvider | null = null;
  if (modelId.startsWith('gemini')) {
    provider = 'gemini';
  } else if (modelId.startsWith('gpt')) {
    provider = 'openai'; // Future
  } else if (modelId.startsWith('claude')) {
    provider = 'anthropic'; // Future
  }

  if (!provider) {
    throw new Error(`Unsupported model ID format or provider: ${modelId}`);
  }

  let adapter: AiModelAdapter;
  const apiKey = getApiKey(config); // Get the API key using the configured env var name

  if (!apiKey) {
    // getApiKey already logs a warning, but we throw here to prevent proceeding
     throw new Error(`API key configured via '${config.apiKeyEnvVar}' not found in environment.`);
  }

  switch (provider) {
    case 'gemini':
      adapter = new GeminiAdapter(apiKey, modelId);
      break;
    // Add cases for future providers
    // case 'openai':
    //   // const openaiApiKey = process.env[config.openaiApiKeyEnvVar || 'OPENAI_API_KEY'];
    //   // if (!openaiApiKey) throw new Error('OpenAI API key not found.');
    //   // adapter = new OpenAiAdapter(openaiApiKey, modelId);
    //   throw new Error('OpenAI adapter not yet implemented.');
    // case 'anthropic':
    //   // const anthropicApiKey = process.env[config.anthropicApiKeyEnvVar || 'ANTHROPIC_API_KEY'];
    //   // if (!anthropicApiKey) throw new Error('Anthropic API key not found.');
    //   // adapter = new AnthropicAdapter(anthropicApiKey, modelId);
    //   throw new Error('Anthropic adapter not yet implemented.');
    default:
      throw new Error(`AI provider for model ${modelId} is not supported.`);
  }

  adapterCache.set(cacheKey, adapter); // Cache the new instance
  return adapter;
}