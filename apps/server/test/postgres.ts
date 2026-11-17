import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { createDatabase, type PostgresDatabase } from '../src/database.js';
import { migrate } from '../src/migrations.js';

const url = process.env['TEST_DATABASE_URL'] ?? process.env['DATABASE_URL'];

async function probe(): Promise<boolean> {
  if (url === undefined || url.trim() === '') return false;
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 2_000 });
  try {
    await client.connect();
    await client.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}

/**
 * PostgreSQL integration tests run in a throwaway schema and never touch application tables.
 * They are skipped locally without a reachable database, but CI must provide one.
 */
export const postgresAvailable = await probe();

if (!postgresAvailable) {
  const message =
    'PostgreSQL is unavailable: database integration tests are SKIPPED. ' +
    'Run `npm run db:up` or set TEST_DATABASE_URL.';
  if (process.env['CI']) throw new Error(message);
  console.warn(message);
}

export interface TestSchema {
  schema: string;
  /** Opens an independent pool, as a separate server process would. */
  open(): PostgresDatabase;
  migrate(): Promise<number[]>;
  dispose(): Promise<void>;
}

export async function createTestSchema(): Promise<TestSchema> {
  if (url === undefined) throw new Error('No test database URL.');
  const schema = `test_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Pool({ connectionString: url, max: 1 });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const databases: PostgresDatabase[] = [];

  const open = () => {
    const database = createDatabase(url, () => undefined, { schema });
    databases.push(database);
    return database;
  };

  return {
    schema,
    open,
    async migrate() {
      const database = createDatabase(url, () => undefined, { schema });
      try {
        return await migrate(database.pool);
      } finally {
        await database.close();
      }
    },
    async dispose() {
      // Pools already closed by an app.close() reject a second end(); ignore that.
      await Promise.all(databases.map((database) => database.close().catch(() => undefined)));
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    },
  };
}
