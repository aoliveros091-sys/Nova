import { DatabaseSync } from 'node:sqlite';
// Local/test adapter with the D1 methods used by quota.mjs.
export function localDatabase(path = ':memory:') {
  const sqlite = new DatabaseSync(path);
  sqlite.exec('PRAGMA busy_timeout = 5000');
  return {
    prepare(sql) {
      let values = [];
      return {
        bind(...args) { values = args; return this; },
        async first() { return sqlite.prepare(sql).get(...values) || null; },
        async run() { const result = sqlite.prepare(sql).run(...values); return { success: true, meta: { changes: Number(result.changes) } }; }
      };
    },
    close() { sqlite.close(); }
  };
}
