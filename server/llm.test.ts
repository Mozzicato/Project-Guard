import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.GEMINI_API_KEY = 'g';
process.env.GROQ_API_KEY = 'q';
process.env.GEMINI_MODEL = 'g1,g2';
process.env.GROQ_MODEL = 'q1';
process.env.LLM_PROVIDERS = 'gemini,groq';
delete process.env.MISTRAL_API_KEY;
delete process.env.OPENROUTER_API_KEY;
const { chat, modelStatus, resetCooldowns } = await import('./llm.js');

type Reply = { status: number; body: unknown; headers?: Record<string, string> };
function mockFetch(script: Record<string, Reply[]>, fresh = true) {
  if (fresh) resetCooldowns();
  const calls: string[] = [];
  globalThis.fetch = (async (_url: string, init: any) => {
    const model = JSON.parse(init.body).model as string;
    calls.push(model);
    const r = script[model]?.shift() ?? { status: 500, body: 'no script' };
    const text = typeof r.body === 'string' ? r.body : JSON.stringify(r.body);
    return new Response(text, { status: r.status, headers: r.headers });
  }) as typeof fetch;
  return calls;
}
const ok = (content: string): Reply => ({ status: 200, body: { choices: [{ message: { content } }] } });

test('an overloaded model is retried once, then the next model answers', async () => {
  const calls = mockFetch({ g1: [{ status: 503, body: 'busy' }, { status: 503, body: 'busy' }], g2: [ok('hi')] });
  assert.equal(await chat([{ role: 'user', content: 'x' }]), 'hi');
  assert.deepEqual(calls, ['g1', 'g1', 'g2']);
});

test('a rate-limited model is skipped and rested for the time the provider asks', async () => {
  const calls = mockFetch({
    g1: [{ status: 429, body: 'Rate limit reached. Please try again in 6m45.6s.' }],
    g2: [{ status: 429, body: 'quota' }],
    q1: [ok('from groq'), ok('again')],
  });
  assert.equal(await chat([{ role: 'user', content: 'x' }]), 'from groq');
  assert.deepEqual(calls, ['g1', 'g2', 'q1']);
  const rest = Object.fromEntries(modelStatus().map((m) => [m.model, m.resting_for_s]));
  assert.ok(rest['gemini/g1'] > 400 && rest['gemini/g1'] <= 406, `g1 rests ~405s, got ${rest['gemini/g1']}`);
  // Next request goes straight to the model that works.
  const calls2 = mockFetch({ q1: [ok('again')] }, false);
  assert.equal(await chat([{ role: 'user', content: 'x' }]), 'again');
  assert.deepEqual(calls2, ['q1']);
});

test('when every model fails, the error is short and readable', async () => {
  mockFetch({ g1: [{ status: 400, body: 'bad' }], g2: [{ status: 400, body: 'bad' }], q1: [{ status: 400, body: 'bad' }] });
  await assert.rejects(chat([{ role: 'user', content: 'x' }]), /All AI models are busy right now/);
});

test('reasoning <think> blocks are stripped from replies', async () => {
  mockFetch({ g1: [ok('<think>hmm</think>{"a":1}')], g2: [ok('<think>hmm</think>{"a":1}')], q1: [ok('<think>hmm</think>{"a":1}')] });
  assert.equal(await chat([{ role: 'user', content: 'x' }]), '{"a":1}');
});
