import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../../config/env.js';
import type { LlmProvider } from './provider.js';

/**
 * Optional Claude provider (LLM_PROVIDER=anthropic, LLM_API_KEY=<key>). Paid API - NutriScan
 * works fully without it. Uses server-side refusal fallbacks; a refusal or error simply makes the
 * assistant return its deterministic answer.
 */
export function createAnthropicProvider(): LlmProvider {
  const client = new Anthropic({ apiKey: env.LLM_API_KEY, timeout: env.LLM_TIMEOUT_MS, maxRetries: 1 });
  const model = env.LLM_MODEL ?? 'claude-opus-5-5';
  return {
    name: `anthropic:${model}`,
    async complete({ system, user }) {
      const response = await client.beta.messages.create({
        model,
        max_tokens: 1024,
        // Short, grounded rephrasing task: low effort keeps latency and cost down.
        output_config: { effort: 'low' },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system,
        messages: [{ role: 'user', content: user }],
      } as unknown as Anthropic.Beta.MessageCreateParamsNonStreaming);
      if (response.stop_reason === 'refusal') throw new Error('Model declined to answer');
      const text = response.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
      if (!text) throw new Error('Empty response from Claude');
      return text;
    },
  };
}
