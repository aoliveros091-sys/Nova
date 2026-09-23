import test from 'node:test';
import assert from 'node:assert/strict';
import { localDatabase } from '../scripts/sqlite.mjs';
import { LIMIT, WINDOW_MS, handleUsage, reserveQuota, estimateInput } from '../server/quota.mjs';
import { handleChat } from '../server/chat.mjs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const start = Date.now();
const req = cookie => new Request('https://nova.example/api/usage', { headers: cookie ? { Cookie: cookie } : {} });
async function setup() {
  const env = { NOVA_DB: localDatabase(), OPENROUTER_API_KEY: 'test-secret' };
  const response = await handleUsage(req(), env, start);
  const cookie = response.headers.get('Set-Cookie').split(';')[0];
  return { env, cookie, response };
}

test('local usage persists across database restarts', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'nova-quota-'));
  let db = localDatabase(join(directory, 'usage.sqlite'));
  try {
    const response = await handleUsage(req(), { NOVA_DB: db }, start);
    const cookie = response.headers.get('Set-Cookie').split(';')[0];
    const reservation = await reserveQuota(req(cookie), { NOVA_DB: db }, 300, 1000, start);
    await reservation.settle(450);
    db.close(); db = localDatabase(join(directory, 'usage.sqlite'));
    assert.equal((await (await handleUsage(req(cookie), { NOVA_DB: db }, start)).json()).quota.used, 450);
  } finally { db.close(); rmSync(directory, { recursive: true, force: true }); }
});
test('opaque device cookie persists allowance and resets after exactly four days', async () => {
  const { env, cookie, response } = await setup();
  assert.match(response.headers.get('Set-Cookie'), /HttpOnly; SameSite=Strict/);
  const reservation = await reserveQuota(req(cookie), env, 500, 2000, start);
  await reservation.settle(1800);
  assert.equal((await (await handleUsage(req(cookie), env, start + WINDOW_MS - 1)).json()).quota.used, 1800);
  const reset = await (await handleUsage(req(cookie), env, start + WINDOW_MS)).json();
  assert.equal(reset.quota.used, 0); assert.equal(reset.quota.resetsAt, start + 2 * WINDOW_MS);
  const fresh = await (await handleUsage(req(), env, start)).json(); assert.equal(fresh.quota.used, 0);
});
test('atomic reservations prevent concurrent requests exceeding the available budget', async () => {
  const { env, cookie } = await setup();
  const reservations = await Promise.all(Array.from({ length: 5 }, () => reserveQuota(req(cookie), env, 4000, 2000, start)));
  const success = reservations.filter(r => !r.error);
  assert.equal(success.length, 1); assert.ok(reservations.filter(r => r.error).every(r => r.error.status === 429));
  await success[0].settle(900);
  await success[0].settle(900);
  assert.equal((await (await handleUsage(req(cookie), env, start)).json()).quota.used, 900);
});
test('output budget is reduced near limit, exhaustion blocks, and rollover does not refund a new period', async () => {
  const { env, cookie } = await setup();
  const old = await reserveQuota(req(cookie), env, 100, 2000, start); await old.settle(9300);
  const next = await reserveQuota(req(cookie), env, 200, 2000, start);
  assert.equal(next.maxOutput, 500); await next.settle(700);
  const denied = await reserveQuota(req(cookie), env, 1, 100, start);
  assert.equal(denied.error.status, 429);
  await handleUsage(req(cookie), env, start + WINDOW_MS);
  assert.equal((await (await handleUsage(req(cookie), env, start + WINDOW_MS)).json()).quota.used, 0);
});
test('unknown usage retains reservation and a late prior-window settlement cannot alter new usage', async () => {
  const { env, cookie } = await setup();
  const old = await reserveQuota(req(cookie), env, 500, 1000, start);
  await handleUsage(req(cookie), env, start + WINDOW_MS);
  const current = await reserveQuota(req(cookie), env, 200, 500, start + WINDOW_MS);
  await old.settle(0); await current.settle(undefined);
  assert.equal((await (await handleUsage(req(cookie), env, start + WINDOW_MS)).json()).quota.used, 700);
});
test('chat and memory charge shared usage; rejected provider requests refund reservations', async () => {
  const { env, cookie } = await setup();
  const chatRequest = () => new Request('https://nova.example/api/chat', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: 'Hi' }] }) });
  await handleChat(chatRequest(), env, async () => Response.json({ choices: [{ message: { content: 'Hello' } }], usage: { total_tokens: 650 } }));
  await handleChat(chatRequest(), env, async () => Response.json({ choices: [{ message: { content: '{"memories":[]}' } }], usage: { total_tokens: 210 } }), 'memory');
  const rejected = await handleChat(chatRequest(), env, async () => new Response('', { status: 429 }));
  assert.equal(rejected.status, 429);
  assert.equal((await (await handleUsage(req(cookie), env)).json()).quota.used, 860);
});
test('missing database fails closed and estimates include images and UTF-8 text', async () => {
  assert.equal((await handleUsage(req(), {})).status, 503);
  assert.equal((await reserveQuota(req(), {}, 100, 100)).error.status, 503);
  assert.ok(estimateInput([{ content: [{ type: 'text', text: 'Hi' }, { type: 'image_url' }] }]) > 4096);
  assert.ok(estimateInput([{ content: '日本' }]) > estimateInput([{ content: 'ab' }]));
  const { env, cookie } = await setup();
  assert.equal((await reserveQuota(req(cookie), env, LIMIT + 1, 100)).error.status, 429);
});
