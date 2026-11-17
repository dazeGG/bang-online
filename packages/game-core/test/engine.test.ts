import { describe, expect, it } from 'vitest';
import {
  abortMatch,
  applyIntent,
  CLASSIC_CHARACTERS,
  CLASSIC_DECK,
  createMatch,
  decodeMatch,
  projectMatch,
} from '../src/index.js';
import type { CardKind, CharacterId, GameIntent, MatchState } from '../src/index.js';
import {
  character,
  decline,
  equip,
  explodingCheck,
  fresh,
  give,
  pick,
  playCard,
  seeded,
  step,
  top,
  turn,
  zeroRandom,
} from './engine-fixtures.js';

describe('setup, boundaries and saved state', () => {
  it.each([4, 5, 6, 7])('deals a deterministic, conserving %i-player game (R p2)', (count) => {
    const input = {
      matchId: 'm',
      hostSeatId: 'p0',
      rulesetVersion: 'classic-v1' as const,
      participants: Array.from({ length: count }, (_, index) => ({
        seatId: `p${index}`,
        seatIndex: index,
        name: `P${index}`,
      })),
    };
    const state = createMatch(input, seeded(77));
    expect(state).toEqual(createMatch(input, seeded(77)));
    expect(state).not.toEqual(createMatch(input, seeded(78)));
    expect(state.players.filter((actor) => actor.role === 'sheriff')).toHaveLength(1);
    for (const actor of state.players) expect(actor.hand).toHaveLength(actor.maxHp);
    expect(state.turn.seatId).toBe(state.players.find((actor) => actor.role === 'sheriff')!.seatId);
    expect(decodeMatch(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });
  it('rejects invalid setup before entropy and never mutates inputs', () => {
    expect(() =>
      createMatch(
        { matchId: 'x', rulesetVersion: 'classic-v1', hostSeatId: 'p0', participants: [] },
        {
          int() {
            throw new Error('entropy');
          },
        },
      ),
    ).toThrow('Invalid match setup');
    const state = fresh(),
      original = JSON.stringify(state);
    expect(applyIntent(state, 'p1', { type: 'end_turn' }, zeroRandom)).toEqual({
      ok: false,
      error: 'wrong_actor',
    });
    give(state, 0, 'beer');
    const before = JSON.stringify(state);
    playCard(state, 0, 'beer');
    expect(JSON.stringify(state)).toBe(before);
    expect(original).not.toBe(before);
  });
  it('accepts semantic intent key order and rejects extra fields', () => {
    const state = fresh();
    give(state, 0, 'bang');
    const id = state.players[0]!.hand[0]!.id;
    expect(
      applyIntent(state, 'p0', { targetSeatId: 'p1', cardId: id, type: 'play' }, zeroRandom).ok,
    ).toBe(true);
    expect(
      applyIntent(
        state,
        'p0',
        { type: 'play', cardId: id, targetSeatId: 'p1', injected: true } as GameIntent,
        zeroRandom,
      ).ok,
    ).toBe(false);
  });
  it.each([
    'schema',
    'catalog',
    'duplicate',
    'hidden_field',
    'continuation',
    'hp',
    'role',
    'unknown_card',
    'unknown_character',
  ])('fails closed on corrupt %s', (corruption) => {
    const raw = JSON.parse(JSON.stringify(fresh())) as Record<string, unknown>;
    if (corruption === 'schema') raw.schemaVersion = 2;
    if (corruption === 'catalog') raw.catalogVersion = 'future';
    if (corruption === 'duplicate') (raw.deck as unknown[]).push((raw.deck as unknown[])[0]);
    if (corruption === 'hidden_field') raw.token = 'private';
    if (corruption === 'continuation') raw.tasks = [{ type: 'whatever' }];
    const players = raw.players as Record<string, unknown>[];
    if (corruption === 'hp') players[0]!.hp = 99;
    if (corruption === 'role') players[0]!.role = 'outlaw';
    if (corruption === 'unknown_card') (raw.deck as Record<string, unknown>[])[0]!.id = 'x';
    if (corruption === 'unknown_character') players[0]!.characterId = 'x';
    expect(() => decodeMatch(raw)).toThrow('Invalid saved classic match');
  });
  it('keeps projections detached and every hidden identity private, even terminal', () => {
    const state = fresh();
    give(state, 1, 'bang', 'beer');
    const view = projectMatch(state, 'p0');
    expect(view.players[1]!.role).toBeNull();
    expect(view.players[1]!.handCount).toBe(2);
    const text = JSON.stringify(view);
    expect(text).not.toContain(state.players[1]!.hand[0]!.id);
    expect(text).not.toContain('deck');
    expect(text).not.toContain('tasks');
    const aborted = abortMatch(state, 'p0');
    expect(aborted.ok).toBe(true);
    if (!aborted.ok) return;
    expect(projectMatch(aborted.state, 'p0').players[1]!.role).toBeNull();
    expect(abortMatch(state, 'p1')).toEqual({ ok: false, error: 'forbidden' });
    expect(applyIntent(aborted.state, 'p0', { type: 'end_turn' }, zeroRandom)).toEqual({
      ok: false,
      error: 'match_ended',
    });
    expect(() => projectMatch(state, 'unknown')).toThrow();
  });
});

describe('turns, all equipment and targeting', () => {
  it('draws before play and requires ordered excess discards (R p3; F Q12)', () => {
    let state = fresh();
    turn(state, 0, 'draw');
    give(state, 0, 'bang');
    expect(
      applyIntent(
        state,
        'p0',
        { type: 'play', cardId: state.players[0]!.hand[0]!.id, targetSeatId: 'p1' },
        zeroRandom,
      ).ok,
    ).toBe(false);
    state = step(state, 0, { type: 'draw', source: 'deck' });
    expect(state.players[0]!.hand).toHaveLength(3);
    give(state, 0, 'missed', 'missed', 'missed');
    state = step(state, 0, { type: 'end_turn' });
    expect(state.pending!.kind).toBe('turn_discard');
    const last = state.players[0]!.hand[0]!;
    state = pick(state, [last.id]);
    expect(state.discard.at(-1)!.id).toBe(last.id);
    expect(state.turn.seatId).toBe('p1');
  });
  it.each([
    'barrel',
    'scope',
    'mustang',
    'dynamite',
    'volcanic',
    'schofield',
    'remington',
    'rev_carabine',
    'winchester',
  ] as CardKind[])('plays %s and prohibits duplicate kind (R p5)', (kind) => {
    const state = fresh();
    const [card] = give(state, 0, kind);
    const next = playCard(state, 0, kind);
    expect(next.players[0]!.equipment.map((entry) => entry.id)).toContain(card!.id);
    if (CLASSIC_DECK.filter((entry) => entry.kind === kind).length > 1) {
      give(next, 0, kind);
      expect(
        projectMatch(next, 'p0').actions.some(
          (action) =>
            action.intent.type === 'play' &&
            action.intent.cardId === next.players[0]!.hand.at(-1)!.id,
        ),
      ).toBe(false);
    }
  });
  it('replaces the weapon and respects range versus Panic (F Q04)', () => {
    let state = fresh();
    character(state, 0, 'bart_cassidy');
    character(state, 2, 'black_jack');
    equip(state, 0, 'schofield');
    const [newWeapon, bang, panic] = give(state, 0, 'winchester', 'bang', 'panic');
    give(state, 2, 'beer');
    state = playCard(state, 0, 'winchester');
    expect(state.players[0]!.equipment).toEqual([newWeapon]);
    expect(state.discard.at(-1)!.kind).toBe('schofield');
    const actions = projectMatch(state, 'p0').actions;
    expect(
      actions.some(
        (action) =>
          action.intent.type === 'play' &&
          action.intent.cardId === bang!.id &&
          action.intent.targetSeatId === 'p2',
      ),
    ).toBe(true);
    expect(
      actions.some(
        (action) =>
          action.intent.type === 'play' &&
          action.intent.cardId === panic!.id &&
          action.intent.targetSeatId === 'p2',
      ),
    ).toBe(false);
  });
  it('Scope/Rose and Mustang/Paul modify alive-ring distance, minimum one', () => {
    let state = fresh();
    character(state, 0, 'rose_doolan');
    character(state, 1, 'paul_regret');
    equip(state, 1, 'mustang');
    give(state, 0, 'bang');
    const options = () =>
      projectMatch(state, 'p0')
        .actions.filter((action) => action.intent.type === 'play')
        .map((action) => action.intent);
    expect(options().some((intent) => intent.type === 'play' && intent.targetSeatId === 'p1')).toBe(
      false,
    );
    equip(state, 0, 'scope');
    expect(options().some((intent) => intent.type === 'play' && intent.targetSeatId === 'p1')).toBe(
      true,
    );
    state = playCard(state, 0, 'bang', 1);
    expect(state.pending!.ownerSeatId).toBe('p1');
  });
  it('Jail excludes sheriff/self and all role/character cards (F Q08)', () => {
    const state = fresh();
    turn(state, 1);
    const [jail] = give(state, 1, 'jail');
    const actions = projectMatch(state, 'p1').actions.filter(
      (action) => action.intent.type === 'play' && action.intent.cardId === jail!.id,
    );
    expect(actions).toHaveLength(2);
    expect(
      actions.every(
        (action) =>
          action.intent.type === 'play' && !['p0', 'p1'].includes(action.intent.targetSeatId!),
      ),
    ).toBe(true);
    expect(
      applyIntent(state, 'p1', { type: 'play', cardId: jail!.id, targetSeatId: 'p0' }, zeroRandom)
        .ok,
    ).toBe(false);
  });
  it('places Jail on the chosen non-sheriff and refuses another Jail there', () => {
    let state = fresh();
    give(state, 0, 'jail', 'jail');
    state = playCard(state, 0, 'jail', 1);
    expect(state.players[1]!.equipment[0]!.kind).toBe('jail');
    expect(
      projectMatch(state, 'p0').actions.some(
        (action) => action.intent.type === 'play' && action.intent.targetSeatId === 'p1',
      ),
    ).toBe(false);
  });
  it.each(['panic', 'cat_balou'] as CardKind[])(
    '%s selects public equipment or opaque random hand, including self (R p7; T15)',
    (kind) => {
      let state = fresh();
      character(state, 1, 'black_jack');
      give(state, 0, kind);
      const [beer] = give(state, 1, 'beer');
      state = playCard(state, 0, kind, 1, 'hand');
      expect(state.players[1]!.hand).toHaveLength(0);
      expect(kind === 'panic' ? state.players[0]!.hand[0]!.id : state.discard.at(-1)!.id).toBe(
        beer!.id,
      );
      give(state, 0, kind);
      const [barrel] = equip(state, 0, 'barrel');
      state = playCard(state, 0, kind, 0, 'equipment', barrel!.id);
      expect(state.players[0]!.equipment).toHaveLength(0);
      expect(
        kind === 'panic'
          ? state.players[0]!.hand.some((card) => card.id === barrel!.id)
          : state.discard.at(-1)!.id === barrel!.id,
      ).toBe(true);
    },
  );
});

describe('responses, attack allowance and healing', () => {
  it('requires explicit defense/decline and completes prior effect first (F Q13)', () => {
    let state = fresh();
    give(state, 0, 'bang', 'beer');
    const [missed] = give(state, 1, 'missed');
    state = playCard(state, 0, 'bang', 1);
    const hp = state.players[1]!.hp;
    expect(applyIntent(state, 'p0', { type: 'end_turn' }, zeroRandom).ok).toBe(false);
    state = step(state, 1, {
      type: 'respond',
      decisionId: state.pending!.id,
      method: 'card',
      cardId: missed!.id,
    });
    expect(state.players[1]!.hp).toBe(hp);
    expect(state.pending!.ownerSeatId).toBe('p0');
  });
  it('ordinary Bang limit, Willy and Volcanic exceptions (R p5)', () => {
    for (const mode of ['normal', 'willy', 'volcanic']) {
      let state = fresh();
      character(state, 0, mode === 'willy' ? 'willy_the_kid' : 'bart_cassidy');
      if (mode === 'volcanic') equip(state, 0, 'volcanic');
      give(state, 0, 'bang', 'bang');
      state = decline(playCard(state, 0, 'bang', 1));
      expect(
        projectMatch(state, 'p0').actions.some((action) => action.intent.type === 'play'),
      ).toBe(mode !== 'normal');
    }
  });
  it('Barrel contributes one response against Slab; Jourdonnais stacks (F Q02)', () => {
    let state = fresh();
    character(state, 0, 'slab_the_killer');
    character(state, 1, 'jourdonnais');
    give(state, 0, 'bang');
    equip(state, 1, 'barrel');
    top(state, 'beer', 'beer');
    state = playCard(state, 0, 'bang', 1);
    expect(projectMatch(state, 'p1').pending!.requiredResponses).toBe(2);
    state = step(state, 1, { type: 'respond', decisionId: state.pending!.id, method: 'barrel' });
    expect(projectMatch(state, 'p1').pending!.requiredResponses).toBe(1);
    expect(
      projectMatch(state, 'p1').actions.some(
        (action) => action.intent.type === 'respond' && action.intent.method === 'barrel',
      ),
    ).toBe(false);
    state = step(state, 1, { type: 'respond', decisionId: state.pending!.id, method: 'innate' });
    expect(state.pending!.ownerSeatId).toBe('p0');
  });
  it('Calamity converts both directions, including Duel and Indians (F Q20)', () => {
    let state = fresh();
    character(state, 1, 'calamity_janet');
    give(state, 0, 'duel');
    const [missed] = give(state, 1, 'missed');
    state = playCard(state, 0, 'duel', 1);
    state = step(state, 1, {
      type: 'respond',
      decisionId: state.pending!.id,
      method: 'card',
      cardId: missed!.id,
    });
    expect(state.pending!.ownerSeatId).toBe('p0');
    state = decline(state);
    turn(state, 1);
    give(state, 1, 'missed');
    state = playCard(state, 1, 'missed', 2);
    expect(state.turn.bangsPlayed).toBe(1);
  });
  it('Duel alternates, discards Bang without using allowance, source stays initiator (F Q06,Q21,Q23)', () => {
    let state = fresh();
    give(state, 0, 'duel', 'bang');
    const [bang] = give(state, 1, 'bang');
    state = playCard(state, 0, 'duel', 1);
    state = step(state, 1, {
      type: 'respond',
      decisionId: state.pending!.id,
      method: 'card',
      cardId: bang!.id,
    });
    expect(state.turn.bangsPlayed).toBe(0);
    const hp = state.players[0]!.hp;
    state = decline(state);
    expect(state.players[0]!.hp).toBe(hp - 1);
    expect(state.turn.bangsPlayed).toBe(0);
  });
  it('Beer full-health/two-player is legal and ineffective; Saloon works for two (F Q09,Q16,Q25)', () => {
    let state = fresh();
    give(state, 0, 'beer');
    const full = state.players[0]!.hp;
    state = playCard(state, 0, 'beer');
    expect(state.players[0]!.hp).toBe(full);
    state.players[1]!.alive = false;
    state.players[1]!.hp = 0;
    state.players[2]!.alive = false;
    state.players[2]!.hp = 0;
    state.players[0]!.hp--;
    state.players[3]!.hp--;
    give(state, 0, 'beer', 'saloon');
    state = playCard(state, 0, 'beer');
    expect(state.players[0]!.hp).toBe(full - 1);
    state = playCard(state, 0, 'saloon');
    expect(state.players[0]!.hp).toBe(full);
    expect(state.players[1]!.alive).toBe(false);
  });
  it('lethal rescue precedes reactive cards; Saloon cannot rescue or resurrect (F Q10,Q11,Q17)', () => {
    let state = fresh();
    character(state, 1, 'bart_cassidy');
    state.players[1]!.hp = 1;
    give(state, 0, 'bang');
    const [beer] = give(state, 1, 'beer', 'saloon');
    state = decline(playCard(state, 0, 'bang', 1));
    expect(state.pending!.kind).toBe('rescue');
    expect(state.players[1]!.hand).toHaveLength(2);
    expect(
      projectMatch(state, 'p1').actions.filter(
        (action) => action.intent.type === 'respond' && action.intent.method === 'card',
      ),
    ).toHaveLength(1);
    state = step(state, 1, {
      type: 'respond',
      decisionId: state.pending!.id,
      method: 'card',
      cardId: beer!.id,
    });
    expect(state.players[1]!.hp).toBe(1);
    expect(state.players[1]!.hand).toHaveLength(2);
  });
});

describe('all draw abilities, check choices and serializable continuations', () => {
  it.each(['stagecoach', 'wells_fargo'] as CardKind[])(
    '%s draws correct amount with source already discarded (R p7)',
    (kind) => {
      let state = fresh();
      give(state, 0, kind);
      state = playCard(state, 0, kind);
      expect(state.players[0]!.hand).toHaveLength(kind === 'stagecoach' ? 2 : 3);
      expect(state.discard.at(-1)!.kind).toBe(kind);
    },
  );
  it('recycles resolving Stagecoach itself, without double-discard (T15 p9)', () => {
    let state = fresh();
    give(state, 0, 'stagecoach');
    state.players[2]!.hand.push(...state.deck.splice(0, state.deck.length - 1));
    const source = state.players[0]!.hand[0]!.id;
    state = playCard(state, 0, 'stagecoach');
    expect(state.players[0]!.hand.map((card) => card.id)).toContain(source);
    expect(state.discard).toHaveLength(0);
    expect(state.deck).toHaveLength(0);
    expect(decodeMatch(state)).toEqual(state);
  });
  it('Black Jack reveals only second phase-one card and privately draws red bonus (R p10)', () => {
    let state = fresh();
    character(state, 0, 'black_jack');
    turn(state, 0, 'draw');
    const [first, second, bonus] = top(state, 'bang', 'beer', 'missed');
    state = step(state, 0, { type: 'draw', source: 'deck' });
    expect(state.players[0]!.hand).toEqual([first, second, bonus]);
    const log = projectMatch(state, 'p1').publicResolutions;
    expect(log.filter((entry) => entry.kind === 'black_jack_reveal')).toEqual([
      {
        revision: 2,
        ordinal: 0,
        kind: 'black_jack_reveal',
        actorSeatId: 'p0',
        card: { kind: second!.kind, suit: second!.suit, rank: second!.rank },
      },
    ]);
    expect(JSON.stringify(log)).not.toContain(first!.id);
    expect(JSON.stringify(log)).not.toContain(bonus!.id);
    expect(decodeMatch(JSON.parse(JSON.stringify(state))).publicResolutions).toEqual(log);
  });
  it('Black Jack black second card has no bonus', () => {
    let state = fresh();
    character(state, 0, 'black_jack');
    turn(state, 0, 'draw');
    top(state, 'beer', 'missed');
    state = step(state, 0, { type: 'draw', source: 'deck' });
    expect(state.players[0]!.hand).toHaveLength(2);
  });
  it('Kit privately keeps two in chosen order and returns third atop deck (R p10)', () => {
    let state = fresh();
    character(state, 0, 'kit_carlson');
    turn(state, 0, 'draw');
    const cards = top(state, 'beer', 'bang', 'missed');
    state = step(state, 0, { type: 'draw', source: 'deck' });
    expect(state.pending!.kind).toBe('kit_carlson');
    expect(JSON.stringify(projectMatch(state, 'p1'))).not.toContain(cards[0]!.id);
    state = pick(state, [cards[2]!.id, cards[0]!.id]);
    expect(state.players[0]!.hand).toEqual([cards[2], cards[0]]);
    expect(state.deck.at(-1)).toEqual(cards[1]);
  });
  it('Jesse optional theft immediately replenishes Suzy before the second draw (R p10, T15)', () => {
    let state = fresh();
    character(state, 0, 'jesse_jones');
    character(state, 1, 'suzy_lafayette');
    turn(state, 0, 'draw');
    const [stolen] = give(state, 1, 'bang');
    const [suzyCard, second] = top(state, 'beer', 'missed');
    state = step(state, 0, { type: 'draw', source: 'opponent', targetSeatId: 'p1' });
    expect(state.players[0]!.hand).toEqual([stolen, second]);
    expect(state.players[1]!.hand).toEqual([suzyCard]);
  });
  it('Pedro can take discard before empty-deck recycling (T15 p9)', () => {
    let state = fresh();
    character(state, 0, 'pedro_ramirez');
    turn(state, 0, 'draw');
    const [discarded] = give(state, 2, 'beer');
    state.players[2]!.hand = [];
    state.discard.push(discarded!);
    const [second] = top(state, 'missed');
    state = step(state, 0, { type: 'draw', source: 'discard' });
    expect(state.players[0]!.hand).toEqual([discarded, second]);
  });
  it('Lucky chooses Barrel result, discards both in reveal order and reports chosen result last (R p10)', () => {
    let state = fresh();
    character(state, 1, 'lucky_duke');
    equip(state, 1, 'barrel');
    give(state, 0, 'bang');
    const cards = top(state, 'beer', 'missed');
    state = playCard(state, 0, 'bang', 1);
    state = step(state, 1, { type: 'respond', decisionId: state.pending!.id, method: 'barrel' });
    expect(state.pending!.kind).toBe('lucky_duke');
    state = pick(state, [cards[0]!.id]);
    expect(state.discard.slice(-2)).toEqual(cards);
    expect(state.pending!.ownerSeatId).toBe('p0');
    expect(state.publicResolutions.at(-1)!.card!.kind).toBe('beer');
  });
  it('Jail check below Jail; failed Jail skips without optional Beer (F Q15, T15 p9)', () => {
    let state = fresh();
    equip(state, 1, 'jail');
    give(state, 1, 'beer');
    const [check] = top(state, 'missed');
    state = step(state, 0, { type: 'end_turn' });
    expect(state.turn.seatId).toBe('p2');
    expect(state.discard.slice(-2).map((card) => card.kind)).toEqual([check!.kind, 'jail']);
    expect(state.players[1]!.hand[0]!.kind).toBe('beer');
  });
  it('heart Jail check permits drawing, and Dynamite passes before Jail', () => {
    let state = fresh();
    equip(state, 1, 'jail', 'dynamite');
    top(state, 'beer', 'beer');
    state = step(state, 0, { type: 'end_turn' });
    expect(state.turn.seatId).toBe('p1');
    expect(state.turn.phase).toBe('draw');
    expect(state.players[1]!.equipment).toHaveLength(0);
    expect(state.players[2]!.equipment[0]!.kind).toBe('dynamite');
  });
  it('exploded Dynamite is discarded before Vulture inheritance (F Q14), Bart draws three if surviving (Q24)', () => {
    let state = fresh();
    character(state, 1, 'bart_cassidy');
    equip(state, 1, 'dynamite');
    explodingCheck(state);
    state = step(state, 0, { type: 'end_turn' });
    expect(state.players[1]!.hp).toBe(1);
    expect(state.players[1]!.hand).toHaveLength(3);
    state = fresh();
    character(state, 1, 'bart_cassidy');
    character(state, 2, 'vulture_sam');
    state.players[1]!.hp = 2;
    equip(state, 1, 'dynamite');
    const [inherit] = give(state, 1, 'bang');
    explodingCheck(state);
    state = step(state, 0, { type: 'end_turn' });
    expect(state.pending!.kind).toBe('rescue');
    state = decline(state);
    expect(state.players[2]!.hand).toEqual([inherit]);
    expect(state.discard.some((card) => card.kind === 'dynamite')).toBe(true);
  });
  it('General Store is clockwise actor-first and Suzy gets selected card before empty check (R p7, T15)', () => {
    let state = fresh();
    character(state, 0, 'suzy_lafayette');
    give(state, 0, 'general_store');
    const cards = top(state, 'beer', 'bang', 'missed', 'panic');
    state = playCard(state, 0, 'general_store');
    expect(state.players[0]!.hand).toHaveLength(0);
    expect(projectMatch(state, 'p2').revealedCards).toEqual(cards);
    for (let index = 0; index < 4; index++) {
      expect(state.pending!.ownerSeatId).toBe(`p${index}`);
      state = pick(state);
    }
    expect(state.players[0]!.hand).toHaveLength(1);
    expect(state.pending!.kind).toBe('turn');
  });
});

describe('character reactions, Sid interrupts and fatal ordering', () => {
  it('Suzy draws between Slab responses (T15) and after losing last card normally', () => {
    let state = fresh();
    character(state, 0, 'slab_the_killer');
    character(state, 1, 'suzy_lafayette');
    give(state, 0, 'bang');
    const [first] = give(state, 1, 'missed');
    const [next] = top(state, 'missed');
    state = playCard(state, 0, 'bang', 1);
    state = step(state, 1, {
      type: 'respond',
      decisionId: state.pending!.id,
      method: 'card',
      cardId: first!.id,
    });
    expect(state.players[1]!.hand).toEqual([next]);
    expect(projectMatch(state, 'p1').pending!.requiredResponses).toBe(1);
    state = step(state, 1, {
      type: 'respond',
      decisionId: state.pending!.id,
      method: 'card',
      cardId: next!.id,
    });
    expect(state.pending!.ownerSeatId).toBe('p0');
    expect(state.players[1]!.hand).toHaveLength(1);
  });
  it('Suzy defers during Duel, and cannot draw a Beer to rescue a fatal lost Duel (F Q22)', () => {
    let state = fresh();
    character(state, 0, 'suzy_lafayette');
    state.players[0]!.hp = 1;
    give(state, 0, 'duel');
    const [bang] = give(state, 1, 'bang');
    top(state, 'beer');
    state = playCard(state, 0, 'duel', 1);
    expect(state.players[0]!.hand).toHaveLength(0);
    state = step(state, 1, {
      type: 'respond',
      decisionId: state.pending!.id,
      method: 'card',
      cardId: bang!.id,
    });
    expect(state.players[0]!.hand).toHaveLength(0);
    state = decline(state);
    expect(state.pending!.kind).toBe('rescue');
    expect(state.players[0]!.hand).toHaveLength(0);
    expect(
      projectMatch(state, 'p0').actions.filter((action) => action.intent.type === 'respond'),
    ).toHaveLength(1);
  });
  it('Suzy draws, surviving Gringo steals, and Suzy draws again (T15)', () => {
    let state = fresh();
    character(state, 0, 'suzy_lafayette');
    character(state, 1, 'el_gringo');
    give(state, 0, 'bang');
    const [first, second] = top(state, 'beer', 'missed');
    state = decline(playCard(state, 0, 'bang', 1));
    expect(state.players[1]!.hand).toEqual([first]);
    expect(state.players[0]!.hand).toEqual([second]);
  });
  it('Gringo self-initiated lost Duel cannot steal, nor can a fatal victim (F Q17,Q21)', () => {
    let state = fresh();
    character(state, 0, 'el_gringo');
    give(state, 0, 'duel');
    const [bang] = give(state, 1, 'bang', 'beer');
    state = playCard(state, 0, 'duel', 1);
    state = step(state, 1, {
      type: 'respond',
      decisionId: state.pending!.id,
      method: 'card',
      cardId: bang!.id,
    });
    state = decline(state);
    expect(state.players[0]!.hand).toHaveLength(0);
    expect(state.players[1]!.hand).toHaveLength(1);
    state = fresh();
    character(state, 1, 'el_gringo');
    state.players[1]!.hp = 1;
    give(state, 0, 'bang', 'beer');
    state = decline(playCard(state, 0, 'bang', 1));
    expect(state.players[0]!.hand).toHaveLength(1);
    expect(state.pending!.kind).toBe('rescue');
  });
  it('Sid anytime interrupt pays ordered two owned cards, preserves foreign defense through JSON restart (F Q26)', () => {
    let state = fresh();
    character(state, 2, 'sid_ketchum');
    state.players[2]!.hp--;
    const cards = give(state, 2, 'beer', 'missed');
    give(state, 0, 'bang');
    state = playCard(state, 0, 'bang', 1);
    const pending = JSON.parse(JSON.stringify(state.pending)),
      tasks = JSON.parse(JSON.stringify(state.tasks));
    state = step(state, 2, { type: 'sid_heal', cardIds: [cards[0]!.id, cards[1]!.id] });
    expect(state.pending).toEqual(pending);
    expect(state.tasks).toEqual(tasks);
    expect(state.players[2]!.hp).toBe(state.players[2]!.maxHp);
    expect(state.discard.slice(-2)).toEqual(cards);
    expect(
      applyIntent(
        state,
        'p2',
        { type: 'sid_heal', cardIds: [cards[0]!.id, cards[1]!.id] },
        zeroRandom,
      ).ok,
    ).toBe(false);
  });
  it('Sid can rescue negative HP repeatedly, but cannot exceed max or use equipment', () => {
    let state = fresh();
    character(state, 1, 'sid_ketchum');
    state.players[1]!.hp = 1;
    equip(state, 1, 'dynamite');
    give(state, 1, 'bang', 'bang', 'missed', 'missed', 'beer', 'beer');
    explodingCheck(state);
    state = step(state, 0, { type: 'end_turn' });
    expect(state.players[1]!.hp).toBe(-2);
    for (let index = 0; index < 3; index++) {
      const ids = state.players[1]!.hand.slice(0, 2).map((card) => card.id) as [string, string];
      state = step(state, 1, { type: 'sid_heal', cardIds: ids });
    }
    expect(state.players[1]!.hp).toBe(1);
    expect(state.turn.phase).toBe('draw');
  });
  it('Sid recomputes his own excess-discard requirement after payment/heal', () => {
    let state = fresh();
    character(state, 0, 'sid_ketchum');
    state.players[0]!.hp = 2;
    give(state, 0, 'bang', 'bang', 'beer', 'missed');
    state = step(state, 0, { type: 'end_turn' });
    expect(state.pending!.kind).toBe('turn_discard');
    const ids = state.players[0]!.hand.slice(0, 2).map((card) => card.id) as [string, string];
    state = step(state, 0, { type: 'sid_heal', cardIds: ids });
    expect(state.turn.seatId).toBe('p1');
    expect(state.players[0]!.hand).toHaveLength(2);
  });
  it('Vulture inherits before sheriff penalty, including inherited cards (F Q18)', () => {
    let state = fresh(5);
    character(state, 0, 'vulture_sam');
    state.players[1]!.hp = 1;
    give(state, 0, 'bang', 'beer');
    give(state, 1, 'missed');
    equip(state, 1, 'barrel');
    state = decline(playCard(state, 0, 'bang', 1));
    state = decline(state);
    expect(state.pending!.kind).toBe('elimination_discard');
    expect(state.pending!.ownerSeatId).toBe('p0');
    expect(state.players[0]!.hand).toHaveLength(3);
    state = pick(state);
    expect(state.players[0]!.hand).toHaveLength(0);
    expect(state.players[0]!.equipment).toHaveLength(0);
  });
  it('eliminated actor orders all discards; outlaw killer receives three cards (F Q05,Q07)', () => {
    let state = fresh();
    state.players[1]!.hp = 1;
    give(state, 0, 'bang');
    const cards = give(state, 1, 'beer', 'missed');
    equip(state, 1, 'barrel');
    state = decline(playCard(state, 0, 'bang', 1));
    state = decline(state);
    expect(state.pending!.kind).toBe('elimination_discard');
    state = pick(state, [
      ...state.players[1]!.equipment.map((card) => card.id),
      ...cards.map((card) => card.id),
    ]);
    expect(state.discard.at(-1)!.id).toBe(cards.at(-1)!.id);
    expect(state.players[0]!.hand).toHaveLength(3);
    expect(state.players[1]!.alive).toBe(false);
  });
  it('no reward for initiating an outlaw fatal lost Duel (F Q23)', () => {
    let state = fresh();
    turn(state, 1);
    state.players[1]!.hp = 1;
    give(state, 1, 'duel');
    const [bang] = give(state, 0, 'bang');
    state = playCard(state, 1, 'duel', 0);
    state = step(state, 0, {
      type: 'respond',
      decisionId: state.pending!.id,
      method: 'card',
      cardId: bang!.id,
    });
    state = decline(state);
    state = decline(state);
    expect(state.players[0]!.hand).toHaveLength(0);
    expect(state.players[1]!.alive).toBe(false);
  });
});

describe('mass-response convention and terminal integrity', () => {
  it.each(['gatling', 'indians'] as CardKind[])(
    '%s resolves clockwise while exposing private preparation, then checks victory',
    (kind) => {
      let state = fresh();
      character(state, 1, 'black_jack');
      give(state, 0, kind);
      give(state, 2, kind === 'indians' ? 'bang' : 'missed');
      state = playCard(state, 0, kind);
      const massId = state.massEffect!.massEffectId;
      expect(state.pending!.ownerSeatId).toBe('p1');
      expect(projectMatch(state, 'p2').preparation!.isCurrent).toBe(false);
      expect(
        projectMatch(state, 'p2').preparation!.actions.some(
          (action) => action.intent.type === 'respond' && action.intent.method === 'card',
        ),
      ).toBe(true);
      const unchanged = JSON.stringify(state);
      projectMatch(state, 'p2');
      expect(JSON.stringify(state)).toBe(unchanged);
      expect(projectMatch(state, 'p0').preparation).toBeNull();
      const guard = projectMatch(state, 'p2').preparation!.guard;
      state = decline(state);
      expect(state.pending!.ownerSeatId).toBe('p2');
      expect(state.massEffect!.massEffectId).toBe(massId);
      expect(projectMatch(state, 'p2').preparation!.guard).toBe(guard);
      state = decline(state);
      expect(state.pending!.ownerSeatId).toBe('p3');
      state = decline(state);
      expect(state.massEffect).toBeNull();
      expect(state.turn.bangsPlayed).toBe(0);
    },
  );
  it('Slab Gatling needs one Missed; Indians permits neither Barrel nor Jourdonnais (F Q03,Q19)', () => {
    let state = fresh();
    character(state, 0, 'slab_the_killer');
    character(state, 1, 'jourdonnais');
    equip(state, 1, 'barrel');
    give(state, 0, 'gatling', 'indians');
    state = playCard(state, 0, 'gatling');
    expect(projectMatch(state, 'p1').pending!.requiredResponses).toBe(1);
    for (let index = 0; index < 3; index++) state = decline(state);
    state = playCard(state, 0, 'indians');
    expect(
      projectMatch(state, 'p1').actions.filter(
        (action) =>
          action.intent.type === 'respond' && ['barrel', 'innate'].includes(action.intent.method),
      ),
    ).toHaveLength(0);
  });
  it('canonical Barrel checks consume deck in seat order regardless of future draft', () => {
    let state = fresh();
    character(state, 1, 'black_jack');
    character(state, 2, 'kit_carlson');
    equip(state, 1, 'barrel');
    equip(state, 2, 'barrel');
    give(state, 0, 'gatling');
    top(state, 'beer', 'missed');
    state = playCard(state, 0, 'gatling');
    expect(
      applyIntent(
        state,
        'p2',
        { type: 'respond', decisionId: state.pending!.id, method: 'barrel' },
        zeroRandom,
      ).ok,
    ).toBe(false);
    state = step(state, 1, { type: 'respond', decisionId: state.pending!.id, method: 'barrel' });
    expect(state.pending!.ownerSeatId).toBe('p2');
    state = step(state, 2, { type: 'respond', decisionId: state.pending!.id, method: 'barrel' });
    expect(state.pending!.ownerSeatId).toBe('p2');
    expect(
      projectMatch(state, 'p2').preparation!.actions.some(
        (action) => action.intent.type === 'respond' && action.intent.method === 'barrel',
      ),
    ).toBe(false);
  });
  it('changed inherited defenses invalidate future guard; current Lucky/rescue has no second draft', () => {
    let state = fresh();
    character(state, 2, 'vulture_sam');
    state.players[1]!.hp = 1;
    give(state, 1, 'missed');
    give(state, 0, 'gatling');
    state = playCard(state, 0, 'gatling');
    const guard = projectMatch(state, 'p2').preparation!.guard;
    state = decline(state);
    expect(projectMatch(state, 'p1').preparation).toBeNull();
    state = decline(state);
    expect(projectMatch(state, 'p2').preparation!.guard).not.toBe(guard);
    state = fresh();
    character(state, 1, 'lucky_duke');
    equip(state, 1, 'barrel');
    give(state, 0, 'gatling');
    state = playCard(state, 0, 'gatling');
    state = step(state, 1, { type: 'respond', decisionId: state.pending!.id, method: 'barrel' });
    expect(projectMatch(state, 'p1').preparation).toBeNull();
    expect(projectMatch(state, 'p2').preparation).not.toBeNull();
  });
  it('Sheriff death does not skip later mass targets; surviving Renegade wins (T15)', () => {
    let state = fresh();
    turn(state, 3);
    state.players[0]!.hp = 1;
    state.players[1]!.hp = 1;
    state.players[2]!.hp = 1;
    give(state, 3, 'gatling');
    state = playCard(state, 3, 'gatling');
    for (let index = 0; index < 3; index++) {
      expect(state.status).toBe('active');
      state = decline(state);
      expect(state.pending!.kind).toBe('rescue');
      state = decline(state);
    }
    expect(state.status).toBe('finished');
    expect(state.outcome).toEqual({
      status: 'finished',
      winner: 'renegade',
      winnerSeatIds: ['p3'],
    });
  });
  it('ordinary Sheriff death awards Outlaws; removal of all enemies awards sheriff/deputies', () => {
    let state = fresh();
    turn(state, 1);
    state.players[0]!.hp = 1;
    give(state, 1, 'bang');
    state = decline(playCard(state, 1, 'bang', 0));
    state = decline(state);
    expect(state.outcome!.winner).toBe('outlaws');
    state = fresh(5);
    state.players[2]!.alive = false;
    state.players[2]!.hp = 0;
    state.players[3]!.alive = false;
    state.players[3]!.hp = 0;
    state.players[4]!.hp = 1;
    character(state, 4, 'black_jack');
    state.players[4]!.hp = 1;
    give(state, 0, 'duel');
    state = decline(playCard(state, 0, 'duel', 4));
    state = decline(state);
    expect(state.outcome).toEqual({
      status: 'finished',
      winner: 'sheriff_deputies',
      winnerSeatIds: ['p0', 'p1'],
    });
  });
  it('host abort freezes lethal rescue without healing/elimination and returns held choice pools', () => {
    let state = fresh();
    state.players[1]!.hp = 1;
    give(state, 0, 'bang');
    state = decline(playCard(state, 0, 'bang', 1));
    const hp = state.players[1]!.hp;
    const result = abortMatch(state, 'p0');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.players[1]!.hp).toBe(hp);
      expect(result.state.players[1]!.alive).toBe(true);
      expect(decodeMatch(result.state)).toEqual(result.state);
    }
    for (const kind of ['kit', 'store', 'lucky']) {
      state = fresh();
      if (kind === 'kit') {
        character(state, 0, 'kit_carlson');
        turn(state, 0, 'draw');
        state = step(state, 0, { type: 'draw', source: 'deck' });
      }
      if (kind === 'store') {
        give(state, 0, 'general_store');
        state = playCard(state, 0, 'general_store');
      }
      if (kind === 'lucky') {
        character(state, 1, 'lucky_duke');
        equip(state, 1, 'barrel');
        give(state, 0, 'bang');
        state = playCard(state, 0, 'bang', 1);
        state = step(state, 1, {
          type: 'respond',
          decisionId: state.pending!.id,
          method: 'barrel',
        });
      }
      const aborted = abortMatch(state, 'p0');
      expect(aborted.ok).toBe(true);
      if (aborted.ok) expect(decodeMatch(aborted.state).outcome!.winner).toBeNull();
    }
  });
  it('public summaries retain only64 entries and no private identifiers', () => {
    let state = fresh();
    character(state, 0, 'sid_ketchum');
    for (let index = 0; index < 24; index++) {
      state.players[0]!.hp = state.players[0]!.maxHp - 1;
      const cards = give(state, 0, 'bang', 'missed');
      state = step(state, 0, { type: 'sid_heal', cardIds: [cards[0]!.id, cards[1]!.id] });
    }
    expect(state.publicResolutions).toHaveLength(64);
    expect(state.publicResolutions[0]!.revision).toBeGreaterThan(1);
    expect(
      state.publicResolutions.every((entry) => entry.card === undefined || !('id' in entry.card)),
    ).toBe(true);
  });
  it('both-empty synthetic source fixture returns recoverable resource error, with no fabricated draw/check/penalty', () => {
    const state = fresh();
    state.players[1]!.hand.push(...state.deck.splice(0));
    turn(state, 0, 'draw');
    const before = JSON.stringify(state);
    expect(applyIntent(state, 'p0', { type: 'draw', source: 'deck' }, zeroRandom)).toEqual({
      ok: false,
      error: 'resource_unavailable',
    });
    expect(JSON.stringify(state)).toBe(before);
    expect(abortMatch(state, 'p0').ok).toBe(true);
  });
});

describe('complete legal matches and exhaustive conservation', () => {
  it.each([4, 5, 6, 7])(
    'keeps all80 cards and continuations valid across varied legal %i-player traces',
    (count) => {
      for (let seed = 1; seed <= 4; seed++) {
        const random = seeded(count * 1000 + seed);
        let state = createMatch(
          {
            matchId: `trace-${count}-${seed}`,
            hostSeatId: 'p0',
            rulesetVersion: 'classic-v1',
            participants: Array.from({ length: count }, (_, index) => ({
              seatId: `p${index}`,
              seatIndex: index,
              name: `P${index}`,
            })),
          },
          random,
        );
        for (let command = 0; command < 500 && state.status === 'active'; command++) {
          const actor = state.pending!.ownerSeatId,
            actions = projectMatch(state, actor).actions;
          const selected = actions[random.int(actions.length)]!;
          let intent = selected.intent;
          if (selected.selection && (intent.type === 'choose' || intent.type === 'sid_heal')) {
            const options = [...selected.selection.cards];
            const ids: string[] = [];
            for (let index = 0; index < selected.selection.min; index++)
              ids.push(options.splice(random.int(options.length), 1)[0]!.id);
            intent =
              intent.type === 'sid_heal'
                ? { type: 'sid_heal', cardIds: [ids[0]!, ids[1]!] }
                : { ...intent, cardIds: ids };
          }
          const result = applyIntent(state, actor, intent, random);
          expect(
            result.ok,
            `count${count} seed${seed} command${command} ${JSON.stringify(intent)}`,
          ).toBe(true);
          if (!result.ok) break;
          state = decodeMatch(JSON.parse(JSON.stringify(result.state)));
        }
      }
    },
  );
  it.each([4, 5, 6, 7])(
    'plays a complete normal %i-player match, reloading EVERY decision',
    (count) => {
      const random = seeded(200 + count);
      let state = createMatch(
        {
          matchId: `full-${count}`,
          hostSeatId: 'p0',
          rulesetVersion: 'classic-v1',
          participants: Array.from({ length: count }, (_, index) => ({
            seatId: `p${index}`,
            seatIndex: index,
            name: `P${index}`,
          })),
        },
        random,
      );
      let commands = 0;
      while (state.status === 'active' && commands < 2000) {
        state = decodeMatch(JSON.parse(JSON.stringify(state)));
        const actor = state.pending!.ownerSeatId,
          view = projectMatch(state, actor);
        const actions = view.actions;
        const selected =
          actions.find((action) => action.intent.type === 'draw') ??
          actions.find(
            (action) => action.intent.type === 'respond' && action.intent.method === 'decline',
          ) ??
          actions.find((action) => action.intent.type === 'choose') ??
          actions.find(
            (action) =>
              action.intent.type === 'play' &&
              ['gatling', 'indians', 'duel', 'bang'].includes(
                view.ownHand.find(
                  (card) => action.intent.type === 'play' && card.id === action.intent.cardId,
                )?.kind ?? '',
              ),
          ) ??
          actions.find((action) => action.intent.type === 'end_turn');
        expect(selected, `No legal action at ${JSON.stringify(view.pending)}`).toBeDefined();
        let intent = selected!.intent;
        if (intent.type === 'choose')
          intent = {
            ...intent,
            cardIds: selected!
              .selection!.cards.slice(0, selected!.selection!.min)
              .map((card) => card.id),
          };
        const result = applyIntent(state, actor, intent, random);
        expect(result.ok, `Rejected legal ${JSON.stringify(intent)} at command${commands}`).toBe(
          true,
        );
        if (!result.ok) break;
        state = result.state;
        decodeMatch(state);
        commands++;
      }
      expect(commands).toBeLessThan(2000);
      expect(state.status).toBe('finished');
      expect(state.outcome!.winnerSeatIds.length).toBeGreaterThan(0);
      expect(applyIntent(state, state.hostSeatId, { type: 'end_turn' }, random)).toEqual({
        ok: false,
        error: 'match_ended',
      });
    },
  );
  it('covers every canonical character in setup and every base card in catalog (R pp10–11)', () => {
    const ids: CharacterId[] = CLASSIC_CHARACTERS.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(16);
    expect(new Set(CLASSIC_DECK.map((card) => card.kind)).size).toBe(22);
    for (const id of ids) {
      const state: MatchState = fresh();
      character(state, 0, id);
      expect(decodeMatch(state).players[0]!.characterId).toBe(id);
    }
  });
});

describe('focused rule regressions and denied choices', () => {
  it('Calamity can discard Missed against Indians, without a Bang play allowance', () => {
    let state = fresh();
    character(state, 1, 'calamity_janet');
    give(state, 0, 'indians');
    const [card] = give(state, 1, 'missed');
    state = playCard(state, 0, 'indians');
    state = step(state, 1, {
      type: 'respond',
      decisionId: state.pending!.id,
      method: 'card',
      cardId: card!.id,
    });
    expect(state.pending!.ownerSeatId).toBe('p2');
    expect(state.turn.bangsPlayed).toBe(0);
  });
  it('Suzy last-Bang Duel response defers until damage settles, then replenishes a survivor', () => {
    let state = fresh();
    character(state, 1, 'suzy_lafayette');
    give(state, 0, 'duel');
    const [bang] = give(state, 1, 'bang');
    const [next] = top(state, 'beer');
    state = playCard(state, 0, 'duel', 1);
    state = step(state, 1, {
      type: 'respond',
      decisionId: state.pending!.id,
      method: 'card',
      cardId: bang!.id,
    });
    expect(state.players[1]!.hand).toHaveLength(0);
    expect(state.deck.at(-1)).toEqual(next);
    state = decline(state);
    expect(state.players[1]!.hand).toEqual([next]);
  });
  it('Suzy source Duel resolves, then draws before surviving Gringo theft', () => {
    let state = fresh();
    character(state, 0, 'suzy_lafayette');
    character(state, 1, 'el_gringo');
    give(state, 0, 'duel');
    const [first, second] = top(state, 'beer', 'missed');
    state = decline(playCard(state, 0, 'duel', 1));
    expect(state.players[1]!.hand).toEqual([first]);
    expect(state.players[0]!.hand).toEqual([second]);
  });
  it('mass attacker receives outlaw reward before continuing to later targets (F Q05)', () => {
    let state = fresh();
    state.players[1]!.hp = 1;
    give(state, 0, 'indians');
    state = decline(playCard(state, 0, 'indians'));
    state = decline(state);
    expect(state.players[0]!.hand).toHaveLength(3);
    expect(state.pending!.ownerSeatId).toBe('p2');
    expect(state.status).toBe('active');
  });
  it('failed Barrel does not fulfill Slab requirement; a card supplies only one', () => {
    let state = fresh();
    character(state, 0, 'slab_the_killer');
    equip(state, 1, 'barrel');
    give(state, 0, 'bang');
    const [missed] = give(state, 1, 'missed');
    top(state, 'missed');
    state = playCard(state, 0, 'bang', 1);
    state = step(state, 1, { type: 'respond', decisionId: state.pending!.id, method: 'barrel' });
    expect(projectMatch(state, 'p1').pending!.requiredResponses).toBe(2);
    state = step(state, 1, {
      type: 'respond',
      decisionId: state.pending!.id,
      method: 'card',
      cardId: missed!.id,
    });
    expect(projectMatch(state, 'p1').pending!.requiredResponses).toBe(1);
  });
  it('Sid cannot heal at full HP, pay duplicates, or use equipment', () => {
    const state = fresh();
    character(state, 1, 'sid_ketchum');
    const cards = give(state, 1, 'bang', 'beer');
    const [equipment] = equip(state, 1, 'barrel');
    expect(
      applyIntent(
        state,
        'p1',
        { type: 'sid_heal', cardIds: [cards[0]!.id, cards[1]!.id] },
        zeroRandom,
      ).ok,
    ).toBe(false);
    state.players[1]!.hp--;
    expect(
      applyIntent(
        state,
        'p1',
        { type: 'sid_heal', cardIds: [cards[0]!.id, cards[0]!.id] },
        zeroRandom,
      ).ok,
    ).toBe(false);
    expect(
      applyIntent(
        state,
        'p1',
        { type: 'sid_heal', cardIds: [cards[0]!.id, equipment!.id] },
        zeroRandom,
      ).ok,
    ).toBe(false);
  });
  it('Sid preserves a foreign Lucky check pool and exact defense resume frame', () => {
    let state = fresh();
    character(state, 1, 'lucky_duke');
    character(state, 2, 'sid_ketchum');
    state.players[2]!.hp--;
    equip(state, 1, 'barrel');
    const cards = give(state, 2, 'beer', 'bang');
    give(state, 0, 'bang');
    state = playCard(state, 0, 'bang', 1);
    state = step(state, 1, { type: 'respond', decisionId: state.pending!.id, method: 'barrel' });
    const pending = JSON.parse(JSON.stringify(state.pending));
    state = step(state, 2, { type: 'sid_heal', cardIds: [cards[0]!.id, cards[1]!.id] });
    expect(state.pending).toEqual(pending);
    expect(decodeMatch(state)).toEqual(state);
  });
  it('selection count/ownership/duplicate and stale decision fail before entropy', () => {
    let state = fresh();
    character(state, 0, 'kit_carlson');
    turn(state, 0, 'draw');
    state = step(state, 0, { type: 'draw', source: 'deck' });
    if (state.pending?.kind !== 'kit_carlson') throw new Error('Expected Kit');
    const id = state.pending.cards[0]!.id,
      foreign = state.deck[0]!.id;
    const random = {
      int(): number {
        throw new Error('Rejected command consumed entropy');
      },
    };
    for (const ids of [[id], [id, id], [id, foreign]])
      expect(
        applyIntent(
          state,
          'p0',
          { type: 'choose', decisionId: state.pending.id, cardIds: ids },
          random,
        ).ok,
      ).toBe(false);
    expect(
      applyIntent(
        state,
        'p0',
        {
          type: 'choose',
          decisionId: 'stale',
          cardIds: state.pending.cards.slice(0, 2).map((card) => card.id),
        },
        random,
      ).ok,
    ).toBe(false);
    const original = JSON.stringify(state);
    expect(applyIntent(state, 'p1', { type: 'draw', source: 'deck' }, random).ok).toBe(false);
    expect(JSON.stringify(state)).toBe(original);
  });
  it('Suzy can self-target her newly replenished hand with last-card Panic', () => {
    let state = fresh();
    character(state, 0, 'suzy_lafayette');
    give(state, 0, 'panic');
    const [drawn] = top(state, 'beer');
    state = playCard(state, 0, 'panic', 0, 'hand');
    expect(state.players[0]!.hand).toEqual([drawn]);
  });
  it('terminal and active structural consistency are validated before any transition', () => {
    const state = fresh();
    state.tasks.push({ type: 'resume_play' });
    expect(() => decodeMatch(state)).toThrow();
    expect(applyIntent(state, 'p0', { type: 'end_turn' }, zeroRandom)).toEqual({
      ok: false,
      error: 'invalid_state',
    });
    expect(abortMatch(state, 'p0')).toEqual({ ok: false, error: 'invalid_state' });
  });
});
