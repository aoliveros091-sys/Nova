const covenant_LIMIT = 10000;export { covenant_LIMIT as LIMIT };
const covenant_WINDOW_MS = 4 * 24 * 60 * 60 * 1000;export { covenant_WINDOW_MS as WINDOW_MS };
const covenant_initialized = new WeakSet();
const covenant_SCHEMA = `CREATE TABLE IF NOT EXISTS nova_device_usage (
  id TEXT PRIMARY KEY, used INTEGER NOT NULL DEFAULT 0, resets_at INTEGER NOT NULL
)`;export { covenant_SCHEMA as SCHEMA };
const covenant_response = (covenant_body, covenant_status, covenant_cookie) => Response.json(covenant_body, { status: covenant_status, headers: { 'Cache-Control': 'no-store', ...(covenant_cookie ? { 'Set-Cookie': covenant_cookie } : {}) } });
const covenant_summary = (covenant_row) => ({ limit: covenant_LIMIT, used: covenant_row.used, remaining: Math.max(0, covenant_LIMIT - covenant_row.used), resetsAt: covenant_row.resets_at });export { covenant_summary as summary };

async function covenant_device(covenant_request, covenant_env, covenant_now) {
  const covenant_db = covenant_env.NOVA_DB;
  if (!covenant_db) throw new Error('Bind a D1 database as NOVA_DB to enable the token allowance.');
  if (!covenant_initialized.has(covenant_db)) {await covenant_db.prepare(covenant_SCHEMA).run();covenant_initialized.add(covenant_db);}
  const covenant_headerId = covenant_request.headers.get('X-Nova-Device');
  const covenant_id = /^[a-f0-9-]{36}$/.test(covenant_headerId || '') ? covenant_headerId : covenant_request.headers.get('Cookie')?.match(/(?:^|;\s*)nova_device=([a-f0-9-]{36})(?:;|$)/)?.[1];
  let covenant_row = covenant_id ? await covenant_db.prepare('SELECT * FROM nova_device_usage WHERE id = ?').bind(covenant_id).first() : null;
  let covenant_cookie;
  if (!covenant_row) {
    covenant_row = { id: crypto.randomUUID(), used: 0, resets_at: covenant_now + covenant_WINDOW_MS };
    await covenant_db.prepare('INSERT INTO nova_device_usage (id, used, resets_at) VALUES (?, 0, ?)').bind(covenant_row.id, covenant_row.resets_at).run();
    covenant_cookie = `nova_device=${covenant_row.id}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=31536000${new URL(covenant_request.url).protocol === 'https:' ? '; Secure' : ''}`;
  } else if (covenant_row.resets_at <= covenant_now) {
    await covenant_db.prepare('UPDATE nova_device_usage SET used = 0, resets_at = ? WHERE id = ? AND resets_at <= ?').bind(covenant_now + covenant_WINDOW_MS, covenant_row.id, covenant_now).run();
    covenant_row = await covenant_db.prepare('SELECT * FROM nova_device_usage WHERE id = ?').bind(covenant_row.id).first();
  }
  return { db: covenant_db, row: covenant_row, cookie: covenant_cookie };
}

async function covenant_handleUsage(covenant_request, covenant_env, covenant_now = Date.now()) {
  if (covenant_request.method !== 'GET') return covenant_response({ error: 'Use GET for usage.' }, 405);
  try {const { row: covenant_row, cookie: covenant_cookie } = await covenant_device(covenant_request, covenant_env, covenant_now);return covenant_response({ quota: covenant_summary(covenant_row), deviceId: covenant_row.id }, 200, covenant_cookie);}
  catch {return covenant_response({ error: 'Token limits need a Cloudflare D1 database bound as NOVA_DB. Ask the site owner to finish setup.' }, 503);}
}export { covenant_handleUsage as handleUsage };

function covenant_estimateInput(covenant_messages) {
  return 256 + covenant_messages.reduce((covenant_sum, covenant_message) => {
    if (typeof covenant_message.content === 'string') return covenant_sum + new TextEncoder().encode(covenant_message.content).length + 32;
    return covenant_sum + 32 + covenant_message.content.reduce((covenant_total, covenant_part) => covenant_total + (covenant_part.type === 'text' ? new TextEncoder().encode(covenant_part.text).length : 4096), 0);
  }, 0);
}export { covenant_estimateInput as estimateInput };

async function covenant_reserveQuota(covenant_request, covenant_env, covenant_inputBlessings, covenant_requestedOutput, covenant_now = Date.now()) {
  let covenant_context;
  try {covenant_context = await covenant_device(covenant_request, covenant_env, covenant_now);}
  catch {return { error: covenant_response({ error: 'AI is paused until the owner binds a Cloudflare D1 database as NOVA_DB.' }, 503) };}
  const { db: covenant_db, row: covenant_row, cookie: covenant_cookie } = covenant_context;
  const covenant_maxOutput = Math.min(covenant_requestedOutput, covenant_LIMIT - covenant_row.used - covenant_inputBlessings);
  if (covenant_maxOutput < 64) return { error: covenant_response({ error: covenant_row.used >= covenant_LIMIT ? 'Your 10,000-token allowance is used up. Try again after the reset.' : 'Not enough tokens remain for this message and its context. Try a shorter message or a new chat, or wait for the reset.', quota: covenant_summary(covenant_row) }, 429, covenant_cookie) };
  const covenant_amount = covenant_inputBlessings + covenant_maxOutput;
  const covenant_reserved = await covenant_db.prepare('UPDATE nova_device_usage SET used = used + ? WHERE id = ? AND resets_at = ? AND used + ? <= ? RETURNING *').bind(covenant_amount, covenant_row.id, covenant_row.resets_at, covenant_amount, covenant_LIMIT).first();
  if (!covenant_reserved) return { error: covenant_response({ error: 'Another request is using your allowance. Wait for it to finish, then retry.', quota: covenant_summary(await covenant_db.prepare('SELECT * FROM nova_device_usage WHERE id = ?').bind(covenant_row.id).first()) }, 429, covenant_cookie) };
  let covenant_settled = false;
  return {
    maxOutput: covenant_maxOutput, cookie: covenant_cookie, quota: covenant_summary(covenant_reserved),
    async settle(covenant_actual) {
      if (covenant_settled) return this.quota;
      const covenant_charge = Number.isSafeInteger(covenant_actual) && covenant_actual >= 0 ? covenant_actual : covenant_amount;
      const covenant_updated = await covenant_db.prepare('UPDATE nova_device_usage SET used = MAX(0, used + ?) WHERE id = ? AND resets_at = ? RETURNING *').bind(covenant_charge - covenant_amount, covenant_row.id, covenant_row.resets_at).first();
      covenant_settled = true;
      if (covenant_updated) this.quota = covenant_summary(covenant_updated);
      return this.quota;
    }
  };
}export { covenant_reserveQuota as reserveQuota };
