import type { CardFace, CardInstance, CardKind } from './catalog.js';
import type { RandomSource, PublicResolution } from './api.js';
import type { MatchState, PlayerState, PendingDecision } from './model.js';

export const WEAPON_RANGE: Partial<Record<CardKind, number>> = {
  volcanic: 1,
  schofield: 2,
  remington: 3,
  rev_carabine: 4,
  winchester: 5,
};
export function isEquipment(kind: CardKind): boolean {
  return (
    WEAPON_RANGE[kind] !== undefined ||
    ['barrel', 'scope', 'mustang', 'jail', 'dynamite'].includes(kind)
  );
}
export function player(state: MatchState, seatId: string): PlayerState {
  const found = state.players.find((entry) => entry.seatId === seatId);
  if (!found) throw new Error('Invalid participant');
  return found;
}
export function living(state: MatchState): PlayerState[] {
  return state.players.filter((entry) => entry.alive);
}
export function hasEquipment(actor: PlayerState, kind: CardKind): boolean {
  return actor.equipment.some((card) => card.kind === kind);
}
export function distance(state: MatchState, fromId: string, toId: string): number {
  if (fromId === toId) return 0;
  const seats = living(state);
  const from = seats.findIndex((entry) => entry.seatId === fromId);
  const to = seats.findIndex((entry) => entry.seatId === toId);
  if (from < 0 || to < 0) return Infinity;
  const actor = player(state, fromId),
    target = player(state, toId);
  const raw = Math.abs(from - to);
  return Math.max(
    1,
    Math.min(raw, seats.length - raw) +
      Number(hasEquipment(target, 'mustang')) +
      Number(target.characterId === 'paul_regret') -
      Number(hasEquipment(actor, 'scope')) -
      Number(actor.characterId === 'rose_doolan'),
  );
}
export function range(actor: PlayerState): number {
  return actor.equipment.reduce((current, card) => WEAPON_RANGE[card.kind] ?? current, 1);
}
export function clockwise(state: MatchState, seatId: string, includeSelf = false): string[] {
  const index = state.players.findIndex((entry) => entry.seatId === seatId);
  const result: string[] = [];
  for (
    let offset = includeSelf ? 0 : 1;
    offset < state.players.length + (includeSelf ? 0 : 1);
    offset++
  ) {
    const entry = state.players[(index + offset) % state.players.length];
    if (entry?.alive && (includeSelf || entry.seatId !== seatId)) result.push(entry.seatId);
  }
  return result;
}
export function face(card: CardFace): CardFace {
  return { kind: card.kind, suit: card.suit, rank: card.rank };
}
export function log(
  state: MatchState,
  entry: Omit<PublicResolution, 'revision' | 'ordinal'>,
): void {
  const last = state.publicResolutions.at(-1);
  state.publicResolutions.push({
    ...entry,
    revision: state.revision,
    ordinal: last?.revision === state.revision ? last.ordinal + 1 : 0,
  });
  state.publicResolutions = state.publicResolutions.slice(-64);
}
export function discard(
  state: MatchState,
  actor: PlayerState,
  cards: readonly CardInstance[],
): void {
  for (const card of cards) {
    state.discard.push(card);
    log(state, { kind: 'discarded', actorSeatId: actor.seatId, card: face(card) });
  }
}
export function randomInt(random: RandomSource, max: number): number {
  const result = random.int(max);
  if (!Number.isSafeInteger(result) || result < 0 || result >= max)
    throw new Error('Invalid entropy');
  return result;
}
export function shuffle<T>(input: readonly T[], random: RandomSource): T[] {
  const result = [...input];
  for (let index = result.length - 1; index > 0; index--) {
    const other = randomInt(random, index + 1);
    [result[index], result[other]] = [result[other]!, result[index]!];
  }
  return result;
}
export class ResourceUnavailable extends Error {}
export function drawCard(state: MatchState, random: RandomSource): CardInstance {
  if (state.deck.length === 0) {
    if (state.discard.length === 0) throw new ResourceUnavailable('No drawable card');
    state.deck = shuffle(state.discard, random);
    state.discard = [];
  }
  return state.deck.pop()!;
}
export function drawTo(
  state: MatchState,
  actor: PlayerState,
  count: number,
  random: RandomSource,
): void {
  for (let index = 0; index < count; index++) actor.hand.push(drawCard(state, random));
}
export function newDecision<T extends Omit<PendingDecision, 'id'>>(
  state: MatchState,
  detail: T,
): T & { id: string } {
  state.decisionSerial++;
  return { ...detail, id: `${state.matchId}:d${state.decisionSerial}` };
}
export function suzy(state: MatchState, random: RandomSource): void {
  // Duel and General Store explicitly defer Suzy until the entire effect resolves.
  if (state.pending?.kind === 'duel' || state.pending?.kind === 'general_store') return;
  for (const actor of living(state)) {
    if (actor.characterId === 'suzy_lafayette' && actor.hp > 0 && actor.hand.length === 0)
      drawTo(state, actor, 1, random);
  }
}
export function removeCard(cards: CardInstance[], id: string): CardInstance {
  const index = cards.findIndex((card) => card.id === id);
  if (index < 0) throw new Error('Missing owned card');
  return cards.splice(index, 1)[0]!;
}
export function matchesResponse(
  actor: PlayerState,
  card: CardInstance,
  need: 'bang' | 'missed',
): boolean {
  return (
    card.kind === need ||
    (actor.characterId === 'calamity_janet' && card.kind === (need === 'bang' ? 'missed' : 'bang'))
  );
}
