import type {
  ClientToServerEvents,
  GameCommandResult,
  GameView,
  LobbyResult,
  SeatCredentials,
  ServerToClientEvents,
} from '@bang/contracts';
import { io as createClient, type Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { createPostgresGameStore } from '../src/game-store.js';
import { createPostgresLobbyStore } from '../src/lobby-store.js';
import { fixtureEngine } from './game-fixture.js';
import * as classic from '@bang/game-core';
import { chooseTraceIntent } from './game-trace.js';
import { createTestSchema, postgresAvailable, type TestSchema } from './postgres.js';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
const config = readConfig({ LOG_LEVEL: 'silent' });
const apps: ReturnType<typeof buildApp>[] = [];
const sockets: ClientSocket[] = [];
let schema: TestSchema;

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

async function boot(realEngine = false) {
  const database = schema.open();
  const int = vi.fn((max: number) => max - 1);
  const gameStore = realEngine
    ? createPostgresGameStore(database.pool, classic, { random: { int } })
    : createPostgresGameStore(database.pool, fixtureEngine, { random: { int } });
  const lobby = createPostgresLobbyStore(database.pool);
  const app = buildApp(config, { database, lobbyStore: lobby, gameStore });
  apps.push(app);
  const address = await app.listen({ host: '127.0.0.1', port: 0 });
  return { database, gameStore, lobby, app, address, int };
}

async function connect(address: string, credentials?: SeatCredentials) {
  const socket: ClientSocket = createClient(address, {
    transports: ['websocket'],
    reconnection: false,
    extraHeaders: { Origin: config.webOrigin },
  });
  sockets.push(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  let attached: LobbyResult | undefined;
  if (credentials !== undefined)
    attached = await socket.timeout(2000).emitWithAck('lobby:attach', {
      roomCode: credentials.roomCode,
      seatToken: credentials.seatToken,
    });
  return { socket, attached };
}

function nextGame(socket: ClientSocket, predicate: (view: GameView) => boolean = () => true) {
  return new Promise<GameView>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('game:state', listener);
      reject(new Error('Missing private game state.'));
    }, 2000);
    const listener = (view: GameView) => {
      if (predicate(view)) {
        clearTimeout(timer);
        socket.off('game:state', listener);
        resolve(view);
      }
    };
    socket.on('game:state', listener);
  });
}

async function readyPlayers(f: Awaited<ReturnType<typeof boot>>, count = 4) {
  const host = await f.lobby.createRoom('Host');
  if (!host.ok) throw new Error('Fixture room failed.');
  const credentials = [host.credentials];
  for (let i = 1; i < count; i++) {
    const guest = await f.lobby.joinRoom(host.credentials.roomCode, `Guest ${i}`);
    if (!guest.ok) throw new Error('Fixture guest failed.');
    credentials.push(guest.credentials);
  }
  for (const c of credentials)
    await f.lobby.setReady({ roomId: host.roomId, roomCode: c.roomCode, seatId: c.seatId }, true);
  const players = [];
  for (const c of credentials) players.push({ ...(await connect(f.address, c)), credentials: c });
  const snapshot = await f.lobby.getLobby(host.roomId);
  return { players, roomId: host.roomId, revision: snapshot!.revision };
}

describe.skipIf(!postgresAvailable)(
  'authenticated game transport (synthetic rules fixture)',
  () => {
    it('starts to private seat views and never sends hidden snapshot/other hands in events or receipts', async () => {
      const f = await boot();
      const { players, revision } = await readyPlayers(f);
      const states = players.map(({ socket }) => nextGame(socket));
      expect(
        await players[1]!.socket
          .timeout(2000)
          .emitWithAck('game:start', { commandId: 'guest', expectedRevision: revision }),
      ).toEqual({ ok: false, error: 'forbidden' });
      const receipt = await players[0]!.socket
        .timeout(2000)
        .emitWithAck('game:start', { commandId: 'start', expectedRevision: revision });
      expect(receipt).toMatchObject({ ok: true, revision: 1 });
      expect(Object.keys(receipt).sort()).toEqual([
        'commandId',
        'matchId',
        'ok',
        'revision',
        'status',
      ]);
      const views = await Promise.all(states);
      views.forEach((view, i) => {
        expect(view.ownSeatId).toBe(players[i]!.credentials.seatId);
        expect(view.ownHand[0]?.id).toBe(`PRIVATE_HAND_${players[i]!.credentials.seatId}`);
        const json = JSON.stringify(view);
        expect(json).not.toContain('PRIVATE_DECK_CANARY');
        players.forEach((player, j) => {
          if (i !== j) expect(json).not.toContain(`PRIVATE_HAND_${player.credentials.seatId}`);
          expect(json).not.toContain(player.credentials.seatToken);
        });
        expect(view.presence.every(({ connected }) => connected)).toBe(true);
      });
      const sync = await players[0]!.socket.timeout(2000).emitWithAck('game:sync', {});
      expect(sync).toMatchObject({
        ok: true,
        game: { revision: 1, ownSeatId: players[0]!.credentials.seatId },
      });
      if (sync.ok) expect(sync.game.deliverySequence).toBeGreaterThan(views[0]!.deliverySequence);
    });

    it('waits for required actors, counts multiple tabs, and restores exact decisions after server restart', async () => {
      const f = await boot();
      const { players, revision } = await readyPlayers(f);
      const host = players[0]!;
      const guest = players[1]!;
      const first = nextGame(guest.socket);
      const started = await host.socket
        .timeout(2000)
        .emitWithAck('game:start', { commandId: 'start', expectedRevision: revision });
      if (!started.ok) throw new Error('Start failed.');
      const initial = await first;
      const secondTab = await connect(f.address, host.credentials);
      expect(secondTab.attached).toMatchObject({ ok: true, game: { revision: 1 } });
      host.socket.disconnect();
      const sync = await secondTab.socket.timeout(2000).emitWithAck('game:sync', {});
      expect(sync).toMatchObject({ ok: true, game: { waitingFor: [] } });
      const waiting = nextGame(guest.socket, (view) =>
        view.waitingFor.includes(host.credentials.seatId),
      );
      secondTab.socket.disconnect();
      const paused = await waiting;
      expect(paused.pending).toEqual(initial.pending);
      expect(paused.revision).toBe(1);
      expect(f.int).toHaveBeenCalledTimes(1);
      await f.app.close();
      const restarted = await boot();
      const restored = await connect(restarted.address, host.credentials);
      expect(restored.attached).toMatchObject({
        ok: true,
        game: { revision: 1, pending: initial.pending },
      });
      expect(restarted.int).not.toHaveBeenCalled();
      const envelope = {
        commandId: 'move',
        expectedRevision: 1,
        matchId: started.matchId,
        intent: { type: 'end_turn' as const },
      };
      const accepted = await restored.socket.timeout(2000).emitWithAck('game:command', envelope);
      expect(accepted).toMatchObject({ ok: true, revision: 2 });
      await restarted.app.close();
      const third = await boot();
      const replay = await connect(third.address, host.credentials);
      expect(await replay.socket.timeout(2000).emitWithAck('game:command', envelope)).toEqual(
        accepted,
      );
      expect(third.int).not.toHaveBeenCalled();
      const current = await replay.socket.timeout(2000).emitWithAck('game:sync', {});
      expect(current).toMatchObject({
        ok: true,
        game: { revision: 2, waitingFor: [guest.credentials.seatId] },
      });
    });

    it('rejects unauthenticated/malformed/stale commands and recovers terminal abort through attach', async () => {
      const f = await boot();
      const outsider = await connect(f.address);
      expect(await outsider.socket.timeout(2000).emitWithAck('game:sync', {})).toEqual({
        ok: false,
        error: 'not_attached',
      });
      const { players, revision } = await readyPlayers(f);
      const host = players[0]!;
      const started = await host.socket
        .timeout(2000)
        .emitWithAck('game:start', { commandId: 'start', expectedRevision: revision });
      if (!started.ok) throw new Error('Start failed.');
      const invalid = {
        commandId: 'bad',
        expectedRevision: 1,
        matchId: started.matchId,
        intent: { type: 'respond', decisionId: 'd', method: ['barrel'] },
      };
      expect(await host.socket.timeout(2000).emitWithAck('game:command', invalid as never)).toEqual(
        { ok: false, error: 'invalid_request' },
      );
      expect(
        await host.socket.timeout(2000).emitWithAck('game:command', {
          commandId: 'stale',
          expectedRevision: 0,
          matchId: started.matchId,
          intent: { type: 'end_turn' },
        }),
      ).toMatchObject({ ok: false, error: 'stale_revision' });
      expect(f.int).toHaveBeenCalledTimes(1);
      const request = { commandId: 'abort', expectedRevision: 1, matchId: started.matchId };
      expect(await players[1]!.socket.timeout(2000).emitWithAck('game:abort', request)).toEqual({
        ok: false,
        error: 'forbidden',
      });
      const receipt = await host.socket.timeout(2000).emitWithAck('game:abort', request);
      expect(receipt).toMatchObject({ ok: true, status: 'aborted', revision: 2 });
      expect(await host.socket.timeout(2000).emitWithAck('game:abort', request)).toEqual(receipt);
      const refreshed = await connect(f.address, host.credentials);
      expect(refreshed.attached).toMatchObject({
        ok: true,
        lobby: { status: 'aborted', canStart: false },
        game: { status: 'aborted', outcome: { winner: null, winnerSeatIds: [] } },
      });
      const lobbyReady = await host.socket
        .timeout(2000)
        .emitWithAck('lobby:set-ready', { ready: true });
      expect(lobbyReady).toEqual({ ok: false, error: 'room_closed' });
    });

    it('fails closed without exposing corrupt saved state through sync or attach', async () => {
      const f = await boot();
      const logged = vi.spyOn(f.app.log, 'error');
      const { players, revision } = await readyPlayers(f);
      const host = players[0]!;
      const started = await host.socket
        .timeout(2000)
        .emitWithAck('game:start', { commandId: 'start', expectedRevision: revision });
      if (!started.ok) throw new Error('Start failed.');
      await f.database.pool.query(
        'UPDATE matches SET state = \'{"secret":"PRIVATE_CANARY"}\'::jsonb WHERE id = $1',
        [started.matchId],
      );
      expect(await host.socket.timeout(2000).emitWithAck('game:sync', {})).toEqual({
        ok: false,
        error: 'unavailable',
      });
      const refresh = await connect(f.address, host.credentials);
      expect(refresh.attached).toEqual({ ok: false, error: 'unavailable' });
      const command: GameCommandResult = await host.socket
        .timeout(2000)
        .emitWithAck('game:command', {
          commandId: 'after-corruption',
          expectedRevision: 1,
          matchId: started.matchId,
          intent: { type: 'end_turn' },
        });
      expect(command).toEqual({ ok: false, error: 'unavailable' });
      expect(f.int).toHaveBeenCalledTimes(1);
      expect(logged).toHaveBeenCalled();
      expect(JSON.stringify(logged.mock.calls)).not.toContain('PRIVATE_CANARY');
      expect(logged.mock.calls.every((args) => args.every((arg) => !(arg instanceof Error)))).toBe(
        true,
      );
    });
  },
);

describe.skipIf(!postgresAvailable)(
  'complete real classic matches over PostgreSQL and authenticated sockets',
  () => {
    it.each([4, 5, 6, 7])(
      'finishes an actual %i-player deal using projected legal actions',
      async (count) => {
        let server = await boot(true);
        const { players, revision } = await readyPlayers(server, count);
        const host = players[0]!;
        const start = { commandId: 'start', expectedRevision: revision };
        const started = await host.socket.timeout(2000).emitWithAck('game:start', start);
        if (!started.ok) throw new Error(`Start failed: ${started.error}`);
        let steps = 0;
        let game: GameView | undefined;
        for (; steps < 1500; steps++) {
          const current = await host.socket.timeout(2000).emitWithAck('game:sync', {});
          if (!current.ok) throw new Error(`Sync failed: ${current.error}`);
          const live: GameView = current.game;
          game = live;
          expect(live.publicResolutions.length).toBeLessThanOrEqual(64);
          for (const entry of live.publicResolutions)
            if (entry.card !== undefined) expect(entry.card).not.toHaveProperty('id');
          if (live.status !== 'active') break;
          const actor = players.find(
            (player) => player.credentials.seatId === live.pending?.ownerSeatId,
          );
          if (actor === undefined)
            throw new Error(`Missing required actor at ${live.pending?.kind}`);
          const own = await actor.socket.timeout(2000).emitWithAck('game:sync', {});
          if (!own.ok) throw new Error('Actor sync failed.');
          const intent = chooseTraceIntent(own.game);
          const envelope = {
            commandId: `trace-${steps}`,
            expectedRevision: own.game.revision,
            matchId: own.game.matchId,
            intent,
          };
          const accepted = await actor.socket.timeout(2000).emitWithAck('game:command', envelope);
          if (!accepted.ok)
            throw new Error(`Trace rejected ${JSON.stringify(intent)}: ${accepted.error}`);
          if (steps % 17 === 0) {
            const entropy = server.int.mock.calls.length;
            expect(await actor.socket.timeout(2000).emitWithAck('game:command', envelope)).toEqual(
              accepted,
            );
            expect(server.int).toHaveBeenCalledTimes(entropy);
          }
          if (steps === 10) {
            const saved = await host.socket.timeout(2000).emitWithAck('game:sync', {});
            await server.app.close();
            server = await boot(true);
            for (const player of players) {
              const restored = await connect(server.address, player.credentials);
              player.socket = restored.socket;
            }
            const restored = await host.socket.timeout(2000).emitWithAck('game:sync', {});
            if (!saved.ok || !restored.ok) throw new Error('Restart sync failed.');
            expect(restored.game.pending).toEqual(saved.game.pending);
            expect(restored.game.revision).toBe(saved.game.revision);
            expect(server.int).not.toHaveBeenCalled();
          }
        }
        expect(steps).toBeLessThan(1500);
        expect(game?.status).toBe('finished');
        expect(game?.outcome?.status).toBe('finished');
        expect(game?.outcome?.winnerSeatIds.length).toBeGreaterThan(0);
        expect(game?.pending).toBeNull();
        expect(await host.socket.timeout(2000).emitWithAck('game:start', start)).toEqual(started);
        const row = (
          await server.database.pool.query<{ state: unknown }>(
            'SELECT state FROM matches WHERE id = $1',
            [started.matchId],
          )
        ).rows[0]!;
        const state = classic.decodeMatch(row.state);
        expect(state.status).toBe('finished');
        expect(state.outcome).toEqual(game?.outcome);
        expect(
          (
            await server.database.pool.query<{ count: number }>(
              'SELECT count(*)::int AS count FROM game_command_receipts',
            )
          ).rows[0]?.count,
        ).toBe(steps + 1);
      },
      30000,
    );
  },
);

describe.skipIf(!postgresAvailable)('overdue decision poller', () => {
  it('passes the grace period to the store and publishes every advanced room', async () => {
    const database = schema.open();
    const lobby = createPostgresLobbyStore(database.pool);
    const store = createPostgresGameStore(database.pool, fixtureEngine);
    let advanced: string[] = [];
    const resolveOverdue = vi.fn(async () => advanced.splice(0));
    const app = buildApp(config, {
      database,
      lobbyStore: lobby,
      gameStore: { ...store, resolveOverdue },
      overdue: { graceMs: 1234, pollMs: 20 },
    });
    apps.push(app);
    const address = await app.listen({ host: '127.0.0.1', port: 0 });
    const f = await readyPlayers({ database, gameStore: store, lobby, app, address, int: vi.fn() });
    const host = f.players[0]!;
    const initial = nextGame(f.players[1]!.socket);
    const started = await host.socket
      .timeout(2000)
      .emitWithAck('game:start', { commandId: 'start', expectedRevision: f.revision });
    expect(started.ok).toBe(true);
    await initial;
    await vi.waitFor(() => expect(resolveOverdue).toHaveBeenCalledWith(1234));
    const published = nextGame(f.players[1]!.socket);
    advanced = [f.roomId];
    expect((await published).status).toBe('active');
  });
});

describe.skipIf(!postgresAvailable)('real mass response transport', () => {
  it('keeps future preparation private and provisional while the current actor is absent, then resumes clockwise after restart', async () => {
    let server = await boot(true);
    const { players, revision } = await readyPlayers(server);
    const host = players[0]!;
    const started = await host.socket
      .timeout(2000)
      .emitWithAck('game:start', { commandId: 'start', expectedRevision: revision });
    if (!started.ok) throw new Error('Start failed.');
    const state = (
      await server.database.pool.query<{ state: classic.MatchState }>(
        'SELECT state FROM matches WHERE id = $1',
        [started.matchId],
      )
    ).rows[0]!.state;
    for (const player of state.players) {
      player.hand = [];
      player.equipment = [];
    }
    state.deck = classic.CLASSIC_DECK.map((card) => ({ ...card }));
    state.discard = [];
    const take = (kind: classic.CardKind) =>
      state.deck.splice(
        state.deck.findIndex((card) => card.kind === kind),
        1,
      )[0]!;
    const gatling = take('gatling');
    const missed = take('missed');
    state.players[0]!.hand.push(gatling);
    state.players[2]!.hand.push(missed);
    state.turn = { seatId: host.credentials.seatId, phase: 'play', number: 1, bangsPlayed: 0 };
    state.pending = {
      id: `${state.matchId}:fixture`,
      kind: 'turn',
      ownerSeatId: host.credentials.seatId,
    };
    classic.decodeMatch(state);
    await server.database.pool.query('UPDATE matches SET state = $2::jsonb WHERE id = $1', [
      state.matchId,
      JSON.stringify(state),
    ]);
    expect(
      await host.socket.timeout(2000).emitWithAck('game:command', {
        commandId: 'mass',
        expectedRevision: 1,
        matchId: state.matchId,
        intent: { type: 'play', cardId: gatling.id },
      }),
    ).toMatchObject({ ok: true, revision: 2 });
    const future = players[2]!;
    const first = await future.socket.timeout(2000).emitWithAck('game:sync', {});
    if (!first.ok || first.game.preparation === null) throw new Error('Missing preparation.');
    expect(first.game.preparation.isCurrent).toBe(false);
    const draft = first.game.preparation.actions.find(
      (action: classic.GameActionOption) =>
        action.intent.type === 'respond' && action.intent.method === 'card',
    )!;
    const guard = first.game.preparation.guard;
    const before = (
      await server.database.pool.query('SELECT state FROM matches WHERE id = $1', [state.matchId])
    ).rows[0]!.state;
    const entropy = server.int.mock.calls.length;
    const waiting = nextGame(host.socket, (view) =>
      view.waitingFor.includes(players[1]!.credentials.seatId),
    );
    players[1]!.socket.disconnect();
    const paused = await waiting;
    expect(paused.massEffect?.currentSeatId).toBe(players[1]!.credentials.seatId);
    expect(JSON.stringify(paused)).not.toContain(missed.id);
    expect(
      await future.socket.timeout(2000).emitWithAck('game:command', {
        commandId: 'premature',
        expectedRevision: 2,
        matchId: state.matchId,
        intent: draft.intent,
      }),
    ).toEqual({ ok: false, error: 'wrong_actor' });
    expect(
      (await server.database.pool.query('SELECT state FROM matches WHERE id = $1', [state.matchId]))
        .rows[0]!.state,
    ).toEqual(before);
    expect(server.int).toHaveBeenCalledTimes(entropy);
    const defender = await connect(server.address, players[1]!.credentials);
    players[1]!.socket = defender.socket;
    const own = await defender.socket.timeout(2000).emitWithAck('game:sync', {});
    if (!own.ok) throw new Error('Missing current defense.');
    expect(
      await defender.socket.timeout(2000).emitWithAck('game:command', {
        commandId: 'decline',
        expectedRevision: 2,
        matchId: state.matchId,
        intent: { type: 'respond', decisionId: own.game.pending!.id, method: 'decline' },
      }),
    ).toMatchObject({ ok: true, revision: 3 });
    const saved = await future.socket.timeout(2000).emitWithAck('game:sync', {});
    if (!saved.ok) throw new Error('Missing next defense.');
    expect(saved.game.preparation).toMatchObject({ isCurrent: true, guard });
    expect(saved.game.massEffect?.resolvedSeatIds).toEqual([players[1]!.credentials.seatId]);
    await server.app.close();
    server = await boot(true);
    for (const player of players)
      player.socket = (await connect(server.address, player.credentials)).socket;
    const restored = await future.socket.timeout(2000).emitWithAck('game:sync', {});
    if (!restored.ok) throw new Error('Mass restore failed.');
    expect(restored.game.pending).toEqual(saved.game.pending);
    expect(restored.game.massEffect).toEqual(saved.game.massEffect);
    expect(restored.game.preparation).toEqual(saved.game.preparation);
    const response = {
      type: 'respond' as const,
      decisionId: restored.game.pending!.id,
      method: 'card' as const,
      cardId: missed.id,
    };
    expect(
      await future.socket.timeout(2000).emitWithAck('game:command', {
        commandId: 'stale',
        expectedRevision: 2,
        matchId: state.matchId,
        intent: response,
      }),
    ).toMatchObject({ ok: false, error: 'stale_revision' });
    expect(
      await future.socket.timeout(2000).emitWithAck('game:command', {
        commandId: 'respond',
        expectedRevision: 3,
        matchId: state.matchId,
        intent: response,
      }),
    ).toMatchObject({ ok: true, revision: 4 });
    expect(server.int).not.toHaveBeenCalled();
    const result = await future.socket.timeout(2000).emitWithAck('game:sync', {});
    expect(result).toMatchObject({
      ok: true,
      game: {
        ownHand: [],
        pending: { ownerSeatId: players[3]!.credentials.seatId },
        massEffect: {
          resolvedSeatIds: [players[1]!.credentials.seatId, future.credentials.seatId],
        },
      },
    });
  });
});
