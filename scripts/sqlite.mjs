import { DatabaseSync as covenant_DatabaseSync } from 'node:sqlite';
function covenant_localDatabase(covenant_path = ':memory:') {
  const covenant_sqlite = new covenant_DatabaseSync(covenant_path);
  covenant_sqlite.exec('PRAGMA busy_timeout = 5000');
  return {
    prepare(covenant_sql) {
      let covenant_values = [];
      return {
        bind(...covenant_args) {covenant_values = covenant_args;return this;},
        async first() {return covenant_sqlite.prepare(covenant_sql).get(...covenant_values) || null;},
        async run() {const covenant_result = covenant_sqlite.prepare(covenant_sql).run(...covenant_values);return { success: true, meta: { changes: Number(covenant_result.changes) } };}
      };
    },
    close() {covenant_sqlite.close();}
  };
}export { covenant_localDatabase as localDatabase };
