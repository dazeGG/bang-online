import { createHash, randomInt, randomUUID } from 'node:crypto';
import * as classic from '@bang/game-core';
import type {
  CoreGameView,
  CreateMatchInput,
  GameIntent,
  GameStatus,
  RandomSource,
  TransitionResult,
} from '@bang/game-core';
import type { GameCommandResult, GameErrorCode } from '@bang/contracts';
import type { Pool, PoolClient } from 'pg';
import type { SeatSession } from './lobby-store.js';
import { parseGameAbort, parseGameCommand, parseGameStart } from './game-validation.js';

export interface EngineSnapshot {
  matchId: string;
  revision: number;
  status: GameStatus;
}

/** Injectable pure rules boundary; production uses the classic engine, never a fallback. */
export interface GameEngine<State extends EngineSnapshot> {
  createMatch(input: CreateMatchInput, random: RandomSource): State;
  applyIntent(
    state: State,
    actorSeatId: string,
    intent: GameIntent,
    random: RandomSource,
  ): TransitionResult<State>;
  projectMatch(state: State, viewerSeatId: string): CoreGameView;
  decodeMatch(raw: unknown): State;
  abortMatch(state: State, hostActorSeatId: string): TransitionResult<State>;
}

export type StoredGameResult =
  { ok: true; roomCode: string; game: CoreGameView } | { ok: false; error: GameErrorCode };
export interface GameStore {
  start(session: SeatSession, request: unknown): Promise<GameCommandResult>;
  command(session: SeatSession, request: unknown): Promise<GameCommandResult>;
  abort(session: SeatSession, request: unknown): Promise<GameCommandResult>;
  sync(session: SeatSession, matchId?: string): Promise<StoredGameResult>;
}

interface RoomRow {
  id: string;
  code: string;
  status: string;
  revision: number;
  host_seat_id: string | null;
}
interface MatchRow {
  id: string;
  revision: number;
  status: GameStatus;
  state: unknown;
}
type SuccessReceipt = Extract<GameCommandResult, { ok: true }>;
type Operation = 'start' | 'command' | 'abort';
const failure = (error: GameErrorCode): GameCommandResult => ({ ok: false, error });

function fingerprint(operation: Operation, request: unknown): string {
  // Parsers construct canonical key order and preserve semantically significant arrays.
  return createHash('sha256').update(JSON.stringify({ operation, request })).digest('hex');
}

async function transaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
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

/** All paths lock room first, then check current membership, then lock the match. */
async function authenticateLocked(
  client: PoolClient,
  session: SeatSession,
): Promise<RoomRow | undefined> {
  const room = (
    await client.query<RoomRow>(
      'SELECT id, code, status, revision, host_seat_id FROM rooms WHERE id = $1 FOR UPDATE',
      [session.roomId],
    )
  ).rows[0];
  if (room === undefined || room.code !== session.roomCode) return undefined;
  const member = await client.query('SELECT 1 FROM seats WHERE room_id = $1 AND id = $2', [
    room.id,
    session.seatId,
  ]);
  return member.rowCount === 1 ? room : undefined;
}

async function lockMatch(client: PoolClient, roomId: string): Promise<MatchRow | undefined> {
  return (
    await client.query<MatchRow>(
      'SELECT id, revision, status, state FROM matches WHERE room_id = $1 FOR UPDATE',
      [roomId],
    )
  ).rows[0];
}

async function participant(client: PoolClient, roomId: string, seatId: string) {
  return (
    (
      await client.query('SELECT 1 FROM match_participants WHERE room_id = $1 AND seat_id = $2', [
        roomId,
        seatId,
      ])
    ).rowCount === 1
  );
}

async function retry(
  client: PoolClient,
  session: SeatSession,
  commandId: string,
  hash: string,
): Promise<GameCommandResult | undefined> {
  const row = (
    await client.query<{ fingerprint: string; receipt: SuccessReceipt }>(
      'SELECT fingerprint, receipt FROM game_command_receipts WHERE room_id = $1 AND actor_seat_id = $2 AND command_id = $3',
      [session.roomId, session.seatId, commandId],
    )
  ).rows[0];
  if (row === undefined) return undefined;
  if (row.fingerprint !== hash) return failure('command_conflict');
  const receipt = row.receipt;
  if (
    receipt?.ok !== true ||
    receipt.commandId !== commandId ||
    typeof receipt.matchId !== 'string' ||
    !Number.isSafeInteger(receipt.revision) ||
    receipt.revision < 1 ||
    !['active', 'finished', 'aborted'].includes(receipt.status) ||
    Object.keys(receipt).sort().join(',') !== 'commandId,matchId,ok,revision,status'
  )
    throw new Error('Invalid durable game receipt.');
  return receipt;
}

export function createPostgresGameStore<State extends EngineSnapshot>(
  pool: Pool,
  engine: GameEngine<State>,
  options: { random?: RandomSource; beforeCommit?: (client: PoolClient) => Promise<void> } = {},
): GameStore {
  const random = options.random ?? { int: (maxExclusive: number) => randomInt(maxExclusive) };

  function decode(row: MatchRow, room: RoomRow): State {
    const state = engine.decodeMatch(row.state);
    if (
      state.matchId !== row.id ||
      state.revision !== row.revision ||
      state.status !== row.status ||
      room.status !== row.status
    )
      throw new Error('Inconsistent durable match envelope.');
    return state;
  }

  async function save(
    client: PoolClient,
    session: SeatSession,
    state: State,
    commandId: string,
    hash: string,
  ): Promise<SuccessReceipt> {
    const receipt: SuccessReceipt = {
      ok: true,
      commandId,
      revision: state.revision,
      matchId: state.matchId,
      status: state.status,
    };
    await client.query(
      'UPDATE matches SET revision = $2, status = $3, state = $4::jsonb, updated_at = now() WHERE id = $1',
      [state.matchId, state.revision, state.status, JSON.stringify(state)],
    );
    await client.query(
      'UPDATE rooms SET status = $2, revision = revision + 1, updated_at = now() WHERE id = $1',
      [session.roomId, state.status],
    );
    await client.query(
      'INSERT INTO game_command_receipts (room_id, actor_seat_id, command_id, match_id, fingerprint, receipt) VALUES ($1, $2, $3, $4, $5, $6::jsonb)',
      [session.roomId, session.seatId, commandId, state.matchId, hash, JSON.stringify(receipt)],
    );
    await options.beforeCommit?.(client);
    return receipt;
  }

  async function mutate(
    operation: 'command' | 'abort',
    session: SeatSession,
    raw: unknown,
  ): Promise<GameCommandResult> {
    const commandRequest = operation === 'command' ? parseGameCommand(raw) : undefined;
    const request = operation === 'command' ? commandRequest : parseGameAbort(raw);
    if (request === undefined) return failure('invalid_request');
    const hash = fingerprint(operation, request);
    return transaction(pool, async (client) => {
      const room = await authenticateLocked(client, session);
      if (room === undefined) return failure('not_attached');
      if (!(await participant(client, room.id, session.seatId))) return failure('forbidden');
      const previous = await retry(client, session, request.commandId, hash);
      if (previous !== undefined) return previous;
      const match = await lockMatch(client, room.id);
      if (match === undefined || match.id !== request.matchId) return failure('match_not_found');
      if (operation === 'abort' && room.host_seat_id !== session.seatId)
        return failure('forbidden');
      if (match.revision !== request.expectedRevision)
        return { ok: false, error: 'stale_revision', revision: match.revision, matchId: match.id };
      const state = decode(match, room);
      if (state.status !== 'active') return failure('match_ended');
      const result =
        commandRequest !== undefined
          ? engine.applyIntent(state, session.seatId, commandRequest.intent, random)
          : engine.abortMatch(state, session.seatId);
      if (!result.ok) return failure(result.error);
      const next = engine.decodeMatch(result.state);
      if (next.matchId !== match.id || next.revision !== state.revision + 1)
        throw new Error('Invalid engine transition envelope.');
      return save(client, session, next, request.commandId, hash);
    });
  }

  return {
    async start(session, raw) {
      const request = parseGameStart(raw);
      if (request === undefined) return failure('invalid_request');
      const hash = fingerprint('start', request);
      return transaction(pool, async (client) => {
        const room = await authenticateLocked(client, session);
        if (room === undefined) return failure('not_attached');
        const previous = await retry(client, session, request.commandId, hash);
        if (previous !== undefined) return previous;
        if (room.host_seat_id !== session.seatId) return failure('forbidden');
        if (room.status !== 'lobby') return failure('room_closed');
        if (room.revision !== request.expectedRevision) return failure('stale_revision');
        const seats = (
          await client.query<{
            id: string;
            display_name: string;
            seat_index: number;
            ready: boolean;
          }>(
            'SELECT id, display_name, seat_index, ready FROM seats WHERE room_id = $1 ORDER BY seat_index',
            [room.id],
          )
        ).rows;
        if (!classic.canStartClassicMatch(seats.map((seat) => seat.ready)))
          return failure('not_ready');
        const matchId = randomUUID();
        const state = engine.decodeMatch(
          engine.createMatch(
            {
              matchId,
              participants: seats.map((seat) => ({
                seatId: seat.id,
                name: seat.display_name,
                seatIndex: seat.seat_index,
              })),
              hostSeatId: session.seatId,
              rulesetVersion: classic.CLASSIC_RULESET_ID,
            },
            random,
          ),
        );
        if (state.matchId !== matchId || state.revision !== 1 || state.status !== 'active')
          throw new Error('Invalid initial match envelope.');
        await client.query(
          'INSERT INTO matches (id, room_id, revision, status, state) VALUES ($1, $2, $3, $4, $5::jsonb)',
          [matchId, room.id, state.revision, state.status, JSON.stringify(state)],
        );
        for (const seat of seats)
          await client.query(
            'INSERT INTO match_participants (match_id, room_id, seat_id) VALUES ($1, $2, $3)',
            [matchId, room.id, seat.id],
          );
        return save(client, session, state, request.commandId, hash);
      });
    },
    command: (session, request) => mutate('command', session, request),
    abort: (session, request) => mutate('abort', session, request),
    async sync(session, matchId) {
      return transaction(pool, async (client) => {
        const room = await authenticateLocked(client, session);
        if (room === undefined) return { ok: false, error: 'not_attached' };
        if (!(await participant(client, room.id, session.seatId)))
          return { ok: false, error: 'match_not_found' };
        const match = await lockMatch(client, room.id);
        if (match === undefined || (matchId !== undefined && matchId !== match.id))
          return { ok: false, error: 'match_not_found' };
        const state = decode(match, room);
        const game = engine.projectMatch(state, session.seatId);
        if (
          game.matchId !== state.matchId ||
          game.revision !== state.revision ||
          game.status !== state.status ||
          game.ownSeatId !== session.seatId
        )
          throw new Error('Invalid engine projection envelope.');
        return { ok: true, roomCode: room.code, game };
      });
    },
  };
}
