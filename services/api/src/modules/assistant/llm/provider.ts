import { env } from '../../../config/env.js';
import { createAnthropicProvider } from './anthropic.js';
import { createOllamaProvider, createOpenAiCompatibleProvider } from './openai-compatible.js';

/**
 * A language-model provider only rephrases an answer from facts the backend supplies.
 * It never computes scores. Swapping providers needs only an environment change.
 */
export interface LlmProvider {
  name: string;
  complete(input: { system: string; user: string }): Promise<string>;
}

let cached: LlmProvider | null | undefined;

export function getLlmProvider(): LlmProvider | null {
  if (cached !== undefined) return cached;
  switch (env.LLM_PROVIDER) {
    case 'ollama':
      cached = createOllamaProvider();
      break;
    case 'openai_compatible':
      cached = env.LLM_API_KEY || env.LLM_BASE_URL ? createOpenAiCompatibleProvider() : null;
      break;
    case 'anthropic':
      cached = env.LLM_API_KEY ? createAnthropicProvider() : null;
      break;
    default:
      cached = null; // deterministic answers only
  }
  return cached;
}

/** For tests. */
export function setLlmProvider(p: LlmProvider | null) {
  cached = p;
}
