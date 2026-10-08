// Provider-agnostic LLM access over OpenAI-compatible chat endpoints.
// Each provider has a chain of models. A request walks the chain until one answers:
//  - a temporarily overloaded model (503/500/502/504) is retried once after a short pause;
//  - a rate-limited or exhausted model (429) is skipped and put on cooldown, so later
//    requests don't spend time on it until the provider says it is available again.

interface Target {
  provider: string;
  url: string;
  key: string;
  model: string;
  /** Extra body fields for this model. */
  extra?: Record<string, unknown>;
}

const list = (env: string | undefined, fallback: string[]) =>
  env ? env.split(',').map((s) => s.trim()).filter(Boolean) : fallback;

/** Reasoning models answer faster and cheaper with low effort; others reject the parameter. */
function extraFor(provider: string, model: string): Record<string, unknown> | undefined {
  if (provider === 'gemini' && /2\.5|3/.test(model)) return { reasoning_effort: 'low' };
  if (provider === 'groq' && model.includes('gpt-oss')) return { reasoning_effort: 'low' };
  if (provider === 'groq' && model.includes('qwen')) return { reasoning_effort: 'none' };
  return undefined;
}

function targets(): Target[] {
  const providers = [
    {
      name: 'gemini',
      url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      key: process.env.GEMINI_API_KEY,
      models: list(process.env.GEMINI_MODEL, ['gemini-2.5-flash', 'gemini-3-flash-preview', 'gemini-2.5-flash-lite', 'gemini-flash-lite-latest']),
    },
    {
      name: 'groq',
      url: 'https://api.groq.com/openai/v1/chat/completions',
      key: process.env.GROQ_API_KEY,
      // Groq's daily token limits are per model, so each extra model is extra capacity.
      models: list(process.env.GROQ_MODEL, ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-20b']),
    },
    {
      name: 'mistral',
      url: 'https://api.mistral.ai/v1/chat/completions',
      key: process.env.MISTRAL_API_KEY,
      models: list(process.env.MISTRAL_MODEL, ['mistral-small-latest']),
    },
    {
      name: 'openrouter',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      key: process.env.OPENROUTER_API_KEY,
      models: list(process.env.OPENROUTER_MODEL, ['meta-llama/llama-3.3-70b-instruct']),
    },
  ];
  const order = list(process.env.LLM_PROVIDERS, ['gemini', 'groq', 'mistral', 'openrouter']);
  const out: Target[] = [];
  for (const name of order) {
    const p = providers.find((x) => x.name === name);
    if (!p?.key) continue;
    for (const model of p.models) out.push({ provider: p.name, url: p.url, key: p.key, model, extra: extraFor(p.name, model) });
  }
  return out;
}

export function llmAvailable(): boolean {
  return targets().length > 0;
}

export class LLMError extends Error {}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

class HttpFailure extends Error {
  constructor(
    public status: number,
    message: string,
    public retryAfterMs: number,
  ) {
    super(message);
  }
}

// model id → time (ms epoch) until which it is skipped
const cooldown = new Map<string, number>();
const keyOf = (t: Target) => `${t.provider}/${t.model}`;

/** How long the provider asked us to wait: Retry-After header, or "try again in 6m45.6s" in the body. */
function retryAfter(res: Response, body: string): number {
  const h = Number(res.headers.get('retry-after'));
  if (Number.isFinite(h) && h > 0) return h * 1000;
  const m = /try again in (?:(\d+)h)?(?:(\d+)m)?(?:([\d.]+)s)?/i.exec(body);
  if (m && (m[1] || m[2] || m[3])) return ((Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0)) * 60 + Number(m[3] ?? 0)) * 1000;
  return 0;
}

async function call(t: Target, messages: ChatMessage[], json: boolean, maxTokens: number): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Number(process.env.LLM_TIMEOUT_MS ?? 60_000));
  try {
    const res = await fetch(t.url, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${t.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: t.model,
        messages,
        temperature: 0.3,
        max_tokens: maxTokens,
        ...(json ? { response_format: { type: 'json_object' } } : {}),
        ...t.extra,
      }),
    });
    const text = await res.text();
    if (!res.ok) throw new HttpFailure(res.status, `${keyOf(t)} HTTP ${res.status}: ${text.slice(0, 200)}`, retryAfter(res, text));
    const body = JSON.parse(text);
    let content: string | undefined = body.choices?.[0]?.message?.content;
    // Some reasoning models prefix their answer with a <think> block.
    if (content) content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    if (!content) throw new LLMError(`${keyOf(t)} returned no content (finish: ${body.choices?.[0]?.finish_reason})`);
    return content;
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function chat(messages: ChatMessage[], opts: { json?: boolean; maxTokens?: number } = {}): Promise<string> {
  const all = targets();
  if (!all.length) throw new LLMError('No LLM provider configured. Add GEMINI_API_KEY or GROQ_API_KEY to .env');
  const now = Date.now();
  // Models on cooldown go last rather than being dropped, in case everything else fails too.
  const ready = all.filter((t) => (cooldown.get(keyOf(t)) ?? 0) <= now);
  const resting = all.filter((t) => (cooldown.get(keyOf(t)) ?? 0) > now);
  const errors: string[] = [];
  for (const t of [...ready, ...resting]) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const out = await call(t, messages, !!opts.json, opts.maxTokens ?? 4096);
        cooldown.delete(keyOf(t));
        return out;
      } catch (e: any) {
        if (e instanceof HttpFailure) {
          const transient = [500, 502, 503, 504].includes(e.status);
          if (transient && attempt === 0) {
            await sleep(1200);
            continue; // one quick retry on the same model
          }
          // 429 (quota/rate) or repeated overload: rest this model and move on.
          cooldown.set(keyOf(t), Date.now() + (e.retryAfterMs || (e.status === 429 ? 120_000 : 30_000)));
          errors.push(e.message);
        } else {
          errors.push(e?.name === 'AbortError' ? `${keyOf(t)}: timed out` : String(e?.message ?? e));
        }
        break;
      }
    }
  }
  throw new LLMError(`All AI models are busy right now. Please try again in a minute. (${errors.map((m) => m.split(':')[0]).join(', ')})`);
}

/** Forget all cooldowns (used by tests). */
export function resetCooldowns() {
  cooldown.clear();
}

/** For diagnostics: which models are currently resting. */
export function modelStatus() {
  const now = Date.now();
  return targets().map((t) => ({ model: keyOf(t), resting_for_s: Math.max(0, Math.round(((cooldown.get(keyOf(t)) ?? 0) - now) / 1000)) }));
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
