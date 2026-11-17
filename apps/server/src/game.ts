import type {
  ClientToServerEvents,
  GameCommandResult,
  GameSyncResult,
  GameView,
  ServerToClientEvents,
} from '@bang/contracts';
import type { FastifyInstance } from 'fastify';
import type { Server, Socket } from 'socket.io';
import type { SocketData } from './lobby.js';
import type { SeatSession } from './lobby-store.js';
import type { GameStore } from './game-store.js';
import {
  parseGameAbort,
  parseGameCommand,
  parseGameStart,
  parseGameSync,
} from './game-validation.js';

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, object, SocketData>;
type GameServer = Server<ClientToServerEvents, ServerToClientEvents, object, SocketData>;
export interface GameTransport {
  syncForSocket(
    socket: GameSocket,
    session: SeatSession,
    matchId?: string,
  ): Promise<GameSyncResult>;
  publish(roomId: string): Promise<void>;
}

export function registerGame({
  app,
  io,
  store,
}: {
  app: FastifyInstance;
  io: GameServer;
  store: GameStore | undefined;
}): GameTransport {
  function logFailure(operation: string) {
    // Raw errors may carry private JSON or SQL parameters. Never log them.
    app.log.error({ operation }, 'Game operation failed.');
  }

  async function syncForSocket(
    socket: GameSocket,
    session: SeatSession,
    matchId?: string,
  ): Promise<GameSyncResult> {
    if (store === undefined) return { ok: false, error: 'unavailable' };
    const result = await store.sync(session, matchId);
    if (!result.ok) return result;
    if (socket.data.session !== session) return { ok: false, error: 'not_attached' };
    const connected = (seatId: string) =>
      (io.sockets.adapter.rooms.get(`seat:${seatId}`)?.size ?? 0) > 0;
    const required = result.game.pending?.ownerSeatId;
    const game: GameView = {
      ...result.game,
      roomCode: result.roomCode,
      presence: result.game.players.map(({ seatId }) => ({ seatId, connected: connected(seatId) })),
      waitingFor:
        result.game.status === 'active' && required !== undefined && !connected(required)
          ? [required]
          : [],
      deliverySequence: (socket.data.deliverySequence ?? 0) + 1,
    };
    socket.data.deliverySequence = game.deliverySequence;
    return { ok: true, game };
  }

  async function publish(roomId: string) {
    const ids = [...(io.sockets.adapter.rooms.get(`room:${roomId}`) ?? [])];
    await Promise.all(
      ids.map(async (id) => {
        const socket = io.sockets.sockets.get(id);
        const session = socket?.data.session;
        if (socket === undefined || session === undefined || session.roomId !== roomId) return;
        try {
          const result = await syncForSocket(socket, session);
          if (result.ok && socket.data.session === session) socket.emit('game:state', result.game);
        } catch {
          logFailure('publish-game');
        }
      }),
    );
  }

  io.on('connection', (socket) => {
    async function run(ack: unknown, operation: 'start' | 'command' | 'abort', raw: unknown) {
      if (typeof ack !== 'function') return;
      const reply = ack as (result: GameCommandResult) => void;
      if (store === undefined) return reply({ ok: false, error: 'unavailable' });
      const session = socket.data.session;
      if (session === undefined) return reply({ ok: false, error: 'not_attached' });
      const request =
        operation === 'start'
          ? parseGameStart(raw)
          : operation === 'abort'
            ? parseGameAbort(raw)
            : parseGameCommand(raw);
      if (request === undefined) return reply({ ok: false, error: 'invalid_request' });
      try {
        // Store returns only after the transaction commits. Acks never carry a private view.
        const result = await store[operation](session, request);
        reply(result);
        if (result.ok) await publish(session.roomId);
      } catch {
        logFailure(`game-${operation}`);
        reply({ ok: false, error: 'unavailable' });
      }
    }

    socket.on('game:start', (request, ack) => run(ack, 'start', request));
    socket.on('game:command', (request, ack) => run(ack, 'command', request));
    socket.on('game:abort', (request, ack) => run(ack, 'abort', request));
    socket.on('game:sync', async (raw, ack) => {
      if (typeof ack !== 'function') return;
      const request = parseGameSync(raw);
      if (request === undefined) return ack({ ok: false, error: 'invalid_request' });
      const session = socket.data.session;
      if (session === undefined) return ack({ ok: false, error: 'not_attached' });
      try {
        ack(await syncForSocket(socket, session, request.matchId));
      } catch {
        logFailure('game-sync');
        ack({ ok: false, error: 'unavailable' });
      }
    });
  });

  return { syncForSocket, publish };
}
