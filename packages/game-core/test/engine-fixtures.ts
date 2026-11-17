import {
  applyIntent,
  CLASSIC_CHARACTERS,
  CLASSIC_DECK,
  createMatch,
  decodeMatch,
  getClassicRoleDistribution,
  projectMatch,
} from '../src/index.js';
import type {
  CardInstance,
  CardKind,
  CharacterId,
  GameIntent,
  MatchState,
  RandomSource,
} from '../src/index.js';

export const zeroRandom: RandomSource = { int: () => 0 };
export function seeded(seed: number): RandomSource {
  // Test-only deterministic entropy; production has no seed or PRNG state.
  let value = seed >>> 0;
  return {
    int(max) {
      value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
      return value % max;
    },
  };
}
export function fresh(count = 4): MatchState {
  const state = createMatch(
    {
      matchId: 'test-match',
      hostSeatId: 'p0',
      rulesetVersion: 'classic-v1',
      participants: Array.from({ length: count }, (_, index) => ({
        seatId: `p${index}`,
        seatIndex: index,
        name: `Player ${index}`,
      })),
    },
    seeded(19),
  );
  const roles = getClassicRoleDistribution(count);
  const characters: CharacterId[] = [
    'willy_the_kid',
    'slab_the_killer',
    'rose_doolan',
    'paul_regret',
    'jesse_jones',
    'pedro_ramirez',
    'lucky_duke',
  ];
  state.players.forEach((actor, index) => {
    actor.role = roles[index]!;
    actor.characterId = characters[index]!;
    actor.maxHp =
      CLASSIC_CHARACTERS.find((entry) => entry.id === actor.characterId)!.maxHp +
      Number(actor.role === 'sheriff');
    actor.hp = actor.maxHp;
    actor.hand = [];
    actor.equipment = [];
  });
  state.deck = CLASSIC_DECK.map((card) => ({ ...card }));
  state.discard = [];
  state.turn = { seatId: 'p0', phase: 'play', number: 1, bangsPlayed: 0 };
  state.tasks = [];
  state.pending = { id: 'test-match:d1', kind: 'turn', ownerSeatId: 'p0' };
  state.decisionSerial = 1;
  return decodeMatch(state);
}
export function character(state: MatchState, index: number, id: CharacterId): void {
  const actor = state.players[index]!;
  const other = state.players.find((entry) => entry.characterId === id);
  if (other && other !== actor) {
    other.characterId = actor.characterId;
    other.maxHp =
      CLASSIC_CHARACTERS.find((entry) => entry.id === other.characterId)!.maxHp +
      Number(other.role === 'sheriff');
    other.hp = other.maxHp;
  }
  actor.characterId = id;
  actor.maxHp =
    CLASSIC_CHARACTERS.find((entry) => entry.id === id)!.maxHp + Number(actor.role === 'sheriff');
  actor.hp = actor.maxHp;
}
function take(state: MatchState, kind: CardKind): CardInstance {
  for (const zone of [
    state.deck,
    state.discard,
    ...state.players.flatMap((actor) => [actor.hand, actor.equipment]),
  ]) {
    const index = zone.findIndex((card) => card.kind === kind);
    if (index >= 0) return zone.splice(index, 1)[0]!;
  }
  throw new Error(`No ${kind} left`);
}
export function give(state: MatchState, index: number, ...kinds: CardKind[]): CardInstance[] {
  const result = kinds.map((kind) => take(state, kind));
  state.players[index]!.hand.push(...result);
  return result;
}
export function equip(state: MatchState, index: number, ...kinds: CardKind[]): CardInstance[] {
  const result = kinds.map((kind) => take(state, kind));
  state.players[index]!.equipment.push(...result);
  return result;
}
export function top(state: MatchState, ...kinds: CardKind[]): CardInstance[] {
  const result = kinds.map((kind) => take(state, kind));
  state.deck.push(...[...result].reverse());
  return result;
}
export function explodingCheck(state: MatchState): void {
  const index = state.deck.findIndex((card) => card.suit === 'spades' && card.rank === '2');
  if (index < 0) throw new Error('Spade 2 unavailable');
  state.deck.push(state.deck.splice(index, 1)[0]!);
}
export function turn(state: MatchState, index: number, phase: 'draw' | 'play' = 'play'): void {
  state.turn.seatId = state.players[index]!.seatId;
  state.turn.phase = phase;
  state.turn.bangsPlayed = 0;
  state.pending = {
    id: `test-match:d${++state.decisionSerial}`,
    kind: phase === 'draw' ? 'draw_choice' : 'turn',
    ownerSeatId: state.turn.seatId,
  };
  state.tasks = [];
}
export function step(
  state: MatchState,
  actor: number | string,
  intent: GameIntent,
  random: RandomSource = zeroRandom,
): MatchState {
  const result = applyIntent(
    decodeMatch(JSON.parse(JSON.stringify(state))),
    typeof actor === 'number' ? `p${actor}` : actor,
    intent,
    random,
  );
  if (!result.ok) throw new Error(`Rejected ${JSON.stringify(intent)}: ${result.error}`);
  decodeMatch(result.state);
  return result.state;
}
export function playCard(
  state: MatchState,
  actor: number,
  kind: CardKind,
  target?: number,
  zone?: 'hand' | 'equipment',
  targetCardId?: string,
): MatchState {
  const card = state.players[actor]!.hand.find((entry) => entry.kind === kind);
  if (!card) throw new Error(`Missing hand ${kind}`);
  return step(state, actor, {
    type: 'play',
    cardId: card.id,
    ...(target === undefined ? {} : { targetSeatId: `p${target}` }),
    ...(zone === undefined ? {} : { zone }),
    ...(targetCardId === undefined ? {} : { targetCardId }),
  });
}
export function decline(state: MatchState): MatchState {
  return step(state, state.pending!.ownerSeatId, {
    type: 'respond',
    decisionId: state.pending!.id,
    method: 'decline',
  });
}
export function pick(state: MatchState, ids?: string[]): MatchState {
  const option = projectMatch(state, state.pending!.ownerSeatId).actions.find(
    (action) => action.intent.type === 'choose',
  )!;
  return step(state, state.pending!.ownerSeatId, {
    type: 'choose',
    decisionId: state.pending!.id,
    cardIds: ids ?? option.selection!.cards.slice(0, option.selection!.min).map((card) => card.id),
  });
}
