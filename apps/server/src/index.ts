import { buildApp } from './app.js';
import { readConfig } from './config.js';

async function start() {
  const config = readConfig();
  const app = buildApp(config);

  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;

    try {
      await app.close();
    } catch {
      app.log.error('Server shutdown failed.');
      process.exitCode = 1;
    }
  };

  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());

  try {
    await app.listen({ host: config.host, port: config.port });
  } catch {
    app.log.error('Server could not start. Check the configured host and port.');
    process.exitCode = 1;
    await shutdown();
  }
}

void start().catch((error: unknown) => {
  // Configuration errors deliberately contain variable names, never their values.
  console.error(error instanceof Error ? error.message : 'Server startup failed.');
  process.exitCode = 1;
});
