import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validImage } from '../server/images.mjs';
import { handleChat } from '../server/chat.mjs';
import { localDatabase } from '../scripts/sqlite.mjs';
const bytes = readFileSync(new URL('./fixtures/pixel.jpg', import.meta.url));
const uri = bytes => `data:image/jpeg;base64,${bytes.toString('base64')}`;
const image = uri(bytes);
const model = 'openai/gpt-6-luna';
const request = messages => new Request('https://nova.example/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, messages }) });

test('image validation accepts bounded JPEG and rejects remote, malformed and oversized images', () => {
  assert.equal(validImage(image), true);
  for (const invalid of ['https://example.com/image.jpg', 'data:image/svg+xml;base64,AAAA', 'data:image/jpeg;base64,AA==', image.slice(0, 80), `data:image/jpeg;base64,${'A'.repeat(650000)}`]) assert.equal(validImage(invalid), false);
  const oversized = Buffer.from(bytes);
  const marker = oversized.indexOf(Buffer.from([255, 192]));
  assert.ok(marker > 0);
  oversized.writeUInt16BE(2048, marker + 7);
  assert.equal(validImage(uri(oversized)), false);
});

test('vision request forwards multimodal content and reconciles image token usage', async () => {
  const env = { OPENROUTER_API_KEY: 'test-secret', NOVA_DB: localDatabase() };
  let sent;
  const fetcher = async (url, options) => {
    if (url.endsWith('/models')) return Response.json({ data: [{ id: model, architecture: { input_modalities: ['text', 'image'] } }] });
    sent = JSON.parse(options.body);
    return Response.json({ choices: [{ message: { content: 'A small image.' } }], usage: { total_tokens: 450 } });
  };
  const response = await handleChat(request([{ role: 'user', content: 'Describe it', image }]), env, fetcher);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).quota.used, 450);
  assert.deepEqual(sent.messages.at(-1).content, [{ type: 'text', text: 'Describe it' }, { type: 'image_url', image_url: { url: image, detail: 'low' } }]);
  assert.ok(sent.max_tokens <= 2048);
  env.NOVA_DB.close();
});

test('text-only models, multiple images, assistant images and memory images never reach inference', async () => {
  const env = { OPENROUTER_API_KEY: 'test-secret', NOVA_DB: localDatabase() };
  const message = { role: 'user', content: 'Describe it', image };
  const fetcher = async url => { assert.ok(url.endsWith('/models')); return Response.json({ data: [{ id: model, architecture: { input_modalities: ['text'] } }] }); };
  for (const messages of [[message], [message, message], [{ ...message, role: 'assistant' }, { role: 'user', content: 'Hi' }]]) {
    assert.equal((await handleChat(request(messages), env, fetcher)).status, 400);
  }
  assert.equal((await handleChat(request([message]), env, fetcher, 'memory')).status, 400);
  env.NOVA_DB.close();
});
