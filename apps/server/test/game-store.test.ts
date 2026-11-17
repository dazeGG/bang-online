import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPostgresGameStore } from '../src/game-store.js';
import { createPostgresLobbyStore, type SeatSession } from '../src/lobby-store.js';
import { createTestSchema, postgresAvailable, type TestSchema } from './postgres.js';
import { fixtureEngine } from './game-fixture.js';

let schema: TestSchema;
beforeEach(async () => {
  if (postgresAvailable) {
    schema = await createTestSchema();
    await schema.migrate();
  }
});
afterEach(async () => {
  if (postgresAvailable) await schema.dispose();
});

async function readyRoom() {
  const database = schema.open();
  const lobby = createPostgresLobbyStore(database.pool);
  const host = await lobby.createRoom('Host');
  if (!host.ok) throw new Error('Fixture create failed.');
  const sessions: SeatSession[] = [
    { roomId: host.roomId, roomCode: host.credentials.roomCode, seatId: host.credentials.seatId },
  ];
  for (let i = 1; i < 4; i++) {
    const seat = await lobby.joinRoom(host.credentials.roomCode, `Guest ${i}`);
    if (!seat.ok) throw new Error('Fixture join failed.');
    sessions.push({
      roomId: host.roomId,
      roomCode: host.credentials.roomCode,
      seatId: seat.credentials.seatId,
    });
  }
  for (const session of sessions) await lobby.setReady(session, true);
  const snapshot = await lobby.getLobby(host.roomId);
  if (snapshot === undefined) throw new Error('Fixture snapshot missing.');
  const int = vi.fn(() => 3);
  const store = createPostgresGameStore(database.pool, fixtureEngine, { random: { int } });
  return { database, lobby, sessions, host: sessions[0]!, revision: snapshot.revision, store, int };
}

describe.skipIf(!postgresAvailable)('durable game store (synthetic engine boundary)', () => {
  it('validates host/readiness, commits once, and returns original retries before stale lifecycle checks', async () => {
    const f = await readyRoom();
    const request = { commandId: 'start', expectedRevision: f.revision };
    expect(await f.store.start(f.sessions[1]!, request)).toEqual({ ok: false, error: 'forbidden' });
    await f.lobby.setReady(f.sessions[1]!, false);
    expect(await f.store.start(f.host, { ...request, expectedRevision: f.revision + 1 })).toEqual({
      ok: false,
      error: 'not_ready',
    });
    await f.lobby.setReady(f.sessions[1]!, true);
    request.expectedRevision += 2;
    const receipt = await f.store.start(f.host, request);
    expect(receipt).toMatchObject({ ok: true, revision: 1, status: 'active' });
    expect(await f.store.start(f.host, request)).toEqual(receipt);
    expect(f.int).toHaveBeenCalledTimes(1);
    expect(await f.store.start(f.host, { ...request, expectedRevision: 123 })).toEqual({
      ok: false,
      error: 'command_conflict',
    });
    const dbCounts = await f.database.pool.query(
      'SELECT (SELECT count(*)::int FROM matches) AS matches, (SELECT count(*)::int FROM match_participants) AS participants, (SELECT count(*)::int FROM game_command_receipts) AS receipts',
    );
    expect(dbCounts.rows[0]).toEqual({ matches: 1, participants: 4, receipts: 1 });
    expect(JSON.stringify(receipt)).not.toContain('PRIVATE');
  });

  it('serializes simultaneous IDs, deduplicates across new pools, and never consumes duplicate entropy', async () => {
    const f = await readyRoom();
    const started = await f.store.start(f.host, {
      commandId: 'start',
      expectedRevision: f.revision,
    });
    if (!started.ok) throw new Error('Start failed.');
    const command = {
      commandId: 'move',
      expectedRevision: 1,
      matchId: started.matchId,
      intent: { type: 'end_turn' },
    };
    const results = await Promise.all([
      f.store.command(f.host, command),
      f.store.command(f.host, command),
    ]);
    expect(results[0]).toEqual(results[1]);
    expect(f.int).toHaveBeenCalledTimes(2);
    const reopened = schema.open();
    const restarted = createPostgresGameStore(reopened.pool, fixtureEngine, {
      random: { int: f.int },
    });
    expect(await restarted.command(f.host, command)).toEqual(results[0]);
    expect(f.int).toHaveBeenCalledTimes(2);
    expect(
      await restarted.command(f.host, { ...command, intent: { type: 'draw', source: 'deck' } }),
    ).toEqual({ ok: false, error: 'command_conflict' });
    const nextActor = f.sessions[1]!;
    const raced = await Promise.all(
      ['a', 'b'].map((commandId) =>
        restarted.command(nextActor, { ...command, commandId, expectedRevision: 2 }),
      ),
    );
    expect(raced.filter((result) => result.ok)).toHaveLength(1);
    expect(raced.filter((result) => !result.ok && result.error === 'stale_revision')).toHaveLength(
      1,
    );
    expect(f.int).toHaveBeenCalledTimes(3);
    const restored = await restarted.sync(f.host);
    expect(restored).toMatchObject({
      ok: true,
      game: { revision: 3, turn: { seatId: f.sessions[2]!.seatId } },
    });
  });

  it('checks current room membership before accessing a stored retry receipt', async () => {
    const f = await readyRoom();
    const request = { commandId: 'start', expectedRevision: f.revision };
    await f.store.start(f.host, request);
    const outsider = await f.lobby.createRoom('Outside');
    if (!outsider.ok) throw new Error('Outside create failed.');
    expect(
      await f.store.start({ ...f.host, seatId: outsider.credentials.seatId }, request),
    ).toEqual({ ok: false, error: 'not_attached' });
    expect(
      await f.store.start({ ...f.host, roomCode: outsider.credentials.roomCode }, request),
    ).toEqual({ ok: false, error: 'not_attached' });
    expect(await f.store.sync({ ...f.host, seatId: outsider.credentials.seatId })).toEqual({
      ok: false,
      error: 'not_attached',
    });
    expect(f.int).toHaveBeenCalledTimes(1);
  });

  it('rolls back snapshot, receipt, room status and participants on transaction failure', async () => {
    const f = await readyRoom();
    const faulty = createPostgresGameStore(f.database.pool, fixtureEngine, {
      beforeCommit: async () => {
        throw new Error('Injected failure after writes.');
      },
    });
    await expect(
      faulty.start(f.host, { commandId: 'start', expectedRevision: f.revision }),
    ).rejects.toThrow('Injected');
    expect(
      (await f.database.pool.query('SELECT count(*)::int AS count FROM matches')).rows[0]?.count,
    ).toBe(0);
    expect((await f.lobby.getLobby(f.host.roomId))?.status).toBe('lobby');
    const started = await f.store.start(f.host, {
      commandId: 'start',
      expectedRevision: f.revision,
    });
    if (!started.ok) throw new Error('Start failed.');
    await expect(
      faulty.command(f.host, {
        commandId: 'fail',
        expectedRevision: 1,
        matchId: started.matchId,
        intent: { type: 'end_turn' },
      }),
    ).rejects.toThrow('Injected');
    expect(await f.store.sync(f.host)).toMatchObject({ ok: true, game: { revision: 1 } });
    expect(
      (await f.database.pool.query('SELECT count(*)::int AS count FROM game_command_receipts'))
        .rows[0]?.count,
    ).toBe(1);
    await f.database.pool.query(
      `CREATE FUNCTION reject_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'receipt insert failure'; END $$; CREATE TRIGGER fail_receipt BEFORE INSERT ON game_command_receipts FOR EACH ROW EXECUTE FUNCTION reject_receipt()`,
    );
    await expect(
      f.store.command(f.host, {
        commandId: 'receipt-fail',
        expectedRevision: 1,
        matchId: started.matchId,
        intent: { type: 'end_turn' },
      }),
    ).rejects.toThrow('receipt insert failure');
    expect(await f.store.sync(f.host)).toMatchObject({ ok: true, game: { revision: 1 } });
  });

  it('freezes lobby membership through terminal state and restricts direct participant deletion', async () => {
    const f = await readyRoom();
    const started = await f.store.start(f.host, {
      commandId: 'start',
      expectedRevision: f.revision,
    });
    if (!started.ok) throw new Error('Start failed.');
    for (const terminal of [false, true]) {
      if (terminal) {
        const request = { commandId: 'abort', expectedRevision: 1, matchId: started.matchId };
        expect(await f.store.abort(f.sessions[1]!, request)).toEqual({
          ok: false,
          error: 'forbidden',
        });
        const aborted = await f.store.abort(f.host, request);
        expect(aborted).toMatchObject({ ok: true, status: 'aborted', revision: 2 });
        expect(await f.store.abort(f.host, request)).toEqual(aborted);
        expect(await f.store.sync(f.host)).toMatchObject({
          ok: true,
          game: { outcome: { status: 'aborted', winner: null, winnerSeatIds: [] } },
        });
        expect(
          await f.store.command(f.host, {
            commandId: 'late',
            expectedRevision: 2,
            matchId: started.matchId,
            intent: { type: 'end_turn' },
          }),
        ).toEqual({ ok: false, error: 'match_ended' });
      }
      expect(await f.lobby.setReady(f.host, true)).toEqual({ ok: false, error: 'room_closed' });
      expect(await f.lobby.leave(f.host)).toEqual({ ok: false, error: 'room_closed' });
      expect(await f.lobby.kick(f.host, f.sessions[1]!.seatId)).toEqual({
        ok: false,
        error: 'room_closed',
      });
      expect(await f.lobby.joinRoom(f.host.roomCode, 'Late')).toEqual({
        ok: false,
        error: 'room_closed',
      });
      await expect(
        f.database.pool.query('DELETE FROM seats WHERE id = $1', [f.sessions[1]!.seatId]),
      ).rejects.toMatchObject({ code: '23001' });
    }
  });

  it('fails closed on corrupt saved state and envelope mismatches', async () => {
    const f = await readyRoom();
    const started = await f.store.start(f.host, {
      commandId: 'start',
      expectedRevision: f.revision,
    });
    if (!started.ok) throw new Error('Start failed.');
    await f.database.pool.query("UPDATE matches SET state = '{}'::jsonb WHERE id = $1", [
      started.matchId,
    ]);
    await expect(f.store.sync(f.host)).rejects.toThrow('Corrupt');
    await expect(
      f.store.command(f.host, {
        commandId: 'move',
        expectedRevision: 1,
        matchId: started.matchId,
        intent: { type: 'end_turn' },
      }),
    ).rejects.toThrow('Corrupt');
    expect(f.int).toHaveBeenCalledTimes(1);
    expect(
      (await f.database.pool.query('SELECT count(*)::int AS count FROM game_command_receipts'))
        .rows[0]?.count,
    ).toBe(1);
  });

  it('serializes start versus join without changing fixed participants', async () => {
    const f = await readyRoom();
    const [start, join] = await Promise.all([
      f.store.start(f.host, { commandId: 'start', expectedRevision: f.revision }),
      f.lobby.joinRoom(f.host.roomCode, 'Racing'),
    ]);
    if (start.ok) {
      expect(join).toEqual({ ok: false, error: 'room_closed' });
      expect(
        (await f.database.pool.query('SELECT count(*)::int AS count FROM match_participants'))
          .rows[0]?.count,
      ).toBe(4);
    } else {
      expect(join.ok).toBe(true);
      expect(['stale_revision', 'not_ready']).toContain(start.error);
      expect((await f.lobby.getLobby(f.host.roomId))?.status).toBe('lobby');
    }
  });

  it('serializes distinct concurrent starts into one durable deal', async () => {
    const f = await readyRoom();
    const results = await Promise.all(
      ['start-a', 'start-b'].map((commandId) =>
        f.store.start(f.host, { commandId, expectedRevision: f.revision }),
      ),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok && result.error === 'room_closed')).toHaveLength(
      1,
    );
    expect(f.int).toHaveBeenCalledTimes(1);
    expect(
      (await f.database.pool.query('SELECT count(*)::int AS count FROM matches')).rows[0]?.count,
    ).toBe(1);
  });

  it.each(['ready', 'leave', 'kick'] as const)(
    'serializes start versus %s under the same room lock',
    async (mutation) => {
      const f = await readyRoom();
      const operation = () =>
        mutation === 'ready'
          ? f.lobby.setReady(f.sessions[1]!, true)
          : mutation === 'leave'
            ? f.lobby.leave(f.sessions[1]!)
            : f.lobby.kick(f.host, f.sessions[1]!.seatId);
      const [started, changed] = await Promise.all([
        f.store.start(f.host, { commandId: 'start', expectedRevision: f.revision }),
        operation(),
      ]);
      const snapshot = await f.lobby.getLobby(f.host.roomId);
      if (started.ok) {
        expect(snapshot?.status).toBe('active');
        expect(snapshot?.seats).toHaveLength(4);
        if (mutation !== 'ready') expect(changed).toEqual({ ok: false, error: 'room_closed' });
        expect(
          (await f.database.pool.query('SELECT count(*)::int AS count FROM match_participants'))
            .rows[0]?.count,
        ).toBe(4);
      } else {
        expect(changed.ok).toBe(true);
        expect(snapshot?.status).toBe('lobby');
        expect(snapshot?.seats).toHaveLength(3);
        expect(
          (await f.database.pool.query('SELECT count(*)::int AS count FROM matches')).rows[0]
            ?.count,
        ).toBe(0);
      }
    },
  );
});
