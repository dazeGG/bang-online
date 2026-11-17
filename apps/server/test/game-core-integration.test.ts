import { chooseTraceIntent } from './game-trace.js';
import * as classic from '@bang/game-core';
import type { MatchState } from '@bang/game-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPostgresGameStore } from '../src/game-store.js';
import { createPostgresLobbyStore, type SeatSession } from '../src/lobby-store.js';
import { createTestSchema, postgresAvailable, type TestSchema } from './postgres.js';

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

async function readyRoom(count: number) {
  const database = schema.open();
  const lobby = createPostgresLobbyStore(database.pool);
  const host = await lobby.createRoom('Host');
  if (!host.ok) throw new Error('Fixture setup failed.');
  const sessions: SeatSession[] = [
    { roomId: host.roomId, roomCode: host.credentials.roomCode, seatId: host.credentials.seatId },
  ];
  for (let i = 1; i < count; i++) {
    const seat = await lobby.joinRoom(host.credentials.roomCode, `Guest ${i}`);
    if (!seat.ok) throw new Error('Fixture join failed.');
    sessions.push({
      roomId: host.roomId,
      roomCode: host.credentials.roomCode,
      seatId: seat.credentials.seatId,
    });
  }
  for (const session of sessions) await lobby.setReady(session, true);
  const revision = (await lobby.getLobby(host.roomId))!.revision;
  const int = vi.fn((max: number) => max - 1);
  const store = createPostgresGameStore(database.pool, classic, { random: { int } });
  const started = await store.start(sessions[0]!, {
    commandId: 'start',
    expectedRevision: revision,
  });
  if (!started.ok) throw new Error(`Start failed: ${started.error}`);
  return { database, lobby, sessions, store, started, int };
}

/** Match core fixture behavior without crossing this workspace's TypeScript rootDir. */
function moveFixtureCard(
  state: MatchState,
  playerIndex: number,
  destination: 'hand' | 'equipment',
  kind: classic.CardKind,
) {
  const zones = [
    state.deck,
    state.discard,
    ...state.players.flatMap((player) => [player.hand, player.equipment]),
  ];
  for (const zone of zones) {
    const index = zone.findIndex((card) => card.kind === kind);
    if (index === -1) continue;
    const card = zone.splice(index, 1)[0]!;
    state.players[playerIndex]![destination].push(card);
    return card;
  }
  throw new Error(`Missing fixture card kind ${kind}.`);
}

describe.skipIf(!postgresAvailable)('real classic engine with PostgreSQL', () => {
  it.each([4, 5, 6, 7])(
    'starts %i players with private setup and exact persisted restoration',
    async (count) => {
      const f = await readyRoom(count);
      const stored = (
        await f.database.pool.query<{ state: unknown }>('SELECT state FROM matches WHERE id = $1', [
          f.started.matchId,
        ])
      ).rows[0]!.state;
      const state = classic.decodeMatch(stored);
      expect(state.players.map((player) => player.role).sort()).toEqual(
        [...classic.getClassicRoleDistribution(count)].sort(),
      );
      for (const session of f.sessions) {
        const result = await f.store.sync(session);
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error('Missing own view.');
        expect(result.game.ownHand).toEqual(
          state.players.find((p) => p.seatId === session.seatId)!.hand,
        );
        for (const other of state.players.filter((p) => p.seatId !== session.seatId)) {
          const json = JSON.stringify(result.game);
          other.hand.forEach((card) => expect(json).not.toContain(`"${card.id}"`));
          expect(result.game.players.find((p) => p.seatId === other.seatId)?.role).toBe(
            other.role === 'sheriff' ? 'sheriff' : null,
          );
        }
      }
      const owner = f.sessions.find((session) => session.seatId === state.pending!.ownerSeatId)!;
      const own = await f.store.sync(owner);
      if (!own.ok) throw new Error('Missing active view.');
      const intent = chooseTraceIntent(own.game);
      const command = {
        commandId: 'draw',
        expectedRevision: state.revision,
        matchId: state.matchId,
        intent,
      };
      const accepted = await f.store.command(owner, command);
      expect(accepted).toMatchObject({ ok: true, revision: 2 });
      const calls = f.int.mock.calls.length;
      const reopened = schema.open();
      const recovered = createPostgresGameStore(reopened.pool, classic, { random: { int: f.int } });
      expect(await recovered.command(owner, command)).toEqual(accepted);
      expect(f.int).toHaveBeenCalledTimes(calls);
      expect(await recovered.sync(owner)).toEqual(await f.store.sync(owner));
    },
  );

  it('persists abort while private Kit choices are pending without losing physical cards', async () => {
    const f = await readyRoom(4);
    const row = (
      await f.database.pool.query<{ state: MatchState }>(
        'SELECT state FROM matches WHERE id = $1',
        [f.started.matchId],
      )
    ).rows[0]!;
    const state = row.state;
    const current = state.players.find((p) => p.seatId === state.turn.seatId)!;
    const kit = state.players.find((p) => p.characterId === 'kit_carlson');
    if (kit !== undefined && kit !== current) kit.characterId = current.characterId;
    current.characterId = 'kit_carlson';
    current.maxHp = 4 + Number(current.role === 'sheriff');
    current.hp = current.maxHp;
    // This targeted fixture only changes a character, not any card ownership zones.
    classic.decodeMatch(state);
    await f.database.pool.query('UPDATE matches SET state = $2::jsonb WHERE id = $1', [
      state.matchId,
      JSON.stringify(state),
    ]);
    const actor = f.sessions.find((session) => session.seatId === current.seatId)!;
    expect(
      await f.store.command(actor, {
        commandId: 'kit',
        expectedRevision: 1,
        matchId: state.matchId,
        intent: { type: 'draw', source: 'deck' },
      }),
    ).toMatchObject({ ok: true, revision: 2 });
    const pending = await f.store.sync(actor);
    expect(pending).toMatchObject({ ok: true, game: { pending: { kind: 'kit_carlson' } } });
    const inspected = classic.decodeMatch(
      (
        await f.database.pool.query<{ state: unknown }>('SELECT state FROM matches WHERE id = $1', [
          state.matchId,
        ])
      ).rows[0]!.state,
    );
    if (inspected.pending?.kind !== 'kit_carlson') throw new Error('Missing private Kit pool.');
    const pool = inspected.pending.cards;
    const restarted = createPostgresGameStore(schema.open().pool, classic, {
      random: { int: f.int },
    });
    f.int.mockClear();
    for (const session of f.sessions) {
      const view = await f.store.sync(session);
      expect(await restarted.sync(session)).toEqual(view);
      if (!view.ok) throw new Error('Missing Kit projection.');
      expect(view.game.revealedCards).toEqual([]);
      const selection = view.game.actions.find(
        (action) => action.intent.type === 'choose',
      )?.selection;
      if (session.seatId === actor.seatId) expect(selection?.cards).toEqual(pool);
      else for (const card of pool) expect(JSON.stringify(view.game)).not.toContain(`"${card.id}"`);
      for (const other of inspected.players.filter((player) => player.seatId !== session.seatId)) {
        for (const card of other.hand)
          expect(JSON.stringify(view.game)).not.toContain(`"${card.id}"`);
      }
      expect(view.game).not.toHaveProperty('deck');
      expect(JSON.stringify(view.game)).not.toContain(`"${inspected.deck[0]!.id}"`);
    }
    expect(f.int).not.toHaveBeenCalled();
    const abort = { commandId: 'abort-kit', expectedRevision: 2, matchId: state.matchId };
    const result = await f.store.abort(f.sessions[0]!, abort);
    expect(result).toMatchObject({ ok: true, status: 'aborted', revision: 3 });
    expect(await f.store.abort(f.sessions[0]!, abort)).toEqual(result);
    const saved = (
      await f.database.pool.query<{ state: unknown }>('SELECT state FROM matches WHERE id = $1', [
        state.matchId,
      ])
    ).rows[0]!.state;
    const decoded = classic.decodeMatch(saved);
    expect(decoded.pending).toBeNull();
    expect(decoded.outcome).toEqual({ status: 'aborted', winner: null, winnerSeatIds: [] });
  });

  it('fails closed on a contradictory persisted mass cursor before projection, commands or entropy', async () => {
    const f = await readyRoom(4);
    const state = classic.decodeMatch(
      (
        await f.database.pool.query<{ state: unknown }>('SELECT state FROM matches WHERE id = $1', [
          f.started.matchId,
        ])
      ).rows[0]!.state,
    );
    // Build a legitimate pending response through the real engine before corrupting one field.
    const gatling = moveFixtureCard(state, 0, 'hand', 'gatling');
    moveFixtureCard(state, 1, 'equipment', 'barrel');
    state.turn.phase = 'play';
    classic.decodeMatch(state);
    await f.database.pool.query('UPDATE matches SET state = $2::jsonb WHERE id = $1', [
      state.matchId,
      JSON.stringify(state),
    ]);
    expect(
      await f.store.command(f.sessions[0]!, {
        commandId: 'gatling',
        expectedRevision: 1,
        matchId: state.matchId,
        intent: { type: 'play', cardId: gatling.id },
      }),
    ).toMatchObject({ ok: true, revision: 2 });
    const valid = classic.decodeMatch(
      (
        await f.database.pool.query<{ state: unknown }>('SELECT state FROM matches WHERE id = $1', [
          state.matchId,
        ])
      ).rows[0]!.state,
    );
    expect(valid.pending).toMatchObject({
      kind: 'mass_response',
      ownerSeatId: f.sessions[1]!.seatId,
    });
    expect(valid.massEffect?.currentSeatId).toBe(f.sessions[1]!.seatId);
    valid.massEffect!.currentSeatId = f.sessions[2]!.seatId;
    // SQL corruption is confined to this test's isolated schema; every other field is unchanged.
    await f.database.pool.query('UPDATE matches SET state = $2::jsonb WHERE id = $1', [
      state.matchId,
      JSON.stringify(valid),
    ]);
    const capture = async () => ({
      matches: (
        await f.database.pool.query(
          'SELECT id, room_id, revision, status, state, updated_at FROM matches ORDER BY id',
        )
      ).rows,
      rooms: (
        await f.database.pool.query(
          'SELECT id, status, revision, host_seat_id, updated_at FROM rooms ORDER BY id',
        )
      ).rows,
      receipts: (
        await f.database.pool.query('SELECT * FROM game_command_receipts ORDER BY command_id')
      ).rows,
    });
    const before = await capture();
    const restarted = createPostgresGameStore(schema.open().pool, classic, {
      random: { int: f.int },
    });
    f.int.mockClear();
    // The store throws the safe decoder error; socket handlers translate it to unavailable.
    for (const store of [f.store, restarted]) {
      await expect(store.sync(f.sessions[0]!)).rejects.toThrow(/^Invalid saved classic match$/);
      for (const method of ['decline', 'barrel'] as const) {
        await expect(
          store.command(f.sessions[1]!, {
            commandId: `corrupt-${method}`,
            expectedRevision: 2,
            matchId: state.matchId,
            intent: { type: 'respond', decisionId: valid.pending!.id, method },
          }),
        ).rejects.toThrow(/^Invalid saved classic match$/);
      }
    }
    expect(f.int).not.toHaveBeenCalled();
    expect(await capture()).toEqual(before);
  });

  it('preserves both public Lucky Duke check cards for every authorized seat across restart without exposing hands or deck order', async () => {
    const f = await readyRoom(4);
    const state = classic.decodeMatch(
      (
        await f.database.pool.query<{ state: unknown }>('SELECT state FROM matches WHERE id = $1', [
          f.started.matchId,
        ])
      ).rows[0]!.state,
    );
    state.players[1]!.characterId = 'lucky_duke';
    state.players[1]!.maxHp = 4 + Number(state.players[1]!.role === 'sheriff');
    state.players[1]!.hp = state.players[1]!.maxHp;
    moveFixtureCard(state, 1, 'equipment', 'barrel');
    const bang = moveFixtureCard(state, 0, 'hand', 'bang');
    state.turn.phase = 'play';
    classic.decodeMatch(state);
    await f.database.pool.query('UPDATE matches SET state = $2::jsonb WHERE id = $1', [
      state.matchId,
      JSON.stringify(state),
    ]);
    expect(
      await f.store.command(f.sessions[0]!, {
        commandId: 'shot',
        expectedRevision: 1,
        matchId: state.matchId,
        intent: { type: 'play', cardId: bang.id, targetSeatId: f.sessions[1]!.seatId },
      }),
    ).toMatchObject({ ok: true, revision: 2 });
    const defense = await f.store.sync(f.sessions[1]!);
    if (!defense.ok) throw new Error('Missing Lucky defense.');
    expect(
      await f.store.command(f.sessions[1]!, {
        commandId: 'barrel',
        expectedRevision: 2,
        matchId: state.matchId,
        intent: { type: 'respond', decisionId: defense.game.pending!.id, method: 'barrel' },
      }),
    ).toMatchObject({ ok: true, revision: 3 });
    const saved = classic.decodeMatch(
      (
        await f.database.pool.query<{ state: unknown }>('SELECT state FROM matches WHERE id = $1', [
          state.matchId,
        ])
      ).rows[0]!.state,
    );
    if (saved.pending?.kind !== 'lucky_duke') throw new Error('Missing Lucky check pool.');
    const pool = saved.pending.cards;
    expect(pool).toHaveLength(2);
    const restarted = createPostgresGameStore(schema.open().pool, classic, {
      random: { int: f.int },
    });
    f.int.mockClear();
    for (const session of f.sessions) {
      const view = await f.store.sync(session);
      if (!view.ok) throw new Error('Missing authorized Lucky view.');
      expect(view.game.revealedCards).toEqual(pool);
      expect(await restarted.sync(session)).toEqual(view);
      const selection = view.game.actions.find(
        (action) => action.intent.type === 'choose',
      )?.selection;
      if (session.seatId === f.sessions[1]!.seatId) expect(selection?.cards).toEqual(pool);
      else expect(selection).toBeUndefined();
      for (const other of saved.players.filter((player) => player.seatId !== session.seatId)) {
        for (const card of other.hand)
          expect(JSON.stringify(view.game)).not.toContain(`"${card.id}"`);
        expect(view.game.players.find((player) => player.seatId === other.seatId)?.role).toBe(
          other.role === 'sheriff' ? 'sheriff' : null,
        );
      }
      expect(view.game).not.toHaveProperty('deck');
      expect(view.game).not.toHaveProperty('state');
      expect(JSON.stringify(view.game)).not.toContain(`"${saved.deck[0]!.id}"`);
    }
    expect(f.int).not.toHaveBeenCalled();
  });

  it.each(['rescue', 'lucky_duke', 'general_store'] as const)(
    'atomically aborts and retries at a real %s boundary',
    async (kind) => {
      const f = await readyRoom(4);
      const state = (
        await f.database.pool.query<{ state: MatchState }>(
          'SELECT state FROM matches WHERE id = $1',
          [f.started.matchId],
        )
      ).rows[0]!.state;
      // Rare-boundary fixture: retain assigned roles/characters and all 80 actual cards.
      for (const player of state.players) {
        player.hand = [];
        player.equipment = [];
      }
      state.deck = classic.CLASSIC_DECK.map((card) => ({ ...card }));
      state.discard = [];
      const source = state.players[0]!;
      const target = state.players[1]!;
      const sourceSession = f.sessions[0]!;
      const targetSession = f.sessions[1]!;
      const take = (cardKind: classic.CardKind) =>
        state.deck.splice(
          state.deck.findIndex((card) => card.kind === cardKind),
          1,
        )[0]!;
      const attack = take(kind === 'general_store' ? 'general_store' : 'bang');
      source.hand.push(attack);
      if (kind === 'rescue') {
        target.hp = 1;
        target.hand.push(take('beer'));
      }
      if (kind === 'lucky_duke') {
        target.characterId = 'lucky_duke';
        target.hp = target.maxHp = 4;
        target.equipment.push(take('barrel'));
      }
      state.turn = { seatId: source.seatId, phase: 'play', number: 1, bangsPlayed: 0 };
      state.pending = { id: `${state.matchId}:fixture`, kind: 'turn', ownerSeatId: source.seatId };
      classic.decodeMatch(state);
      await f.database.pool.query('UPDATE matches SET state = $2::jsonb WHERE id = $1', [
        state.matchId,
        JSON.stringify(state),
      ]);
      const play: classic.GameIntent = {
        type: 'play',
        cardId: attack.id,
        ...(kind === 'general_store' ? {} : { targetSeatId: target.seatId }),
      };
      expect(
        await f.store.command(sourceSession, {
          commandId: 'attack',
          expectedRevision: 1,
          matchId: state.matchId,
          intent: play,
        }),
      ).toMatchObject({ ok: true, revision: 2 });
      let pending = await f.store.sync(targetSession);
      if (!pending.ok) throw new Error('Missing response view.');
      if (kind !== 'general_store') {
        expect(
          await f.store.command(targetSession, {
            commandId: 'response',
            expectedRevision: 2,
            matchId: state.matchId,
            intent: {
              type: 'respond',
              decisionId: pending.game.pending!.id,
              method: kind === 'rescue' ? 'decline' : 'barrel',
            },
          }),
        ).toMatchObject({ ok: true, revision: 3 });
        pending = await f.store.sync(targetSession);
      }
      expect(pending).toMatchObject({ ok: true, game: { pending: { kind } } });
      if (!pending.ok) throw new Error('Missing pending view.');
      const before = (
        await f.database.pool.query<{ state: MatchState }>(
          'SELECT state FROM matches WHERE id = $1',
          [state.matchId],
        )
      ).rows[0]!.state;
      const request = {
        commandId: 'abort',
        expectedRevision: pending.game.revision,
        matchId: state.matchId,
      };
      const aborted = await f.store.abort(f.sessions[0]!, request);
      expect(aborted).toMatchObject({ ok: true, status: 'aborted' });
      const reopened = createPostgresGameStore(schema.open().pool, classic);
      expect(await reopened.abort(f.sessions[0]!, request)).toEqual(aborted);
      const after = classic.decodeMatch(
        (
          await f.database.pool.query<{ state: unknown }>(
            'SELECT state FROM matches WHERE id = $1',
            [state.matchId],
          )
        ).rows[0]!.state,
      );
      expect(after.pending).toBeNull();
      expect(after.players.map(({ hp, alive }) => ({ hp, alive }))).toEqual(
        before.players.map(({ hp, alive }) => ({ hp, alive })),
      );
      expect(after.outcome).toEqual({ status: 'aborted', winner: null, winnerSeatIds: [] });
      if (kind === 'rescue') expect(after.players[1]).toMatchObject({ alive: true, hp: 0 });
    },
  );

  it('allows the fixed authenticated host to abort after elimination', async () => {
    const f = await readyRoom(4);
    const state = (
      await f.database.pool.query<{ state: MatchState }>(
        'SELECT state FROM matches WHERE id = $1',
        [f.started.matchId],
      )
    ).rows[0]!.state;
    // Rare lifecycle fixture: the host is an eliminated outlaw; another seat is sheriff.
    const host = state.players[0]!;
    const sheriff = state.players[1]!;
    host.role = 'outlaw';
    host.maxHp = 4;
    host.hp = 0;
    host.alive = false;
    sheriff.role = 'sheriff';
    sheriff.maxHp = 5;
    sheriff.hp = 5;
    state.deck.push(...host.hand, ...host.equipment);
    host.hand = [];
    host.equipment = [];
    state.turn.seatId = sheriff.seatId;
    state.pending = { id: `${state.matchId}:fixture`, kind: 'turn', ownerSeatId: sheriff.seatId };
    classic.decodeMatch(state);
    await f.database.pool.query('UPDATE matches SET state = $2::jsonb WHERE id = $1', [
      state.matchId,
      JSON.stringify(state),
    ]);
    const request = { commandId: 'dead-host-abort', expectedRevision: 1, matchId: state.matchId };
    expect(await f.store.abort(f.sessions[0]!, request)).toMatchObject({
      ok: true,
      status: 'aborted',
    });
    expect(await f.store.sync(f.sessions[0]!)).toMatchObject({
      ok: true,
      game: { ownRole: 'outlaw', outcome: { status: 'aborted', winner: null } },
    });
  });

  it('persists Sid interruption without replacing another actor decision and deduplicates payment across restart', async () => {
    const f = await readyRoom(4);
    const state = (
      await f.database.pool.query<{ state: MatchState }>(
        'SELECT state FROM matches WHERE id = $1',
        [f.started.matchId],
      )
    ).rows[0]!.state;
    for (const actor of state.players) {
      actor.hand = [];
      actor.equipment = [];
    }
    state.deck = classic.CLASSIC_DECK.map((card) => ({ ...card }));
    state.discard = [];
    const take = (kind: classic.CardKind) =>
      state.deck.splice(
        state.deck.findIndex((card) => card.kind === kind),
        1,
      )[0]!;
    const bang = take('bang');
    state.players[0]!.hand.push(bang);
    const sid = state.players[2]!;
    sid.characterId = 'sid_ketchum';
    sid.maxHp = 4;
    sid.hp = 3;
    sid.hand.push(take('missed'), take('beer'));
    const payment: [string, string] = [sid.hand[0]!.id, sid.hand[1]!.id];
    state.turn = { seatId: state.players[0]!.seatId, phase: 'play', number: 1, bangsPlayed: 0 };
    state.pending = {
      id: `${state.matchId}:fixture`,
      kind: 'turn',
      ownerSeatId: state.players[0]!.seatId,
    };
    classic.decodeMatch(state);
    await f.database.pool.query('UPDATE matches SET state = $2::jsonb WHERE id = $1', [
      state.matchId,
      JSON.stringify(state),
    ]);
    expect(
      await f.store.command(f.sessions[0]!, {
        commandId: 'shot',
        expectedRevision: 1,
        matchId: state.matchId,
        intent: { type: 'play', cardId: bang.id, targetSeatId: state.players[1]!.seatId },
      }),
    ).toMatchObject({ ok: true, revision: 2 });
    const before = (
      await f.database.pool.query<{ state: MatchState }>(
        'SELECT state FROM matches WHERE id = $1',
        [state.matchId],
      )
    ).rows[0]!.state;
    const request = {
      commandId: 'sid',
      expectedRevision: 2,
      matchId: state.matchId,
      intent: { type: 'sid_heal', cardIds: payment },
    };
    const accepted = await f.store.command(f.sessions[2]!, request);
    expect(accepted).toMatchObject({ ok: true, revision: 3 });
    const restarted = createPostgresGameStore(schema.open().pool, classic, {
      random: { int: f.int },
    });
    const entropy = f.int.mock.calls.length;
    expect(await restarted.command(f.sessions[2]!, request)).toEqual(accepted);
    expect(
      await restarted.command(f.sessions[2]!, { ...request, commandId: 'stale-sid' }),
    ).toMatchObject({ ok: false, error: 'stale_revision' });
    expect(f.int).toHaveBeenCalledTimes(entropy);
    const after = classic.decodeMatch(
      (
        await f.database.pool.query<{ state: unknown }>('SELECT state FROM matches WHERE id = $1', [
          state.matchId,
        ])
      ).rows[0]!.state,
    );
    expect(after.pending).toEqual(before.pending);
    expect(after.tasks).toEqual(before.tasks);
    expect(after.players[2]).toMatchObject({ hp: 4, hand: [] });
    expect(after.discard.slice(-2).map((card) => card.id)).toEqual(payment);
  });

  it.each(['sheriff_deputies', 'outlaws', 'renegade'] as const)(
    'durably accepts the actual engine transition to %s victory',
    async (winner) => {
      const f = await readyRoom(4);
      const state = (
        await f.database.pool.query<{ state: MatchState }>(
          'SELECT state FROM matches WHERE id = $1',
          [f.started.matchId],
        )
      ).rows[0]!.state;
      // Boundary fixture, separate from the full normal-deal socket traces.
      for (const actor of state.players) {
        actor.hand = [];
        actor.equipment = [];
      }
      state.deck = classic.CLASSIC_DECK.map((card) => ({ ...card }));
      state.discard = [];
      const sourceIndex = winner === 'sheriff_deputies' ? 0 : winner === 'outlaws' ? 1 : 3;
      const targetIndex = winner === 'sheriff_deputies' ? 1 : 0;
      if (winner !== 'outlaws') {
        for (const [index, actor] of state.players.entries())
          if (index !== sourceIndex && index !== targetIndex) {
            actor.alive = false;
            actor.hp = 0;
          }
      }
      const source = state.players[sourceIndex]!;
      const target = state.players[targetIndex]!;
      target.hp = 1;
      const bang = state.deck.splice(
        state.deck.findIndex((card) => card.kind === 'bang'),
        1,
      )[0]!;
      source.hand.push(bang);
      state.turn = { seatId: source.seatId, phase: 'play', number: 1, bangsPlayed: 0 };
      state.pending = { id: `${state.matchId}:fixture`, kind: 'turn', ownerSeatId: source.seatId };
      classic.decodeMatch(state);
      await f.database.pool.query('UPDATE matches SET state = $2::jsonb WHERE id = $1', [
        state.matchId,
        JSON.stringify(state),
      ]);
      expect(
        await f.store.command(f.sessions[sourceIndex]!, {
          commandId: 'last-shot',
          expectedRevision: 1,
          matchId: state.matchId,
          intent: { type: 'play', cardId: bang.id, targetSeatId: target.seatId },
        }),
      ).toMatchObject({ ok: true, revision: 2 });
      const response = await f.store.sync(f.sessions[targetIndex]!);
      if (!response.ok) throw new Error('Missing defense.');
      let envelope = {
        commandId: 'last-decline',
        expectedRevision: 2,
        matchId: state.matchId,
        intent: { type: 'respond', decisionId: response.game.pending!.id, method: 'decline' },
      };
      let accepted = await f.store.command(f.sessions[targetIndex]!, envelope);
      expect(accepted).toMatchObject({ ok: true, status: 'active', revision: 3 });
      const rescue = await f.store.sync(f.sessions[targetIndex]!);
      if (!rescue.ok) throw new Error('Missing lethal decision.');
      expect(rescue.game.pending?.kind).toBe('rescue');
      envelope = {
        ...envelope,
        commandId: 'no-rescue',
        expectedRevision: 3,
        intent: { type: 'respond', decisionId: rescue.game.pending!.id, method: 'decline' },
      };
      accepted = await f.store.command(f.sessions[targetIndex]!, envelope);
      expect(accepted).toMatchObject({ ok: true, status: 'finished', revision: 4 });
      const restarted = createPostgresGameStore(schema.open().pool, classic);
      expect(await restarted.command(f.sessions[targetIndex]!, envelope)).toEqual(accepted);
      expect(await restarted.sync(f.sessions[0]!)).toMatchObject({
        ok: true,
        game: { outcome: { status: 'finished', winner } },
      });
      expect(
        await restarted.abort(f.sessions[0]!, {
          commandId: 'too-late',
          expectedRevision: 4,
          matchId: state.matchId,
        }),
      ).toEqual({ ok: false, error: 'match_ended' });
    },
  );
});
