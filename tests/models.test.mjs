import test from 'node:test';
import assert from 'node:assert/strict';
import { handleModels, isFreeTextModel, listModels, resolveModel } from '../server/models.mjs';
import { handleChat } from '../server/chat.mjs';
const free = { id: 'example/chat:free', name: 'Example chat', architecture: { input_modalities: ['text'], output_modalities: ['text'] }, pricing: { prompt: '0', completion: '0' } };
const paid = { ...free, id: 'openai/gpt-6-luna', name: 'GPT-6 Luna', pricing: { prompt: '0.0000001', completion: '0.0000005' } };
const env = { OPENROUTER_API_KEY: 'test-secret' };
const request = model => new Request('https://nova.example/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Hello' }] }) });

test('free catalog excludes paid tokens, request charges, unknown prices, batch and audio generation', () => {
  assert.equal(isFreeTextModel(free), true);
  for (const model of [paid, { ...free, pricing: {} }, { ...free, pricing: { prompt: '', completion: '0' } }, { ...free, pricing: { ...free.pricing, request: '0.01' } }, { ...free, id: 'example/chat:batch' }, { ...free, architecture: { ...free.architecture, output_modalities: ['text', 'audio'] } }, { ...free, pricing: { ...free.pricing, overrides: [{ prompt: '0.01' }] } }]) assert.equal(Boolean(isFreeTextModel(model)), false);
});
test('catalog caches upstream data and lists only requested paid, free, and owner default models', async () => {
  let count = 0;
  const fetcher = async () => { count++; return Response.json({ data: [free, paid, { ...paid, id: 'other/expensive' }] }); };
  const result = await listModels(env, fetcher);
  assert.ok(result.models.some(m => m.id === free.id && m.free));
  assert.ok(result.models.some(m => m.id === paid.id && !m.free));
  assert.ok(!result.models.some(m => m.id === 'other/expensive'));
  const configured = await listModels({ ...env, OPENROUTER_MODEL: 'other/expensive' }, fetcher);
  assert.equal(configured.defaultModel, 'other/expensive');
  assert.ok(configured.models.some(m => m.id === 'other/expensive'));
  assert.equal(count, 1);
  assert.equal(await resolveModel('unlisted/free:free', env, fetcher), null);
});
test('chat routes requested paid and catalog free models without allowing arbitrary paid IDs', async () => {
  for (const id of ['deepseek/deepseek-v4.1-flash', paid.id, free.id]) {
    let sent;
    const fetcher = async (url, options) => {
      if (url.endsWith('/models')) return Response.json({ data: [free, paid] });
      sent = JSON.parse(options.body); return Response.json({ choices: [{ message: { content: 'Hello!' } }] });
    };
    const response = await handleChat(request(id), env, fetcher);
    assert.equal(response.status, 200); assert.equal(sent.model, id);
  }
  const rejected = await handleChat(request('other/expensive'), env, async () => Response.json({ data: [free] }));
  assert.equal(rejected.status, 400);
  assert.equal((await handleChat(request({ id: 'bad' }), env)).status, 400);
});
test('model endpoint handles outage, recovers on retry, and never exposes secrets', async () => {
  let failing = true;
  const fetcher = async () => { if (failing) throw new Error('test-secret'); return Response.json({ data: [free] }); };
  const req = new Request('https://nova.example/api/models');
  const failed = await handleModels(req, env, fetcher);
  assert.equal(failed.status, 503); assert.doesNotMatch(await failed.text(), /test-secret/);
  failing = false;
  assert.equal((await handleModels(req, env, fetcher)).status, 200);
  assert.equal((await handleModels(new Request(req.url, { method: 'POST' }), env, fetcher)).status, 405);
});
test('background memory follows selected model unless owner configures a memory model', async () => {
  for (const memoryModel of ['', 'openrouter/free']) {
    let used;
    const result = await handleChat(request(paid.id), { ...env, OPENROUTER_MEMORY_MODEL: memoryModel }, async (_, options) => {
      used = JSON.parse(options.body).model;
      return Response.json({ choices: [{ message: { content: '{"memories":[]}' } }] });
    }, 'memory');
    assert.equal(result.status, 200); assert.equal(used, memoryModel || paid.id);
  }
});
