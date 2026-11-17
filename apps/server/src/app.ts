import {
  CLASSIC_PLAYER_LIMITS,
  CLASSIC_RULESET_ID,
  type ClientToServerEvents,
  type HealthResponse,
  type ServerInfo,
  type ServerToClientEvents,
} from '@bang/contracts';
import Fastify from 'fastify';
import { Server } from 'socket.io';
import type { ServerConfig } from './config.js';
import { createDatabase, type Database } from './database.js';

interface AppDependencies {
  database?: Database;
}

export function buildApp(config: ServerConfig, dependencies: AppDependencies = {}) {
  const app = Fastify({ logger: { level: config.logLevel } });
  const database =
    dependencies.database ??
    (config.databaseUrl === undefined
      ? undefined
      : createDatabase(config.databaseUrl, () => {
          app.log.error('Unexpected PostgreSQL pool error.');
        }));

  const io = new Server<ClientToServerEvents, ServerToClientEvents>(app.server, {
    serveClient: false,
    cors: { origin: config.webOrigin },
    allowRequest(request, callback) {
      const origin = request.headers.origin;
      callback(null, origin === undefined || origin === config.webOrigin);
    },
  });

  const serverInfo: ServerInfo = {
    protocolVersion: 1,
    rulesetId: CLASSIC_RULESET_ID,
    minPlayers: CLASSIC_PLAYER_LIMITS.min,
    maxPlayers: CLASSIC_PLAYER_LIMITS.max,
  };

  io.on('connection', (socket) => {
    socket.emit('server:info', serverInfo);
    socket.on('client:ping', (acknowledge) => {
      // Transport payloads remain untrusted even when the TypeScript API is typed.
      if (typeof acknowledge === 'function') {
        acknowledge({ serverTime: new Date().toISOString() });
      }
    });
  });

  app.get('/api/health', () => {
    return {
      status: 'ok',
      service: 'bang-server',
      rulesetId: CLASSIC_RULESET_ID,
    } satisfies HealthResponse;
  });

  app.get('/api/ready', async (_request, reply) => {
    if (database === undefined) {
      return reply.code(503).send({
        status: 'not_ready',
        database: 'not_configured',
      });
    }

    try {
      await database.check();
      return { status: 'ready', database: 'connected' };
    } catch {
      return reply.code(503).send({
        status: 'not_ready',
        database: 'unavailable',
      });
    }
  });

  app.addHook('preClose', async () => {
    // Upgraded sockets must close before Fastify waits for its HTTP server.
    io.disconnectSockets(true);
    io.engine.close();
  });

  app.addHook('onClose', async () => {
    await database?.close();
  });

  return app;
}
