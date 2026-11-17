import { describe, expect, it } from 'vitest';
import { readConfig } from '../src/config.js';

describe('server configuration', () => {
  it('uses local defaults without a database', () => {
    expect(readConfig({})).toEqual({
      host: '127.0.0.1',
      port: 3001,
      webOrigin: 'http://localhost:5173',
      databaseUrl: undefined,
      logLevel: 'info',
    });
  });

  it.each(['0', '65536', '3.5', '', '3001junk'])('rejects invalid port %j', (port) => {
    expect(() => readConfig({ SERVER_PORT: port })).toThrow('SERVER_PORT');
  });

  it.each(['file:///tmp', 'https://example.com/path', 'https://user:secret@example.com'])(
    'rejects a non-origin WEB_ORIGIN %j',
    (webOrigin) => {
      expect(() => readConfig({ WEB_ORIGIN: webOrigin })).toThrow('WEB_ORIGIN');
    },
  );

  it('does not expose credentials in a database validation error', () => {
    expect(() => readConfig({ DATABASE_URL: 'https://user:secret@example.com' })).toThrow(
      'DATABASE_URL must be a PostgreSQL connection URL.',
    );
  });

  it('rejects an unsupported log level', () => {
    expect(() => readConfig({ LOG_LEVEL: 'verbose' })).toThrow('LOG_LEVEL');
  });
});
