import { isAbsolute } from 'node:path';

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

type LogLevel = (typeof LOG_LEVELS)[number];

export interface ServerConfig {
  host: string;
  port: number;
  webOrigin: string;
  databaseUrl: string | undefined;
  logLevel: LogLevel;
  /** Built web client to serve from this process (production). Unset in development. */
  webDistDir: string | undefined;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const host = env.SERVER_HOST?.trim() ?? '127.0.0.1';
  if (host.length === 0) {
    throw new Error('SERVER_HOST must not be empty.');
  }

  const rawPort = env.SERVER_PORT ?? '3001';
  const port = Number(rawPort);
  if (!/^\d+$/.test(rawPort) || !Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('SERVER_PORT must be an integer between 1 and 65535.');
  }

  let webOrigin: string;
  try {
    const url = new URL(env.WEB_ORIGIN ?? 'http://localhost:5173');
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    ) {
      throw new Error('Invalid origin.');
    }
    webOrigin = url.origin;
  } catch {
    throw new Error('WEB_ORIGIN must be an HTTP(S) origin without a path or credentials.');
  }

  const databaseUrl = env.DATABASE_URL?.trim() || undefined;
  if (databaseUrl !== undefined) {
    try {
      const url = new URL(databaseUrl);
      if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname) {
        throw new Error('Invalid database URL.');
      }
    } catch {
      throw new Error('DATABASE_URL must be a PostgreSQL connection URL.');
    }
  }

  const rawLogLevel = env.LOG_LEVEL ?? 'info';
  if (!LOG_LEVELS.some((level) => level === rawLogLevel)) {
    throw new Error('LOG_LEVEL must be a supported Pino log level.');
  }

  const webDistDir = env.WEB_DIST_DIR?.trim() || undefined;
  if (webDistDir !== undefined && !isAbsolute(webDistDir)) {
    throw new Error('WEB_DIST_DIR must be an absolute path.');
  }

  return {
    host,
    port,
    webOrigin,
    databaseUrl,
    logLevel: rawLogLevel as LogLevel,
    webDistDir,
  };
}
