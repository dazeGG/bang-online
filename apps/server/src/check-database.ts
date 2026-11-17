import { readConfig } from './config.js';
import { createDatabase } from './database.js';

async function checkDatabase() {
  const config = readConfig();
  if (config.databaseUrl === undefined) {
    throw new Error('DATABASE_URL is not configured. Copy the root .env.example to .env.');
  }

  const database = createDatabase(config.databaseUrl, () => {
    console.error('Unexpected PostgreSQL pool error.');
  });

  try {
    await database.check();
    console.info('PostgreSQL connection is ready.');
  } catch {
    throw new Error('PostgreSQL is unavailable. Check the database service and DATABASE_URL.');
  } finally {
    await database.close();
  }
}

void checkDatabase().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Database check failed.');
  process.exitCode = 1;
});
