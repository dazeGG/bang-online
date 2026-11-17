import type {
  ClientToServerEvents,
  LobbyClosedReason,
  LobbyResult,
  LobbyView,
  RoomPreview,
  SeatCredentials,
  ServerToClientEvents,
} from '@bang/contracts';
import { io as createClient, type Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { createPostgresLobbyStore } from '../src/lobby-store.js';
import { migrations } from '../src/migrations.js';
import { createTestSchema, postgresAvailable, type TestSchema } from './postgres.js';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const config = readConfig({ LOG_LEVEL: 'silent' });
const origin = config.webOrigin;

let schema: TestSchema;
const apps: ReturnType<typeof buildApp>[] = [];
const sockets: ClientSocket[] = [];

async function startServer() {
  const database = schema.open();
  const app = buildApp(config, {
    database,
    lobbyStore: createPostgresLobbyStore(database.pool),
  });
  apps.push(app);
  const address = await app.listen({ host: '127.0.0.1', port: 0 });
  return { app, address };
}

async function post<T>(address: string, path: string, body: unknown, headers = {}) {
  const response = await fetch(`${address}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin, ...headers },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as T, response };
}

const createRoom = (address: string, name: string) =>
  post<SeatCredentials>(address, '/api/rooms', { name });

const joinRoom = (address: string, roomCode: string, name: string) =>
  post<SeatCredentials>(address, `/api/rooms/${roomCode}/seats`, { name });

async function connect(address: string) {
  const socket: ClientSocket = createClient(address, {
    reconnection: false,
    transports: ['websocket'],
    extraHeaders: { Origin: origin },
  });
  sockets.push(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  return socket;
}

function attach(
  socket: ClientSocket,
  credentials: Pick<SeatCredentials, 'roomCode' | 'seatToken'>,
): Promise<LobbyResult> {
  return socket.timeout(2_000).emitWithAck('lobby:attach', {
    roomCode: credentials.roomCode,
    seatToken: credentials.seatToken,
  });
}

async function connectAs(address: string, credentials: SeatCredentials) {
  const socket = await connect(address);
  const result = await attach(socket, credentials);
  if (!result.ok) throw new Error(`attach failed: ${result.error}`);
  return { socket, lobby: result.lobby };
}

function nextState(socket: ClientSocket, predicate: (lobby: LobbyView) => boolean) {
  return new Promise<LobbyView>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('lobby:state', listener);
      reject(new Error('Timed out waiting for lobby state.'));
    }, 2_000);
    const listener = (lobby: LobbyView) => {
      if (!predicate(lobby)) return;
      clearTimeout(timer);
      socket.off('lobby:state', listener);
      resolve(lobby);
    };
    socket.on('lobby:state', listener);
  });
}

function nextClosed(socket: ClientSocket) {
  return new Promise<LobbyClosedReason>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for lobby:closed.')), 2_000);
    socket.once('lobby:closed', ({ reason }) => {
      clearTimeout(timer);
      resolve(reason);
    });
  });
}

const setReady = (socket: ClientSocket, ready: boolean) =>
  socket.timeout(2_000).emitWithAck('lobby:set-ready', { ready });

beforeEach(async () => {
  if (postgresAvailable) {
    schema = await createTestSchema();
    await schema.migrate();
  }
});

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.disconnect();
  await Promise.all(apps.splice(0).map((app) => app.close()));
  if (postgresAvailable) await schema.dispose();
});

describe.skipIf(!postgresAvailable)('database migrations', () => {
  it('are idempotent and make the server ready', async () => {
    expect(await schema.migrate()).toEqual([]);
    const { app } = await startServer();
    const response = await app.inject({ method: 'GET', url: '/api/ready' });
    expect(response.json()).toEqual({ status: 'ready', database: 'connected' });
  });

  it('report pending migrations through readiness', async () => {
    const fresh = await createTestSchema();
    try {
      const database = fresh.open();
      const app = buildApp(config, { database });
      apps.push(app);
      const response = await app.inject({ method: 'GET', url: '/api/ready' });
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ status: 'not_ready', database: 'migrations_pending' });
      expect(await fresh.migrate()).toEqual(migrations.map((migration) => migration.version));
    } finally {
      await Promise.all(apps.splice(0).map((app) => app.close()));
      await fresh.dispose();
    }
  });
});

describe.skipIf(!postgresAvailable)('private lobby over HTTP', () => {
  it('creates a room whose host seat is returned only to the creator', async () => {
    const { address } = await startServer();
    const created = await createRoom(address, '  Шериф  ');

    expect(created.status).toBe(201);
    expect(created.response.headers.get('cache-control')).toBe('no-store');
    expect(created.body.roomCode).toMatch(/^[A-Z2-9]{10}$/);
    expect(created.body.seatToken).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const preview = await fetch(`${address}/api/rooms/${created.body.roomCode.toLowerCase()}`);
    const previewBody = (await preview.json()) as RoomPreview;
    expect(previewBody).toEqual({
      roomCode: created.body.roomCode,
      status: 'lobby',
      seatCount: 1,
      maxPlayers: 7,
      joinable: true,
    });
    const raw = JSON.stringify(previewBody);
    expect(raw).not.toContain(created.body.seatToken);
    expect(raw).not.toContain('Шериф');
  });

  it('validates names, room codes and origin', async () => {
    const { address } = await startServer();
    const { body: room } = await createRoom(address, 'Host');

    expect((await createRoom(address, '')).body).toEqual({ error: 'invalid_name' });
    expect((await post(address, '/api/rooms', ['Host'])).status).toBe(400);
    expect((await joinRoom(address, 'ZZZZZZZZZZ', 'Guest')).status).toBe(404);
    expect((await joinRoom(address, '../../etc', 'Guest')).status).toBe(404);
    expect((await joinRoom(address, room.roomCode, 'HOST')).body).toEqual({ error: 'name_taken' });

    const foreign = await post(
      address,
      '/api/rooms',
      { name: 'Evil' },
      {
        origin: 'https://evil.example',
      },
    );
    expect(foreign.status).toBe(403);
  });

  it('accepts seven seats and rejects the eighth', async () => {
    const { address } = await startServer();
    const { body: room } = await createRoom(address, 'P1');
    for (let index = 2; index <= 7; index += 1) {
      expect((await joinRoom(address, room.roomCode, `P${index}`)).status).toBe(201);
    }

    const eighth = await joinRoom(address, room.roomCode, 'P8');
    expect(eighth.status).toBe(409);
    expect(eighth.body).toEqual({ error: 'room_full' });
    const preview = (await (
      await fetch(`${address}/api/rooms/${room.roomCode}`)
    ).json()) as RoomPreview;
    expect(preview).toMatchObject({ seatCount: 7, joinable: false });
  });

  it('serializes concurrent joins without exceeding the seat limit', async () => {
    const { address } = await startServer();
    const { body: room } = await createRoom(address, 'Host');
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, index) => joinRoom(address, room.roomCode, `Guest ${index}`)),
    );

    expect(results.filter((result) => result.status === 201)).toHaveLength(6);
    expect(results.filter((result) => result.status === 409)).toHaveLength(4);

    const { lobby } = await connectAs(address, room);
    expect(lobby.seats.map((seat) => seat.seatIndex)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});

describe.skipIf(!postgresAvailable)('seat sessions over Socket.IO', () => {
  it('attaches an authenticated seat without exposing credentials', async () => {
    const { address } = await startServer();
    const { body: host } = await createRoom(address, 'Host');
    const { socket, lobby } = await connectAs(address, host);

    expect(lobby).toMatchObject({
      roomCode: host.roomCode,
      status: 'lobby',
      minPlayers: 4,
      maxPlayers: 7,
      canStart: false,
      seats: [
        {
          seatId: host.seatId,
          seatIndex: 0,
          name: 'Host',
          ready: false,
          host: true,
          connected: true,
        },
      ],
    });

    const joined = nextState(socket, (state) => state.seats.length === 2);
    const { body: guest } = await joinRoom(address, host.roomCode, 'Guest');
    const updated = await joined;
    const raw = JSON.stringify(updated);
    expect(raw).not.toContain(host.seatToken);
    expect(raw).not.toContain(guest.seatToken);
    expect(raw).not.toMatch(/token|hash/i);
    expect(updated.seats[1]).toMatchObject({ name: 'Guest', host: false, connected: false });
  });

  it('rejects wrong, malformed and cross-room credentials without attaching', async () => {
    const { address } = await startServer();
    const { body: roomA } = await createRoom(address, 'Alice');
    const { body: roomB } = await createRoom(address, 'Bob');
    const socket = await connect(address);
    let leaked = false;
    socket.on('lobby:state', () => {
      leaked = true;
    });

    const forged = { ...roomA, seatToken: 'A'.repeat(43) };
    expect(await attach(socket, forged)).toEqual({ ok: false, error: 'invalid_session' });
    expect(await attach(socket, { ...roomA, seatToken: 'short' })).toEqual({
      ok: false,
      error: 'invalid_session',
    });
    expect(await attach(socket, { roomCode: roomB.roomCode, seatToken: roomA.seatToken })).toEqual({
      ok: false,
      error: 'invalid_session',
    });
    expect(await socket.timeout(2_000).emitWithAck('lobby:attach', 'junk' as never)).toEqual({
      ok: false,
      error: 'invalid_request',
    });
    expect(await setReady(socket, true)).toEqual({ ok: false, error: 'not_attached' });

    // A real seat changing state in room A must not reach the unauthenticated socket.
    const { socket: alice } = await connectAs(address, roomA);
    await setReady(alice, true);
    expect(leaked).toBe(false);
  });

  it('restores the same seat after a refresh instead of creating a new one', async () => {
    const { address } = await startServer();
    const { body: host } = await createRoom(address, 'Host');
    const { body: guest } = await joinRoom(address, host.roomCode, 'Guest');
    const { socket: hostSocket } = await connectAs(address, host);
    const first = await connectAs(address, guest);
    expect(await setReady(first.socket, true)).toEqual({ ok: true });

    const offline = nextState(hostSocket, (state) => state.seats[1]?.connected === false);
    first.socket.disconnect();
    await offline;

    const online = nextState(hostSocket, (state) => state.seats[1]?.connected === true);
    const second = await connectAs(address, guest);
    await online;
    expect(second.lobby.seats).toHaveLength(2);
    expect(second.lobby.seats[1]).toMatchObject({ seatId: guest.seatId, ready: true });
  });

  it('keeps seats and readiness across a server restart', async () => {
    const first = await startServer();
    const { body: host } = await createRoom(first.address, 'Host');
    const { socket } = await connectAs(first.address, host);
    await setReady(socket, true);
    await first.app.close();

    const second = await startServer();
    const { lobby } = await connectAs(second.address, host);
    expect(lobby.seats).toEqual([
      expect.objectContaining({ seatId: host.seatId, ready: true, host: true }),
    ]);
  });

  it('shares one seat between tabs and revokes every tab on leave', async () => {
    const { address } = await startServer();
    const { body: host } = await createRoom(address, 'Host');
    const { body: guest } = await joinRoom(address, host.roomCode, 'Guest');
    const { socket: hostSocket } = await connectAs(address, host);
    const tabA = await connectAs(address, guest);
    const tabB = await connectAs(address, guest);
    expect(tabB.lobby.seats).toHaveLength(2);

    const seenByB = nextState(tabB.socket, (state) => state.seats[1]?.ready === true);
    expect(await setReady(tabA.socket, true)).toEqual({ ok: true });
    await seenByB;

    const closedA = nextClosed(tabA.socket);
    const closedB = nextClosed(tabB.socket);
    const hostSees = nextState(hostSocket, (state) => state.seats.length === 1);
    expect(await tabA.socket.timeout(2_000).emitWithAck('lobby:leave')).toEqual({ ok: true });
    expect(await closedA).toBe('left');
    expect(await closedB).toBe('left');
    await hostSees;

    expect(await setReady(tabB.socket, false)).toEqual({ ok: false, error: 'not_attached' });
    const reuse = await connect(address);
    expect(await attach(reuse, guest)).toEqual({ ok: false, error: 'invalid_session' });
  });

  it('computes readiness for a classic start with 4–7 ready players', async () => {
    const { address } = await startServer();
    const { body: host } = await createRoom(address, 'P1');
    const others = [];
    for (let index = 2; index <= 4; index += 1) {
      others.push((await joinRoom(address, host.roomCode, `P${index}`)).body);
    }
    const players = [await connectAs(address, host)];
    for (const credentials of others) players.push(await connectAs(address, credentials));
    const [hostPlayer] = players;
    if (hostPlayer === undefined) throw new Error('missing host');

    expect(
      await hostPlayer.socket
        .timeout(2_000)
        .emitWithAck('lobby:set-ready', { ready: 'yes' } as never),
    ).toEqual({ ok: false, error: 'invalid_request' });

    for (const player of players.slice(0, 3)) await setReady(player.socket, true);
    expect(players.length).toBe(4);
    const allReady = nextState(hostPlayer.socket, (state) => state.canStart);
    await setReady(players[3]!.socket, true);
    const state = await allReady;
    expect(state.seats.every((seat) => seat.ready)).toBe(true);

    const notReady = nextState(hostPlayer.socket, (next) => !next.canStart);
    await setReady(players[1]!.socket, false);
    await notReady;
  });

  it('lets only the host remove another seat, and passes host on leave', async () => {
    const { address } = await startServer();
    const { body: host } = await createRoom(address, 'Host');
    const { body: second } = await joinRoom(address, host.roomCode, 'Second');
    const { body: third } = await joinRoom(address, host.roomCode, 'Third');
    const hostSession = await connectAs(address, host);
    const secondSession = await connectAs(address, second);
    const thirdSession = await connectAs(address, third);

    const kick = (socket: ClientSocket, seatId: string) =>
      socket.timeout(2_000).emitWithAck('lobby:kick', { seatId });

    expect(await kick(secondSession.socket, third.seatId)).toEqual({
      ok: false,
      error: 'forbidden',
    });
    expect(await kick(hostSession.socket, host.seatId)).toEqual({ ok: false, error: 'forbidden' });
    expect(await kick(hostSession.socket, 'not-a-uuid')).toEqual({
      ok: false,
      error: 'invalid_request',
    });

    const kicked = nextClosed(thirdSession.socket);
    expect(await kick(hostSession.socket, third.seatId)).toEqual({ ok: true });
    expect(await kicked).toBe('kicked');
    expect(await attach(await connect(address), third)).toEqual({
      ok: false,
      error: 'invalid_session',
    });

    const promoted = nextState(secondSession.socket, (state) => state.seats.length === 1);
    expect(await hostSession.socket.timeout(2_000).emitWithAck('lobby:leave')).toEqual({
      ok: true,
    });
    expect((await promoted).seats[0]).toMatchObject({ seatId: second.seatId, host: true });
  });
});
