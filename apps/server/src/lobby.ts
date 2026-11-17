import {
  canStartClassicMatch,
  CLASSIC_PLAYER_LIMITS,
  CLASSIC_RULESET_ID,
  type ClientToServerEvents,
  type ErrorResponse,
  type LobbyClosedReason,
  type LobbyCommandResult,
  type LobbyErrorCode,
  type LobbyResult,
  type LobbyView,
  type ServerToClientEvents,
} from '@bang/contracts';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Server, Socket } from 'socket.io';
import type { LobbySnapshot, LobbyStore, SeatSession } from './lobby-store.js';
import type { GameTransport } from './game.js';
import {
  isPlainObject,
  parseDisplayName,
  parseRoomCode,
  parseSeatId,
  parseSeatToken,
} from './lobby-validation.js';

export interface SocketData {
  session?: SeatSession | undefined;
  deliverySequence?: number;
}

type LobbyServer = Server<ClientToServerEvents, ServerToClientEvents, object, SocketData>;
type LobbySocket = Socket<ClientToServerEvents, ServerToClientEvents, object, SocketData>;

const HTTP_STATUS: Record<LobbyErrorCode, number> = {
  invalid_request: 400,
  invalid_name: 400,
  name_taken: 409,
  room_not_found: 404,
  room_full: 409,
  room_closed: 409,
  invalid_session: 401,
  not_attached: 401,
  forbidden: 403,
  unavailable: 503,
};

const roomChannel = (roomId: string) => `room:${roomId}`;
const seatChannel = (seatId: string) => `seat:${seatId}`;

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : undefined;
}

interface LobbyOptions {
  app: FastifyInstance;
  io: LobbyServer;
  store: LobbyStore | undefined;
  webOrigin: string;
  game?: GameTransport;
}

export function registerLobby({ app, io, store, webOrigin, game }: LobbyOptions) {
  const isConnected = (seatId: string) =>
    (io.sockets.adapter.rooms.get(seatChannel(seatId))?.size ?? 0) > 0;

  function toView(snapshot: LobbySnapshot): LobbyView {
    return {
      roomCode: snapshot.roomCode,
      rulesetId: CLASSIC_RULESET_ID,
      status: snapshot.status,
      revision: snapshot.revision,
      minPlayers: CLASSIC_PLAYER_LIMITS.min,
      maxPlayers: CLASSIC_PLAYER_LIMITS.max,
      seats: snapshot.seats.map((seat) => ({
        seatId: seat.seatId,
        seatIndex: seat.seatIndex,
        name: seat.name,
        ready: seat.ready,
        host: seat.seatId === snapshot.hostSeatId,
        connected: isConnected(seat.seatId),
      })),
      canStart:
        snapshot.status === 'lobby' &&
        canStartClassicMatch(snapshot.seats.map((seat) => seat.ready)),
    };
  }

  function logFailure(operation: string, error: unknown) {
    // Never log payloads: they may contain seat tokens.
    app.log.error({ operation, code: errorCode(error) }, 'Lobby operation failed.');
  }

  /** Sends a fresh authoritative view to every socket attached to the room. */
  async function publish(roomId: string) {
    try {
      const snapshot = await store?.getLobby(roomId);
      if (snapshot !== undefined) {
        if (snapshot.status === 'lobby')
          io.to(roomChannel(roomId)).emit('lobby:state', toView(snapshot));
        else await game?.publish(roomId);
      }
    } catch (error) {
      logFailure('publish', error);
    }
  }

  function detach(socket: LobbySocket) {
    const session = socket.data.session;
    if (session === undefined) return undefined;
    socket.data.session = undefined;
    void socket.leave(roomChannel(session.roomId));
    void socket.leave(seatChannel(session.seatId));
    return session;
  }

  /** Revokes every connection (all tabs) attached to a seat that no longer exists. */
  function closeSeat(seatId: string, reason: LobbyClosedReason) {
    const ids = [...(io.sockets.adapter.rooms.get(seatChannel(seatId)) ?? [])];
    for (const id of ids) {
      const socket = io.sockets.sockets.get(id);
      if (socket === undefined) continue;
      detach(socket);
      socket.emit('lobby:closed', { reason });
    }
  }

  // HTTP: credential issuance and a minimal public preview for invitation links.

  function sendError(reply: FastifyReply, error: LobbyErrorCode) {
    return reply.code(HTTP_STATUS[error]).send({ error } satisfies ErrorResponse);
  }

  function rejectForeignOrigin(request: FastifyRequest, reply: FastifyReply) {
    const origin = request.headers.origin;
    if (origin !== undefined && origin !== webOrigin) {
      void sendError(reply, 'forbidden');
      return true;
    }
    return false;
  }

  const bodyLimit = 1_024;

  app.post('/api/rooms', { bodyLimit }, async (request, reply) => {
    if (rejectForeignOrigin(request, reply)) return reply;
    if (store === undefined) return sendError(reply, 'unavailable');
    if (!isPlainObject(request.body)) return sendError(reply, 'invalid_request');
    const name = parseDisplayName(request.body['name']);
    if (name === undefined) return sendError(reply, 'invalid_name');

    try {
      const result = await store.createRoom(name);
      if (!result.ok) return sendError(reply, result.error);
      return reply.code(201).header('cache-control', 'no-store').send(result.credentials);
    } catch (error) {
      logFailure('create-room', error);
      return sendError(reply, 'unavailable');
    }
  });

  app.post<{ Params: { code: string } }>(
    '/api/rooms/:code/seats',
    { bodyLimit },
    async (request, reply) => {
      if (rejectForeignOrigin(request, reply)) return reply;
      if (store === undefined) return sendError(reply, 'unavailable');
      const roomCode = parseRoomCode(request.params.code);
      if (roomCode === undefined) return sendError(reply, 'room_not_found');
      if (!isPlainObject(request.body)) return sendError(reply, 'invalid_request');
      const name = parseDisplayName(request.body['name']);
      if (name === undefined) return sendError(reply, 'invalid_name');

      try {
        const result = await store.joinRoom(roomCode, name);
        if (!result.ok) return sendError(reply, result.error);
        await publish(result.roomId);
        return reply.code(201).header('cache-control', 'no-store').send(result.credentials);
      } catch (error) {
        logFailure('join-room', error);
        return sendError(reply, 'unavailable');
      }
    },
  );

  app.get<{ Params: { code: string } }>('/api/rooms/:code', async (request, reply) => {
    if (store === undefined) return sendError(reply, 'unavailable');
    const roomCode = parseRoomCode(request.params.code);
    if (roomCode === undefined) return sendError(reply, 'room_not_found');
    try {
      const preview = await store.previewRoom(roomCode);
      return preview === undefined ? sendError(reply, 'room_not_found') : preview;
    } catch (error) {
      logFailure('preview-room', error);
      return sendError(reply, 'unavailable');
    }
  });

  // Socket.IO: authenticated seat attachment and lobby commands.

  io.on('connection', (socket) => {
    socket.on('lobby:attach', async (request, ack) => {
      if (typeof ack !== 'function') return;
      if (store === undefined) return ack({ ok: false, error: 'unavailable' });
      if (!isPlainObject(request)) return ack({ ok: false, error: 'invalid_request' });
      const roomCode = parseRoomCode(request['roomCode']);
      const seatToken = parseSeatToken(request['seatToken']);
      // Malformed and unknown credentials are indistinguishable to the caller.
      if (roomCode === undefined || seatToken === undefined) {
        return ack({ ok: false, error: 'invalid_session' } satisfies LobbyResult);
      }

      try {
        const session = await store.authenticate(roomCode, seatToken);
        const previous = detach(socket);
        if (previous !== undefined && previous.seatId !== session?.seatId) {
          void publish(previous.roomId);
        }
        if (session === undefined) return ack({ ok: false, error: 'invalid_session' });

        socket.data.session = session;
        socket.data.deliverySequence = 0;
        await socket.join([roomChannel(session.roomId), seatChannel(session.seatId)]);

        // Read after joining: a concurrent kick either already removed the seat (seen here)
        // or will find this socket in the seat channel and revoke it.
        const snapshot = await store.getLobby(session.roomId);
        if (
          snapshot === undefined ||
          !snapshot.seats.some((seat) => seat.seatId === session.seatId)
        ) {
          detach(socket);
          return ack({ ok: false, error: 'invalid_session' });
        }
        if (snapshot.status !== 'lobby') {
          const result = await game?.syncForSocket(socket, session);
          if (result === undefined || !result.ok) return ack({ ok: false, error: 'unavailable' });
          ack({ ok: true, seatId: session.seatId, lobby: toView(snapshot), game: result.game });
          await game?.publish(session.roomId);
          return;
        }
        ack({ ok: true, seatId: session.seatId, lobby: toView(snapshot) });
        // Presence changed for the other seats.
        socket.to(roomChannel(session.roomId)).emit('lobby:state', toView(snapshot));
      } catch (error) {
        logFailure('attach', error);
        ack({ ok: false, error: 'unavailable' });
      }
    });

    async function runCommand(
      ack: unknown,
      operation: string,
      command: (store: LobbyStore, session: SeatSession) => Promise<LobbyCommandResult>,
    ) {
      if (typeof ack !== 'function') return;
      const reply = ack as (result: LobbyCommandResult) => void;
      if (store === undefined) return reply({ ok: false, error: 'unavailable' });
      const session = socket.data.session;
      if (session === undefined) return reply({ ok: false, error: 'not_attached' });
      try {
        const result = await command(store, session);
        if (!result.ok && result.error === 'invalid_session') detach(socket);
        reply(result);
      } catch (error) {
        logFailure(operation, error);
        reply({ ok: false, error: 'unavailable' });
      }
    }

    socket.on('lobby:set-ready', (request, ack) =>
      runCommand(ack, 'set-ready', async (lobby, session) => {
        if (!isPlainObject(request) || typeof request['ready'] !== 'boolean') {
          return { ok: false, error: 'invalid_request' };
        }
        const result = await lobby.setReady(session, request['ready']);
        if (!result.ok) return result;
        if (result.changed) await publish(session.roomId);
        return { ok: true };
      }),
    );

    socket.on('lobby:leave', (ack) =>
      runCommand(ack, 'leave', async (lobby, session) => {
        const result = await lobby.leave(session);
        if (!result.ok) return result;
        closeSeat(session.seatId, 'left');
        await publish(session.roomId);
        return { ok: true };
      }),
    );

    socket.on('lobby:kick', (request, ack) =>
      runCommand(ack, 'kick', async (lobby, session) => {
        const targetSeatId = isPlainObject(request) ? parseSeatId(request['seatId']) : undefined;
        if (targetSeatId === undefined) return { ok: false, error: 'invalid_request' };
        const result = await lobby.kick(session, targetSeatId);
        if (!result.ok) return result;
        closeSeat(targetSeatId, 'kicked');
        await publish(session.roomId);
        return { ok: true };
      }),
    );

    socket.on('disconnect', () => {
      const session = socket.data.session;
      // Socket.IO has already removed this socket from its channels; presence is current.
      if (session !== undefined) void publish(session.roomId);
    });
  });
}
