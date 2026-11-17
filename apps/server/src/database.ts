import { Pool } from 'pg';

export interface Database {
  check(): Promise<void>;
  close(): Promise<void>;
}

export function createDatabase(connectionString: string, onPoolError: () => void): Database {
  const pool = new Pool({
    connectionString,
    connectionTimeoutMillis: 3_000,
    idleTimeoutMillis: 10_000,
    max: 5,
    query_timeout: 3_000,
    statement_timeout: 3_000,
  });

  // Idle clients can emit errors without an outstanding query to catch them.
  pool.on('error', onPoolError);

  return {
    async check() {
      await pool.query('SELECT 1');
    },
    async close() {
      await pool.end();
    },
  };
}
