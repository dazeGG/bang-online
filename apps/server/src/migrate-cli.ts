import { readConfig } from './config.js';
import { createDatabase } from './database.js';
import { migrate } from './migrations.js';

async function run() {
  const config = readConfig();
  if (config.databaseUrl === undefined) {
    throw new Error('DATABASE_URL is not configured. Copy the root .env.example to .env.');
  }

  const database = createDatabase(config.databaseUrl, () => {
    console.error('Unexpected PostgreSQL pool error.');
  });

  try {
    const applied = await migrate(database.pool);
    console.info(
      applied.length === 0
        ? 'Database schema is up to date.'
        : `Applied migrations: ${applied.join(', ')}.`,
    );
  } finally {
    await database.close();
  }
}

void run().catch((error: unknown) => {
  // pg errors may include connection details; print only a safe summary.
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  console.error(`Database migration failed${code ? ` (${code})` : ''}.`);
  if (error instanceof Error && !code) console.error(error.message);
  process.exitCode = 1;
});
