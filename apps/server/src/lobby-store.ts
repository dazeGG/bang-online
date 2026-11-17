import {
  CLASSIC_PLAYER_LIMITS,
  CLASSIC_RULESET_ID,
  type LobbyErrorCode,
  type RoomPreview,
  type SeatCredentials,
  type RoomStatus,
} from '@bang/contracts';
import type { Pool, PoolClient } from 'pg';
import { generateRoomCode, generateSeatToken, hashSeatToken } from './lobby-validation.js';

export type StoreResult<T> = ({ ok: true } & T) | { ok: false; error: LobbyErrorCode };

/** Server-side identity of an authenticated seat. Never sent to clients as-is. */
export interface SeatSession {
  roomId: string;
  roomCode: string;
  seatId: string;
}

export interface LobbySnapshot {
  roomId: string;
  roomCode: string;
  status: RoomStatus;
  revision: number;
  hostSeatId: string | null;
  seats: { seatId: string; seatIndex: number; name: string; ready: boolean }[];
}

export interface LobbyStore {
  createRoom(name: string): Promise<StoreResult<{ roomId: string; credentials: SeatCredentials }>>;
  joinRoom(
    roomCode: string,
    name: string,
  ): Promise<StoreResult<{ roomId: string; credentials: SeatCredentials }>>;
  previewRoom(roomCode: string): Promise<RoomPreview | undefined>;
  authenticate(roomCode: string, seatToken: string): Promise<SeatSession | undefined>;
  getLobby(roomId: string): Promise<LobbySnapshot | undefined>;
  setReady(session: SeatSession, ready: boolean): Promise<StoreResult<{ changed: boolean }>>;
  leave(session: SeatSession): Promise<StoreResult<object>>;
  kick(session: SeatSession, targetSeatId: string): Promise<StoreResult<object>>;
}

const MAX_SEATS = CLASSIC_PLAYER_LIMITS.max;
const UNIQUE_VIOLATION = '23505';

interface RoomRow {
  id: string;
  code: string;
  status: RoomStatus;
  revision: number;
  host_seat_id: string | null;
}

interface SeatRow {
  id: string;
  seat_index: number;
  display_name: string;
  ready: boolean;
}

function isUniqueViolation(error: unknown, constraint?: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === UNIQUE_VIOLATION &&
    (constraint === undefined || ('constraint' in error && error.constraint === constraint))
  );
}

async function inTransaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Row lock on the room serializes every lobby mutation within that room. */
async function lockRoom(client: PoolClient, where: 'id' | 'code', value: string) {
  const result = await client.query<RoomRow>(
    `SELECT id, code, status, revision, host_seat_id FROM rooms WHERE ${where} = $1 FOR UPDATE`,
    [value],
  );
  return result.rows[0];
}

async function readSeats(client: PoolClient, roomId: string) {
  const result = await client.query<SeatRow>(
    'SELECT id, seat_index, display_name, ready FROM seats WHERE room_id = $1 ORDER BY seat_index',
    [roomId],
  );
  return result.rows;
}

async function bumpRevision(client: PoolClient, roomId: string) {
  await client.query('UPDATE rooms SET revision = revision + 1, updated_at = now() WHERE id = $1', [
    roomId,
  ]);
}

async function insertSeat(client: PoolClient, roomId: string, seatIndex: number, name: string) {
  const seatToken = generateSeatToken();
  const result = await client.query<{ id: string }>(
    `INSERT INTO seats (room_id, seat_index, display_name, token_hash)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [roomId, seatIndex, name, hashSeatToken(seatToken)],
  );
  const seatId = result.rows[0]?.id;
  if (seatId === undefined) throw new Error('Seat insert returned no row.');
  return { seatId, seatToken };
}

/** Moves the host role to the lowest occupied seat, or clears it for an empty room. */
async function reassignHost(client: PoolClient, roomId: string) {
  await client.query(
    `UPDATE rooms SET host_seat_id = (
       SELECT id FROM seats WHERE room_id = $1 ORDER BY seat_index LIMIT 1
     ) WHERE id = $1`,
    [roomId],
  );
}

export function createPostgresLobbyStore(pool: Pool): LobbyStore {
  return {
    async createRoom(name) {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const roomCode = generateRoomCode();
        try {
          return await inTransaction(pool, async (client) => {
            const room = await client.query<{ id: string }>(
              'INSERT INTO rooms (code, ruleset_id) VALUES ($1, $2) RETURNING id',
              [roomCode, CLASSIC_RULESET_ID],
            );
            const roomId = room.rows[0]?.id;
            if (roomId === undefined) throw new Error('Room insert returned no row.');
            const { seatId, seatToken } = await insertSeat(client, roomId, 0, name);
            await client.query('UPDATE rooms SET host_seat_id = $1 WHERE id = $2', [
              seatId,
              roomId,
            ]);
            return { ok: true as const, roomId, credentials: { roomCode, seatId, seatToken } };
          });
        } catch (error) {
          if (!isUniqueViolation(error, 'rooms_code_key')) throw error;
        }
      }
      throw new Error('Could not allocate a unique room code.');
    },

    async joinRoom(roomCode, name) {
      try {
        return await inTransaction(pool, async (client) => {
          const room = await lockRoom(client, 'code', roomCode);
          if (room === undefined) return { ok: false as const, error: 'room_not_found' as const };
          if (room.status !== 'lobby') return { ok: false as const, error: 'room_closed' as const };

          const seats = await readSeats(client, room.id);
          if (seats.length >= MAX_SEATS) {
            return { ok: false as const, error: 'room_full' as const };
          }
          const lowered = name.toLowerCase();
          if (seats.some((seat) => seat.display_name.toLowerCase() === lowered)) {
            return { ok: false as const, error: 'name_taken' as const };
          }

          const taken = new Set(seats.map((seat) => seat.seat_index));
          let seatIndex = 0;
          while (taken.has(seatIndex)) seatIndex += 1;

          const { seatId, seatToken } = await insertSeat(client, room.id, seatIndex, name);
          if (room.host_seat_id === null) {
            await client.query('UPDATE rooms SET host_seat_id = $1 WHERE id = $2', [
              seatId,
              room.id,
            ]);
          }
          await bumpRevision(client, room.id);
          return {
            ok: true as const,
            roomId: room.id,
            credentials: { roomCode: room.code, seatId, seatToken },
          };
        });
      } catch (error) {
        // PostgreSQL lower() and JavaScript toLowerCase() can disagree on rare characters.
        if (isUniqueViolation(error, 'seats_room_name_key')) {
          return { ok: false, error: 'name_taken' };
        }
        throw error;
      }
    },

    async previewRoom(roomCode) {
      const result = await pool.query<{ status: RoomStatus; seat_count: number }>(
        `SELECT r.status, count(s.id)::int AS seat_count
         FROM rooms r LEFT JOIN seats s ON s.room_id = r.id
         WHERE r.code = $1 GROUP BY r.id`,
        [roomCode],
      );
      const row = result.rows[0];
      if (row === undefined) return undefined;
      return {
        roomCode,
        status: row.status,
        seatCount: row.seat_count,
        maxPlayers: MAX_SEATS,
        joinable: row.status === 'lobby' && row.seat_count < MAX_SEATS,
      };
    },

    async authenticate(roomCode, seatToken) {
      // Lookup by a SHA-256 digest of a 256-bit secret: no comparison timing leak to exploit.
      const result = await pool.query<{ room_id: string; seat_id: string }>(
        `UPDATE seats s SET last_seen_at = now()
         FROM rooms r
         WHERE s.room_id = r.id AND s.token_hash = $1 AND r.code = $2
         RETURNING r.id AS room_id, s.id AS seat_id`,
        [hashSeatToken(seatToken), roomCode],
      );
      const row = result.rows[0];
      return row === undefined ? undefined : { roomId: row.room_id, roomCode, seatId: row.seat_id };
    },

    async getLobby(roomId) {
      // One statement reads a consistent snapshot of the room revision and its seats.
      const result = await pool.query<
        RoomRow & { seat_id: string | null } & Partial<Omit<SeatRow, 'id'>>
      >(
        `SELECT r.id, r.code, r.status, r.revision, r.host_seat_id,
                s.id AS seat_id, s.seat_index, s.display_name, s.ready
         FROM rooms r LEFT JOIN seats s ON s.room_id = r.id
         WHERE r.id = $1
         ORDER BY s.seat_index`,
        [roomId],
      );
      const row = result.rows[0];
      if (row === undefined) return undefined;
      return {
        roomId: row.id,
        roomCode: row.code,
        status: row.status,
        revision: row.revision,
        hostSeatId: row.host_seat_id,
        seats: result.rows.flatMap((seat) =>
          seat.seat_id === null
            ? []
            : [
                {
                  seatId: seat.seat_id,
                  seatIndex: seat.seat_index ?? 0,
                  name: seat.display_name ?? '',
                  ready: seat.ready ?? false,
                },
              ],
        ),
      };
    },

    async setReady(session, ready) {
      return inTransaction(pool, async (client) => {
        const room = await lockRoom(client, 'id', session.roomId);
        if (room === undefined) return { ok: false as const, error: 'invalid_session' as const };
        if (room.status !== 'lobby') return { ok: false as const, error: 'room_closed' as const };
        const result = await client.query<{ ready: boolean }>(
          'SELECT ready FROM seats WHERE id = $1 AND room_id = $2',
          [session.seatId, session.roomId],
        );
        const seat = result.rows[0];
        if (seat === undefined) return { ok: false as const, error: 'invalid_session' as const };
        if (seat.ready === ready) return { ok: true as const, changed: false };

        await client.query('UPDATE seats SET ready = $1 WHERE id = $2', [ready, session.seatId]);
        await bumpRevision(client, session.roomId);
        return { ok: true as const, changed: true };
      });
    },

    async leave(session) {
      return inTransaction(pool, async (client) => {
        const room = await lockRoom(client, 'id', session.roomId);
        if (room === undefined) return { ok: false as const, error: 'invalid_session' as const };
        if (room.status !== 'lobby') return { ok: false as const, error: 'room_closed' as const };
        const deleted = await client.query('DELETE FROM seats WHERE id = $1 AND room_id = $2', [
          session.seatId,
          session.roomId,
        ]);
        if (deleted.rowCount === 0) {
          return { ok: false as const, error: 'invalid_session' as const };
        }
        if (room.host_seat_id === session.seatId || room.host_seat_id === null) {
          await reassignHost(client, session.roomId);
        }
        await bumpRevision(client, session.roomId);
        return { ok: true as const };
      });
    },

    async kick(session, targetSeatId) {
      return inTransaction(pool, async (client) => {
        const room = await lockRoom(client, 'id', session.roomId);
        if (room === undefined) return { ok: false as const, error: 'invalid_session' as const };
        if (room.status !== 'lobby') return { ok: false as const, error: 'room_closed' as const };
        const actor = await client.query('SELECT 1 FROM seats WHERE id = $1 AND room_id = $2', [
          session.seatId,
          session.roomId,
        ]);
        if (actor.rowCount === 0) return { ok: false as const, error: 'invalid_session' as const };
        if (room.host_seat_id !== session.seatId || targetSeatId === session.seatId) {
          return { ok: false as const, error: 'forbidden' as const };
        }
        const deleted = await client.query('DELETE FROM seats WHERE id = $1 AND room_id = $2', [
          targetSeatId,
          session.roomId,
        ]);
        if (deleted.rowCount === 0) {
          return { ok: false as const, error: 'invalid_request' as const };
        }
        await bumpRevision(client, session.roomId);
        return { ok: true as const };
      });
    },
  };
}
