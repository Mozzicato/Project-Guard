import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.DB_PATH = ':memory:';
process.env.SESSION_SECRET = 'test-secret';
const auth = await import('./auth.js');

test('passwords hash with a salt and verify', async () => {
  const h1 = await auth.hashPassword('correct horse');
  const h2 = await auth.hashPassword('correct horse');
  assert.notEqual(h1, h2);
  assert.ok(await auth.verifyPassword('correct horse', h1));
  assert.ok(!(await auth.verifyPassword('wrong horse', h1)));
});

test('session tokens round-trip and reject tampering', async () => {
  const t = await auth.makeToken(42);
  assert.equal(await auth.readToken(t), 42);
  const [payload, sig] = t.split('.');
  const forged = Buffer.from(JSON.stringify({ uid: 1, exp: 9e9 })).toString('base64url');
  assert.equal(await auth.readToken(`${forged}.${sig}`), null);
  assert.equal(await auth.readToken(`${payload}.x${sig.slice(1)}`), null);
  assert.equal(await auth.readToken('garbage'), null);
  assert.equal(await auth.readToken(undefined), null);
});

test('login throttle kicks in after repeated failures', () => {
  for (let i = 0; i < 8; i++) auth.recordFailure('k');
  assert.ok(auth.throttled('k'));
  auth.clearFailures('k');
  assert.ok(!auth.throttled('k'));
});
