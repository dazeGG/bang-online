import { Pool } from 'pg';
import { pendingMigrations } from './migrations.js';

export type DatabaseStatus = 'ready' | 'migrations_pending';

export interface Database {
  /** Rejects when PostgreSQL is unreachable. */
  check(): Promise<DatabaseStatus>;
  close(): Promise<void>;
}

export interface PostgresDatabase extends Database {
  pool: Pool;
}

interface DatabaseOptions {
  /** Isolated schema for integration tests. Production uses the default search path. */
  schema?: string;
}

export function createDatabase(
  connectionString: string,
  onPoolError: () => void,
  options: DatabaseOptions = {},
): PostgresDatabase {
  const pool = new Pool({
    connectionString,
    connectionTimeoutMillis: 3_000,
    idleTimeoutMillis: 10_000,
    max: 5,
    query_timeout: 3_000,
    statement_timeout: 3_000,
    ...(options.schema === undefined ? {} : { options: `-c search_path=${options.schema}` }),
  });

  // Idle clients can emit errors without an outstanding query to catch them.
  pool.on('error', onPoolError);

  return {
    pool,
    async check() {
      await pool.query('SELECT 1');
      return (await pendingMigrations(pool)).length === 0 ? 'ready' : 'migrations_pending';
    },
    async close() {
      await pool.end();
    },
  };
}
