import { describe, expect, it } from 'vitest';
import { applyIntent, decodeMatch, projectMatch } from '../src/index.js';
import type { MatchState } from '../src/index.js';
import {
  character,
  decline,
  equip,
  explodingCheck,
  fresh,
  give,
  playCard,
  step,
  turn,
  zeroRandom,
} from './engine-fixtures.js';

function mass(kind: 'gatling' | 'indians' = 'gatling'): MatchState {
  const state = fresh();
  give(state, 0, kind);
  return playCard(state, 0, kind);
}
function massLucky(): MatchState {
  const state = fresh();
  character(state, 1, 'lucky_duke');
  equip(state, 1, 'barrel');
  give(state, 0, 'gatling');
  const attacked = playCard(state, 0, 'gatling');
  return step(attacked, 1, { type: 'respond', decisionId: attacked.pending!.id, method: 'barrel' });
}
function massRescue(): MatchState {
  const state = fresh();
  state.players[1]!.hp = 1;
  give(state, 0, 'gatling');
  return decline(playCard(state, 0, 'gatling'));
}
function massElimination(): MatchState {
  const state = fresh();
  state.players[1]!.hp = 1;
  give(state, 0, 'gatling');
  give(state, 1, 'beer', 'missed');
  return decline(decline(playCard(state, 0, 'gatling')));
}
function massPenalty(): MatchState {
  const state = fresh(5);
  state.players[1]!.hp = 1;
  give(state, 0, 'gatling', 'beer', 'missed');
  return decline(decline(playCard(state, 0, 'gatling')));
}
function check(type: 'jail' | 'dynamite'): MatchState {
  const state = fresh();
  character(state, 1, 'lucky_duke');
  equip(state, 1, type);
  return step(state, 0, { type: 'end_turn' });
}

describe('semantic recovery validation for mass attacks', () => {
  const corruptions: [string, () => MatchState, (state: MatchState) => void][] = [
    [
      'current cursor contradicts pending owner',
      mass,
      (state) => {
        state.massEffect!.currentSeatId = 'p2';
      },
    ],
    [
      'advanced cursor and prefix leave the old pending response',
      mass,
      (state) => {
        state.massEffect!.currentSeatId = 'p2';
        state.massEffect!.resolvedSeatIds = ['p1'];
      },
    ],
    [
      'order is not clockwise',
      mass,
      (state) => {
        state.massEffect!.order = ['p2', 'p1', 'p3'];
        state.massEffect!.currentSeatId = 'p2';
        state.pending!.ownerSeatId = 'p2';
      },
    ],
    [
      'order omits a live future target',
      mass,
      (state) => {
        state.massEffect!.order = ['p1', 'p3'];
      },
    ],
    [
      'resolved seats are not an exact prefix',
      mass,
      (state) => {
        state.massEffect!.resolvedSeatIds = ['p2'];
      },
    ],
    [
      'future target is already dead',
      mass,
      (state) => {
        state.players[2]!.alive = false;
        state.players[2]!.hp = 0;
      },
    ],
    [
      'attacker differs from turn actor',
      mass,
      (state) => {
        state.turn.seatId = 'p2';
      },
    ],
    [
      'mass continuation frame is duplicated',
      mass,
      (state) => {
        state.tasks.push({ type: 'mass_next' });
      },
    ],
    [
      'forced damage frame remains at a saved boundary',
      mass,
      (state) => {
        state.tasks.push({ type: 'damage', seatId: 'p1', sourceSeatId: 'p0', amount: 1 });
      },
    ],
    [
      'Gatling requires Bang instead of Missed',
      mass,
      (state) => {
        if (state.pending?.kind === 'mass_response') state.pending.requirement = 'bang';
      },
    ],
    [
      'Gatling requires two responses',
      mass,
      (state) => {
        if (state.pending?.kind === 'mass_response') state.pending.remaining = 2;
      },
    ],
    [
      'Indians resumes a Barrel check',
      () => {
        const state = fresh();
        equip(state, 1, 'barrel');
        give(state, 0, 'indians');
        return playCard(state, 0, 'indians');
      },
      (state) => {
        if (state.pending?.kind === 'mass_response') state.pending.barrelUsed = true;
      },
    ],
    [
      'Lucky embedded defense no longer matches mass cursor',
      massLucky,
      (state) => {
        state.massEffect!.currentSeatId = 'p2';
        state.massEffect!.resolvedSeatIds = ['p1'];
      },
    ],
    [
      'Lucky embedded defense uses the wrong requirement',
      massLucky,
      (state) => {
        if (state.pending?.kind === 'lucky_duke' && state.pending.check?.type === 'defense')
          state.pending.check.defense.requirement = 'bang';
      },
    ],
    [
      'rescue owner no longer matches mass cursor',
      massRescue,
      (state) => {
        state.massEffect!.currentSeatId = 'p2';
        state.massEffect!.resolvedSeatIds = ['p1'];
      },
    ],
    [
      'mass rescue attributes damage to another source',
      massRescue,
      (state) => {
        if (state.pending?.kind === 'rescue') state.pending.damage.sourceSeatId = 'p2';
      },
    ],
    [
      'mass rescue claims Dynamite-sized damage',
      massRescue,
      (state) => {
        if (state.pending?.kind === 'rescue') state.pending.damage.amount = 3;
      },
    ],
    [
      'dead victim discard cursor advances prematurely',
      massElimination,
      (state) => {
        state.massEffect!.currentSeatId = 'p2';
        state.massEffect!.resolvedSeatIds = ['p1'];
      },
    ],
    [
      'dead victim discard resumes another victim consequences',
      massElimination,
      (state) => {
        const task = state.tasks.at(-1);
        if (task?.type === 'kill_consequences') task.seatId = 'p2';
      },
    ],
    [
      'dead victim discard changes responsible source',
      massElimination,
      (state) => {
        const task = state.tasks.at(-1);
        if (task?.type === 'kill_consequences') task.sourceSeatId = 'p2';
      },
    ],
    [
      'Sheriff penalty points at the next living target',
      massPenalty,
      (state) => {
        state.massEffect!.currentSeatId = 'p2';
        state.massEffect!.resolvedSeatIds = ['p1'];
      },
    ],
  ];
  it.each(corruptions)(
    'rejects %s before projection or command, without entropy',
    (_name, build, corrupt) => {
      const state = build();
      corrupt(state);
      const before = JSON.stringify(state);
      expect(() => decodeMatch(JSON.parse(before))).toThrow('Invalid saved classic match');
      expect(() => projectMatch(state, 'p0')).toThrow('Invalid saved classic match');
      expect(
        applyIntent(
          state,
          state.pending!.ownerSeatId,
          { type: 'respond', decisionId: state.pending!.id, method: 'decline' },
          {
            int(): number {
              throw new Error('Corrupt recovery consumed entropy');
            },
          },
        ),
      ).toEqual({ ok: false, error: 'invalid_state' });
      expect(JSON.stringify(state)).toBe(before);
    },
  );
  it('reproduced cursor corruption cannot damage one player twice or skip another', () => {
    const state = mass();
    const originalHp = state.players.map((entry) => entry.hp);
    state.massEffect!.currentSeatId = 'p2';
    const result = applyIntent(
      state,
      'p1',
      { type: 'respond', decisionId: state.pending!.id, method: 'decline' },
      zeroRandom,
    );
    expect(result).toEqual({ ok: false, error: 'invalid_state' });
    expect(state.players.map((entry) => entry.hp)).toEqual(originalHp);
    expect(state.massEffect!.resolvedSeatIds).toEqual([]);
  });
  it('accepts an already-eliminated seat outside the original attack ring', () => {
    const state = fresh();
    state.players[2]!.alive = false;
    state.players[2]!.hp = 0;
    give(state, 0, 'gatling');
    const attacked = playCard(state, 0, 'gatling');
    expect(attacked.massEffect!.order).toEqual(['p1', 'p3']);
    expect(decodeMatch(JSON.parse(JSON.stringify(attacked)))).toEqual(attacked);
  });
});

describe('valid pending boundaries retain their exact continuation on restart', () => {
  const boundaries: [string, () => MatchState][] = [
    ['turn', fresh],
    [
      'draw choice',
      () => {
        const state = fresh();
        character(state, 0, 'jesse_jones');
        turn(state, 0, 'draw');
        return state;
      },
    ],
    [
      'Bang defense',
      () => {
        const state = fresh();
        give(state, 0, 'bang');
        return playCard(state, 0, 'bang', 1);
      },
    ],
    [
      'Duel',
      () => {
        const state = fresh();
        give(state, 0, 'duel');
        return playCard(state, 0, 'duel', 1);
      },
    ],
    ['mass response', mass],
    ['mass Lucky check', massLucky],
    ['mass rescue', massRescue],
    ['mass dead-player discard', massElimination],
    ['mass Sheriff penalty', massPenalty],
    [
      'Kit choice',
      () => {
        const state = fresh();
        character(state, 0, 'kit_carlson');
        turn(state, 0, 'draw');
        return step(state, 0, { type: 'draw', source: 'deck' });
      },
    ],
    [
      'General Store',
      () => {
        const state = fresh();
        give(state, 0, 'general_store');
        return playCard(state, 0, 'general_store');
      },
    ],
    ['Lucky Jail', () => check('jail')],
    ['Lucky Dynamite', () => check('dynamite')],
    [
      'Dynamite rescue',
      () => {
        const state = fresh();
        state.players[1]!.hp = 1;
        equip(state, 1, 'dynamite');
        explodingCheck(state);
        return step(state, 0, { type: 'end_turn' });
      },
    ],
    [
      'turn discard',
      () => {
        const state = fresh();
        give(state, 0, 'bang', 'bang', 'bang', 'bang', 'bang', 'missed');
        return step(state, 0, { type: 'end_turn' });
      },
    ],
  ];
  it.each(boundaries)('round-trips %s and a legal unrelated Sid interrupt', (_name, build) => {
    const state = build();
    character(state, 2, 'sid_ketchum');
    state.players[2]!.hp--;
    const cards = give(state, 2, 'beer', 'missed');
    const restored = decodeMatch(JSON.parse(JSON.stringify(state)));
    expect(restored).toEqual(state);
    const result = step(restored, 2, { type: 'sid_heal', cardIds: [cards[0]!.id, cards[1]!.id] });
    expect(result.pending).toEqual(state.pending);
    expect(result.tasks).toEqual(state.tasks);
    expect(decodeMatch(JSON.parse(JSON.stringify(result)))).toEqual(result);
  });
  it('reveals both pending Lucky check cards to every participant after restart, while Kit stays private', () => {
    const lucky = decodeMatch(JSON.parse(JSON.stringify(massLucky())));
    if (lucky.pending?.kind !== 'lucky_duke') throw new Error('Expected Lucky check');
    for (const seat of lucky.players)
      expect(projectMatch(lucky, seat.seatId).revealedCards).toEqual(lucky.pending.cards);
    const state = fresh();
    character(state, 0, 'kit_carlson');
    turn(state, 0, 'draw');
    const kit = step(state, 0, { type: 'draw', source: 'deck' });
    if (kit.pending?.kind !== 'kit_carlson') throw new Error('Expected Kit choice');
    for (const seat of kit.players)
      expect(projectMatch(kit, seat.seatId).revealedCards).toEqual([]);
    expect(JSON.stringify(projectMatch(kit, 'p1'))).not.toContain(kit.pending.cards[0]!.id);
  });
});

describe('defense and check continuation semantics beyond mass effects', () => {
  it('rejects impossible Bang, Duel and Lucky continuation requirements', () => {
    const initial = fresh();
    give(initial, 0, 'bang');
    const attacked = playCard(initial, 0, 'bang', 1);
    if (attacked.pending?.kind !== 'defend') throw new Error('Expected defense');
    attacked.pending.remaining = 2;
    expect(() => decodeMatch(attacked)).toThrow();
    attacked.pending.remaining = 1;
    attacked.pending.requirement = 'bang';
    expect(() => decodeMatch(attacked)).toThrow();
    const duel = fresh();
    give(duel, 0, 'duel');
    equip(duel, 1, 'barrel');
    const response = playCard(duel, 0, 'duel', 1);
    if (response.pending?.kind !== 'duel') throw new Error('Expected Duel');
    response.pending.barrelUsed = true;
    expect(() => decodeMatch(response)).toThrow();
    const checked = check('jail');
    checked.tasks.push({ type: 'jail_check', seatId: 'p1' });
    expect(() => decodeMatch(checked)).toThrow();
  });
  it('rejects a General Store queue reordered despite a valid card count', () => {
    const initial = fresh();
    give(initial, 0, 'general_store');
    const state = playCard(initial, 0, 'general_store');
    if (state.pending?.kind !== 'general_store') throw new Error('Expected Store');
    state.pending.remainingSeatIds = ['p2', 'p1', 'p3'];
    expect(() => decodeMatch(state)).toThrow();
  });
});
