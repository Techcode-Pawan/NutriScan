import { env } from '../../../config/env.js';
import type { LlmProvider } from './provider.js';

async function postJson(url: string, body: unknown, headers: Record<string, string>): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.LLM_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`LLM provider responded ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Free, local: https://ollama.com (e.g. `ollama pull llama3.2`). */
export function createOllamaProvider(): LlmProvider {
  const base = (env.LLM_BASE_URL ?? 'http://127.0.0.1:11434').replace(/\/$/, '');
  const model = env.LLM_MODEL ?? 'llama3.2';
  return {
    name: `ollama:${model}`,
    async complete({ system, user }) {
      const data = (await postJson(`${base}/api/chat`, {
        model,
        stream: false,
        options: { temperature: 0.2 },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }, {})) as { message?: { content?: string } };
      const text = data.message?.content?.trim();
      if (!text) throw new Error('Empty response from Ollama');
      return text;
    },
  };
}

/** Any OpenAI-compatible chat-completions endpoint (configure base URL, key and model). */
export function createOpenAiCompatibleProvider(): LlmProvider {
  const base = (env.LLM_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = env.LLM_MODEL ?? 'gpt-4o-mini';
  return {
    name: `openai_compatible:${model}`,
    async complete({ system, user }) {
      const data = (await postJson(
        `${base}/chat/completions`,
        {
          model,
          temperature: 0.2,
          max_tokens: 600,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        },
        env.LLM_API_KEY ? { Authorization: `Bearer ${env.LLM_API_KEY}` } : {},
      )) as { choices?: Array<{ message?: { content?: string } }> };
      const text = data.choices?.[0]?.message?.content?.trim();
      if (!text) throw new Error('Empty response from LLM provider');
      return text;
    },
  };
}
