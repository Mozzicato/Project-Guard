// Provider-agnostic LLM access over OpenAI-compatible chat endpoints.
// Providers are tried in order; the first one with a key that answers wins.

interface Provider {
  name: string;
  url: string;
  key: string | undefined;
  model: string;
  /** Extra body fields for this provider. */
  extra?: Record<string, unknown>;
}

function providers(): Provider[] {
  const all: Provider[] = [
    {
      name: 'gemini',
      url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      key: process.env.GEMINI_API_KEY,
      model: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash',
      extra: { reasoning_effort: 'low' },
    },
    {
      name: 'groq',
      url: 'https://api.groq.com/openai/v1/chat/completions',
      key: process.env.GROQ_API_KEY,
      model: process.env.GROQ_MODEL ?? 'openai/gpt-oss-120b',
      extra: { reasoning_effort: 'low' },
    },
    {
      name: 'mistral',
      url: 'https://api.mistral.ai/v1/chat/completions',
      key: process.env.MISTRAL_API_KEY,
      model: process.env.MISTRAL_MODEL ?? 'mistral-small-latest',
    },
    {
      name: 'openrouter',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      key: process.env.OPENROUTER_API_KEY,
      model: process.env.OPENROUTER_MODEL ?? 'meta-llama/llama-3.3-70b-instruct',
    },
  ];
  const order = (process.env.LLM_PROVIDERS ?? 'gemini,groq,mistral,openrouter').split(',').map((s) => s.trim());
  return order.map((n) => all.find((p) => p.name === n)).filter((p): p is Provider => !!p && !!p.key);
}

export function llmAvailable(): boolean {
  return providers().length > 0;
}

export class LLMError extends Error {}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

async function callProvider(p: Provider, messages: ChatMessage[], json: boolean, maxTokens: number) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Number(process.env.LLM_TIMEOUT_MS ?? 90_000));
  try {
    const res = await fetch(p.url, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${p.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: p.model,
        messages,
        temperature: 0.3,
        max_tokens: maxTokens,
        ...(json ? { response_format: { type: 'json_object' } } : {}),
        ...p.extra,
      }),
    });
    const text = await res.text();
    if (!res.ok) throw new LLMError(`${p.name} HTTP ${res.status}: ${text.slice(0, 300)}`);
    const body = JSON.parse(text);
    const content: string | undefined = body.choices?.[0]?.message?.content;
    if (!content) throw new LLMError(`${p.name} returned no content (finish: ${body.choices?.[0]?.finish_reason})`);
    return content;
  } finally {
    clearTimeout(timer);
  }
}

/** Pull the first JSON object out of a model reply, tolerating code fences and prose. */
export function extractJson(raw: string): any {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new LLMError('Model reply was not valid JSON');
  }
}

export async function chat(messages: ChatMessage[], opts: { json?: boolean; maxTokens?: number } = {}): Promise<string> {
  const list = providers();
  if (!list.length) throw new LLMError('No LLM provider configured. Add GEMINI_API_KEY or GROQ_API_KEY to .env');
  const errors: string[] = [];
  for (const p of list) {
    try {
      return await callProvider(p, messages, !!opts.json, opts.maxTokens ?? 4096);
    } catch (e: any) {
      errors.push(e?.name === 'AbortError' ? `${p.name}: timed out` : String(e?.message ?? e));
    }
  }
  throw new LLMError(`All LLM providers failed — ${errors.join(' | ')}`);
}

export async function chatJson<T = any>(system: string, user: string, maxTokens = 6000): Promise<T> {
  const messages: ChatMessage[] = [
    { role: 'system', content: `${system}\n\nRespond with a single valid JSON object and nothing else.` },
    { role: 'user', content: user },
  ];
  const raw = await chat(messages, { json: true, maxTokens });
  try {
    return extractJson(raw) as T;
  } catch {
    // One repair attempt: ask the model to fix its own output.
    const fixed = await chat(
      [...messages, { role: 'assistant', content: raw }, { role: 'user', content: 'That was not valid JSON. Return only the corrected JSON object.' }],
      { json: true, maxTokens },
    );
    return extractJson(fixed) as T;
  }
}
