import { afterEach, describe, expect, it, vi } from 'vitest';
import { io as createClient, type Socket } from 'socket.io-client';
import {
  CLASSIC_RULESET_ID,
  type ClientToServerEvents,
  type ServerInfo,
  type ServerToClientEvents,
} from '@bang/contracts';
import { buildApp } from '../src/app.js';
import { readConfig } from '../src/config.js';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
const config = readConfig({ LOG_LEVEL: 'silent' });
const apps: ReturnType<typeof buildApp>[] = [];
const sockets: ClientSocket[] = [];

function createApp(...args: Parameters<typeof buildApp>) {
  const app = buildApp(...args);
  apps.push(app);
  return app;
}

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.disconnect();
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('HTTP health endpoints', () => {
  it('reports liveness without requiring PostgreSQL', async () => {
    const app = createApp(config);
    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ok',
      service: 'bang-server',
      rulesetId: CLASSIC_RULESET_ID,
    });
  });

  it('is not ready when the database is not configured', async () => {
    const app = createApp(config);
    const response = await app.inject({ method: 'GET', url: '/api/ready' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: 'not_ready', database: 'not_configured' });
  });

  it('checks the database before reporting readiness and closes it on shutdown', async () => {
    const database = {
      check: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const app = createApp(config, { database });
    const response = await app.inject({ method: 'GET', url: '/api/ready' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ready', database: 'connected' });
    expect(database.check).toHaveBeenCalledOnce();

    await app.close();
    expect(database.close).toHaveBeenCalledOnce();
  });

  it('does not expose database errors or affect liveness', async () => {
    const database = {
      check: vi.fn().mockRejectedValue(new Error('postgres://user:secret@internal/db')),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const app = createApp(config, { database });
    const response = await app.inject({ method: 'GET', url: '/api/ready' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: 'not_ready', database: 'unavailable' });
    expect(response.body).not.toContain('secret');
    expect((await app.inject({ method: 'GET', url: '/api/health' })).statusCode).toBe(200);
  });
});

describe('Socket.IO transport', () => {
  async function connect(
    origin = config.webOrigin,
    transports: ('polling' | 'websocket')[] = ['websocket'],
  ) {
    const app = createApp(config);
    const address = await app.listen({ host: '127.0.0.1', port: 0 });
    const socket: ClientSocket = createClient(address, {
      autoConnect: false,
      reconnection: false,
      transports,
      extraHeaders: { Origin: origin },
    });
    sockets.push(socket);
    return { app, socket };
  }

  it('announces the classic ruleset, acknowledges ping and closes a connected client', async () => {
    const { app, socket } = await connect(config.webOrigin, ['polling', 'websocket']);
    const info = new Promise<ServerInfo>((resolve, reject) => {
      socket.once('server:info', resolve);
      socket.once('connect_error', reject);
    });
    socket.connect();

    await expect(info).resolves.toEqual({
      protocolVersion: 1,
      rulesetId: CLASSIC_RULESET_ID,
      minPlayers: 4,
      maxPlayers: 7,
    });

    const response = await socket.timeout(1_000).emitWithAck('client:ping');
    expect(Number.isNaN(Date.parse(response.serverTime))).toBe(false);

    const disconnected = new Promise<void>((resolve) => {
      socket.once('disconnect', () => resolve());
    });
    await app.close();
    await disconnected;
    expect(socket.connected).toBe(false);
    expect(app.server.listening).toBe(false);
  });

  it('rejects browser connections from an untrusted origin', async () => {
    const { socket } = await connect('https://untrusted.example');
    const rejected = new Promise<Error>((resolve) => socket.once('connect_error', resolve));
    socket.connect();

    expect(await rejected).toBeInstanceOf(Error);
    expect(socket.connected).toBe(false);
  });

  it('ignores malformed pings while retaining a usable connection', async () => {
    const { socket } = await connect();
    const connected = new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    });
    socket.connect();
    await connected;

    // Deliberately bypass the static contract to exercise untrusted wire input.
    socket.emit('client:ping', undefined as never);
    const response = await socket.timeout(1_000).emitWithAck('client:ping');
    expect(response.serverTime).toEqual(expect.any(String));
  });
});
