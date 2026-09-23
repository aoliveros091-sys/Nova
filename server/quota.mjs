export const LIMIT = 10000;
export const WINDOW_MS = 4 * 24 * 60 * 60 * 1000;
const initialized = new WeakSet();
export const SCHEMA = `CREATE TABLE IF NOT EXISTS nova_device_usage (
  id TEXT PRIMARY KEY, used INTEGER NOT NULL DEFAULT 0, resets_at INTEGER NOT NULL
)`;
const response = (body, status, cookie) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...(cookie ? { 'Set-Cookie': cookie } : {}) } });
export const summary = row => ({ limit: LIMIT, used: row.used, remaining: Math.max(0, LIMIT - row.used), resetsAt: row.resets_at });

async function device(request, env, now) {
  const db = env.NOVA_DB;
  if (!db) throw new Error('Bind a D1 database as NOVA_DB to enable the token allowance.');
  if (!initialized.has(db)) { await db.prepare(SCHEMA).run(); initialized.add(db); }
  const id = request.headers.get('Cookie')?.match(/(?:^|;\s*)nova_device=([a-f0-9-]{36})(?:;|$)/)?.[1];
  let row = id ? await db.prepare('SELECT * FROM nova_device_usage WHERE id = ?').bind(id).first() : null;
  let cookie;
  if (!row) {
    row = { id: crypto.randomUUID(), used: 0, resets_at: now + WINDOW_MS };
    await db.prepare('INSERT INTO nova_device_usage (id, used, resets_at) VALUES (?, 0, ?)').bind(row.id, row.resets_at).run();
    cookie = `nova_device=${row.id}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=31536000${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
  } else if (row.resets_at <= now) {
    await db.prepare('UPDATE nova_device_usage SET used = 0, resets_at = ? WHERE id = ? AND resets_at <= ?').bind(now + WINDOW_MS, row.id, now).run();
    row = await db.prepare('SELECT * FROM nova_device_usage WHERE id = ?').bind(row.id).first();
  }
  return { db, row, cookie };
}

export async function handleUsage(request, env, now = Date.now()) {
  if (request.method !== 'GET') return response({ error: 'Use GET for usage.' }, 405);
  try { const { row, cookie } = await device(request, env, now); return response({ quota: summary(row) }, 200, cookie); }
  catch { return response({ error: 'Token limits need a Cloudflare D1 database bound as NOVA_DB. Ask the site owner to finish setup.' }, 503); }
}

// Different providers tokenize differently. Reserve conservatively before calling
// the provider, then reconcile using its actual total_tokens, including reasoning.
export function estimateInput(messages) {
  return 256 + messages.reduce((sum, message) => {
    if (typeof message.content === 'string') return sum + new TextEncoder().encode(message.content).length + 32;
    return sum + 32 + message.content.reduce((total, part) => total + (part.type === 'text' ? new TextEncoder().encode(part.text).length : 4096), 0);
  }, 0);
}

export async function reserveQuota(request, env, inputTokens, requestedOutput, now = Date.now()) {
  let context;
  try { context = await device(request, env, now); }
  catch { return { error: response({ error: 'AI is paused until the owner binds a Cloudflare D1 database as NOVA_DB.' }, 503) }; }
  const { db, row, cookie } = context;
  const maxOutput = Math.min(requestedOutput, LIMIT - row.used - inputTokens);
  if (maxOutput < 64) return { error: response({ error: row.used >= LIMIT ? 'Your 10,000-token allowance is used up. Try again after the reset.' : 'Not enough tokens remain for this message and its context. Try a shorter message or a new chat, or wait for the reset.', quota: summary(row) }, 429, cookie) };
  const amount = inputTokens + maxOutput;
  const reserved = await db.prepare('UPDATE nova_device_usage SET used = used + ? WHERE id = ? AND resets_at = ? AND used + ? <= ? RETURNING *').bind(amount, row.id, row.resets_at, amount, LIMIT).first();
  if (!reserved) return { error: response({ error: 'Another request is using your allowance. Wait for it to finish, then retry.', quota: summary(await db.prepare('SELECT * FROM nova_device_usage WHERE id = ?').bind(row.id).first()) }, 429, cookie) };
  let settled = false;
  return {
    maxOutput, cookie, quota: summary(reserved),
    async settle(actual) {
      if (settled) return this.quota;
      // Unknown usage (timeout/network error) keeps the reservation charged.
      const charge = Number.isSafeInteger(actual) && actual >= 0 ? actual : amount;
      const updated = await db.prepare('UPDATE nova_device_usage SET used = MAX(0, used + ?) WHERE id = ? AND resets_at = ? RETURNING *').bind(charge - amount, row.id, row.resets_at).first();
      settled = true;
      if (updated) this.quota = summary(updated);
      return this.quota;
    }
  };
}
