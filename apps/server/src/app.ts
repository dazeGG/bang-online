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
import { registerLobby, type SocketData } from './lobby.js';
import { createPostgresLobbyStore, type LobbyStore } from './lobby-store.js';
import { registerWebClient } from './web-client.js';

interface AppDependencies {
  database?: Database;
  lobbyStore?: LobbyStore;
}

export function buildApp(config: ServerConfig, dependencies: AppDependencies = {}) {
  const app = Fastify({ logger: { level: config.logLevel } });
  let database = dependencies.database;
  let lobbyStore = dependencies.lobbyStore;
  if (database === undefined && config.databaseUrl !== undefined) {
    const postgres = createDatabase(config.databaseUrl, () => {
      app.log.error('Unexpected PostgreSQL pool error.');
    });
    database = postgres;
    lobbyStore ??= createPostgresLobbyStore(postgres.pool);
  }

  const io = new Server<ClientToServerEvents, ServerToClientEvents, object, SocketData>(
    app.server,
    {
      serveClient: false,
      cors: { origin: config.webOrigin },
      allowRequest(request, callback) {
        const origin = request.headers.origin;
        callback(null, origin === undefined || origin === config.webOrigin);
      },
    },
  );

  const serverInfo: ServerInfo = {
    protocolVersion: 2,
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

  registerLobby({ app, io, store: lobbyStore, webOrigin: config.webOrigin });

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
      if ((await database.check()) === 'migrations_pending') {
        return reply.code(503).send({ status: 'not_ready', database: 'migrations_pending' });
      }
      return { status: 'ready', database: 'connected' };
    } catch {
      return reply.code(503).send({
        status: 'not_ready',
        database: 'unavailable',
      });
    }
  });

  if (config.webDistDir !== undefined) registerWebClient(app, config.webDistDir);

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
