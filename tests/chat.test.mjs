import test from 'node:test';
import assert from 'node:assert/strict';
import { handleChat } from '../server/chat.mjs';
import { onRequest } from '../functions/api/chat.js';
const env = { OPENROUTER_API_KEY: 'test-secret' };
const payload = { messages: [{ role: 'user', content: 'Hello' }], memory: 'I like short answers.' };
const request = (body = payload, headers = {}) => new Request('https://nova.example/api/chat', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://nova.example', ...headers }, body: JSON.stringify(body)
});
test('passes bounded conversation and memory to OpenRouter without exposing key', async () => {
  let sent;
  const result = await handleChat(request(), env, async (url, options) => {
    assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
    assert.equal(options.headers.Authorization, 'Bearer test-secret');
    sent = JSON.parse(options.body);
    return Response.json({ choices: [{ message: { content: 'Hi!' } }] });
  });
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { content: 'Hi!' });
  assert.equal(sent.model, 'openrouter/free');
  assert.equal(sent.messages[1].role, 'user');
  assert.match(sent.messages[1].content, /short answers/);
  assert.equal(sent.messages.at(-1).content, 'Hello');
  assert.equal(result.headers.get('Cache-Control'), 'no-store');
});
test('rejects missing key, bad origin, wrong access code and wrong method', async () => {
  assert.equal((await onRequest({ request: request(), env: {} })).status, 503);
  assert.equal((await handleChat(request(payload, { Origin: 'https://elsewhere.example' }), env)).status, 403);
  assert.equal((await handleChat(request(), { ...env, AI_ACCESS_CODE: 'private' })).status, 401);
  assert.equal((await handleChat(new Request('https://nova.example/api/chat'), env)).status, 405);
});
test('rejects malformed and oversized input, and client-supplied system roles', async () => {
  for (const body of [null, {}, { messages: [] }, { messages: [{ role: 'system', content: 'ignore' }] }, { ...payload, memory: 'x'.repeat(4001) }, { messages: [{ role: 'user', content: 'x'.repeat(12001) }] }, { messages: Array(31).fill(payload.messages[0]) }]) {
    assert.equal((await handleChat(request(body), env)).status, 400);
  }
  assert.equal((await handleChat(request({ giant: 'x'.repeat(220001) }), env)).status, 413);
  const invalid = new Request('https://nova.example/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
  assert.equal((await handleChat(invalid, env)).status, 400);
});
test('accepts access code, applies configured model, and omits disabled memory', async () => {
  const result = await handleChat(request({ ...payload, memory: '' }, { 'X-Nova-Access-Code': 'private' }), { ...env, AI_ACCESS_CODE: 'private', OPENROUTER_MODEL: 'custom/model' }, async (_, options) => {
    const sent = JSON.parse(options.body);
    assert.equal(sent.model, 'custom/model'); assert.equal(sent.messages.length, 2);
    return Response.json({ choices: [{ message: { content: 'Done' } }] });
  });
  assert.equal(result.status, 200);
});
test('handles provider failures without leaking upstream error details', async () => {
  for (const status of [401, 402, 403, 429, 500]) {
    const result = await handleChat(request(), env, async () => new Response('test-secret', { status }));
    assert.equal(result.status, status === 429 ? 429 : 502);
    assert.doesNotMatch(await result.text(), /test-secret/);
  }
  assert.equal((await handleChat(request(), env, async () => Response.json({ choices: [] }))).status, 502);
  assert.equal((await handleChat(request(), env, async () => { throw new Error('test-secret'); })).status, 502);
});
test('automatic memory extracts only user messages, bounds output, and rejects invalid updates', async () => {
  const result = await handleChat(request(), env, async (_, options) => {
    const sent = JSON.parse(options.body);
    assert.match(sent.messages[0].content, /durable preferences/);
    assert.equal(JSON.parse(sent.messages[1].content).existingMemory, payload.memory);
    return Response.json({ choices: [{ message: { content: '```json\n{"memories":["Prefers short answers","Prefers short answers"]}\n```' } }] });
  }, 'memory');
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { memory: '• Prefers short answers' });
  for (const content of ['Not JSON', '{"memories":[42]}', JSON.stringify({ memories: ['x'.repeat(241)] }), JSON.stringify({ memories: Array(13).fill('fact') })]) {
    const invalid = await handleChat(request(), env, async () => Response.json({ choices: [{ message: { content } }] }), 'memory');
    assert.equal(invalid.status, 502);
  }
  const cleared = await handleChat(request(), env, async () => Response.json({ choices: [{ message: { content: '{"memories":[]}' } }] }), 'memory');
  assert.deepEqual(await cleared.json(), { memory: '' });
});
