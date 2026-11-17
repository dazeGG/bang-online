import { CLASSIC_CATALOG_VERSION, CLASSIC_CHARACTERS, CLASSIC_DECK } from './catalog.js';
import type { CardInstance } from './catalog.js';
import { MATCH_TIMEOUT_POLICY } from './api.js';
import type { CreateMatchInput, GameIntent, RandomSource, TransitionResult } from './api.js';
import { getClassicRoleDistribution, isClassicPlayerCount } from './index.js';
import type { MatchState, PlayerState } from './model.js';
import {
  advance,
  afterHealing,
  declineRescue,
  finishCheck,
  finishDefense,
  startCheck,
  startDefense,
} from './effects.js';
import { legalActions, isWeapon, permits } from './legal-actions.js';
import {
  clockwise,
  discard,
  drawCard,
  drawTo,
  face,
  isEquipment,
  living,
  log,
  newDecision,
  player,
  randomInt,
  removeCard,
  ResourceUnavailable,
  shuffle,
  suzy,
} from './mechanics.js';
import { assertMatch } from './invariants.js';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createMatch(input: CreateMatchInput, random: RandomSource): MatchState {
  if (
    !input ||
    input.rulesetVersion !== 'classic-v1' ||
    typeof input.matchId !== 'string' ||
    input.matchId.length < 1 ||
    input.matchId.length > 80 ||
    !Array.isArray(input.participants) ||
    !isClassicPlayerCount(input.participants.length) ||
    new Set(input.participants.map((entry) => entry.seatId)).size !== input.participants.length ||
    new Set(input.participants.map((entry) => entry.seatIndex)).size !==
      input.participants.length ||
    !input.participants.some((entry) => entry.seatId === input.hostSeatId) ||
    input.participants.some(
      (entry) =>
        typeof entry.seatId !== 'string' ||
        entry.seatId.length < 1 ||
        entry.seatId.length > 128 ||
        typeof entry.name !== 'string' ||
        entry.name.trim().length < 1 ||
        entry.name.length > 128 ||
        !Number.isSafeInteger(entry.seatIndex) ||
        entry.seatIndex < 0 ||
        entry.seatIndex > 6,
    )
  )
    throw new Error('Invalid match setup');
  const roles = shuffle(getClassicRoleDistribution(input.participants.length), random);
  const characters = shuffle(CLASSIC_CHARACTERS, random);
  const players: PlayerState[] = [...input.participants]
    .sort((a, b) => a.seatIndex - b.seatIndex)
    .map((entry, index) => {
      const role = roles[index]!,
        character = characters[index]!;
      const maxHp = character.maxHp + Number(role === 'sheriff');
      return {
        ...entry,
        role,
        characterId: character.id,
        hp: maxHp,
        maxHp,
        alive: true,
        hand: [],
        equipment: [],
      };
    });
  const sheriff = players.find((entry) => entry.role === 'sheriff')!;
  const state: MatchState = {
    schemaVersion: 1,
    rulesetVersion: 'classic-v1',
    catalogVersion: CLASSIC_CATALOG_VERSION,
    matchId: input.matchId,
    revision: 1,
    status: 'active',
    hostSeatId: input.hostSeatId,
    timeoutPolicy: MATCH_TIMEOUT_POLICY,
    players,
    deck: shuffle(
      CLASSIC_DECK.map((card) => ({ ...card })),
      random,
    ),
    discard: [],
    turn: { seatId: sheriff.seatId, phase: 'draw', number: 1, bangsPlayed: 0 },
    pending: null,
    tasks: [],
    massEffect: null,
    outcome: null,
    publicResolutions: [],
    decisionSerial: 0,
  };
  // Starting hands are dealt clockwise from the Sheriff, one card at a time.
  const order = clockwise(state, sheriff.seatId, true).map((seatId) => player(state, seatId));
  for (let round = 0; round < 5; round++)
    for (const actor of order) if (round < actor.maxHp) drawTo(state, actor, 1, random);
  state.pending = newDecision(state, {
    kind: ['jesse_jones', 'pedro_ramirez'].includes(sheriff.characterId) ? 'draw_choice' : 'turn',
    ownerSeatId: sheriff.seatId,
  });
  assertMatch(state);
  return state;
}

function drawPhase(
  state: MatchState,
  actor: PlayerState,
  intent: Extract<GameIntent, { type: 'draw' }>,
  random: RandomSource,
): void {
  state.pending = null;
  state.tasks.push({ type: 'resume_play' });
  if (actor.characterId === 'kit_carlson') {
    const cards = [drawCard(state, random), drawCard(state, random), drawCard(state, random)];
    state.pending = newDecision(state, {
      kind: 'kit_carlson',
      ownerSeatId: actor.seatId,
      cards,
      check: null,
    });
    return;
  }
  if (intent.source === 'discard') actor.hand.push(state.discard.pop()!);
  else if (intent.source === 'opponent') {
    const target = player(state, intent.targetSeatId);
    actor.hand.push(target.hand.splice(randomInt(random, target.hand.length), 1)[0]!);
    suzy(state, random);
  } else drawTo(state, actor, 1, random);
  const second = drawCard(state, random);
  actor.hand.push(second);
  if (actor.characterId === 'black_jack') {
    log(state, { kind: 'black_jack_reveal', actorSeatId: actor.seatId, card: face(second) });
    if (second.suit === 'hearts' || second.suit === 'diamonds') drawTo(state, actor, 1, random);
  }
  suzy(state, random);
}

function play(
  state: MatchState,
  actor: PlayerState,
  intent: Extract<GameIntent, { type: 'play' }>,
  random: RandomSource,
): void {
  const card = removeCard(actor.hand, intent.cardId);
  state.pending = null;
  state.tasks.push({ type: 'resume_play' });
  log(state, {
    kind: 'played',
    actorSeatId: actor.seatId,
    card: face(card),
    ...(intent.targetSeatId === undefined ? {} : { targetSeatId: intent.targetSeatId }),
  });
  if (isEquipment(card.kind)) {
    const owner = card.kind === 'jail' ? player(state, intent.targetSeatId!) : actor;
    if (isWeapon(card.kind)) {
      const old = owner.equipment.find((entry) => isWeapon(entry.kind));
      if (old) discard(state, owner, [removeCard(owner.equipment, old.id)]);
    }
    owner.equipment.push(card);
    suzy(state, random);
    return;
  }
  // A brown card is already in the discard when its own effect draws/recycles.
  state.discard.push(card);
  if (card.kind !== 'duel' && card.kind !== 'general_store') suzy(state, random);
  switch (card.kind) {
    case 'bang':
    case 'missed':
      state.turn.bangsPlayed++;
      startDefense(
        state,
        intent.targetSeatId!,
        actor.seatId,
        'missed',
        actor.characterId === 'slab_the_killer' ? 2 : 1,
        'defend',
      );
      break;
    case 'beer':
      if (living(state).length > 2 && actor.hp < actor.maxHp) {
        actor.hp++;
        log(state, { kind: 'healed', actorSeatId: actor.seatId, amount: 1 });
      }
      break;
    case 'saloon':
      for (const target of living(state))
        if (target.hp < target.maxHp) {
          target.hp++;
          log(state, { kind: 'healed', actorSeatId: target.seatId, amount: 1 });
        }
      break;
    case 'stagecoach':
      drawTo(state, actor, 2, random);
      break;
    case 'wells_fargo':
      drawTo(state, actor, 3, random);
      break;
    case 'panic':
    case 'cat_balou': {
      const target = player(state, intent.targetSeatId!);
      const selected =
        intent.zone === 'equipment'
          ? removeCard(target.equipment, intent.targetCardId!)
          : target.hand.splice(randomInt(random, target.hand.length), 1)[0]!;
      if (card.kind === 'panic') actor.hand.push(selected);
      else discard(state, target, [selected]);
      suzy(state, random);
      break;
    }
    case 'duel':
      startDefense(state, intent.targetSeatId!, actor.seatId, 'bang', 1, 'duel', actor.seatId);
      break;
    case 'general_store': {
      const order = clockwise(state, actor.seatId, true);
      const cards = order.map(() => drawCard(state, random));
      state.pending = newDecision(state, {
        kind: 'general_store',
        ownerSeatId: order[0]!,
        cards,
        remainingSeatIds: order.slice(1),
      });
      break;
    }
    case 'gatling':
    case 'indians':
      state.decisionSerial++;
      state.massEffect = {
        massEffectId: `${state.matchId}:m${state.decisionSerial}`,
        kind: card.kind,
        sourceSeatId: actor.seatId,
        order: clockwise(state, actor.seatId),
        resolvedSeatIds: [],
        currentSeatId: null,
      };
      state.tasks.push({ type: 'mass_next' });
      break;
    default:
      throw new Error('Unreachable playable card');
  }
}

function respond(
  state: MatchState,
  actor: PlayerState,
  intent: Extract<GameIntent, { type: 'respond' }>,
  random: RandomSource,
): void {
  const pending = state.pending!;
  if (pending.kind === 'rescue') {
    if (intent.method === 'decline') declineRescue(state, pending.damage, random);
    else if (intent.method === 'card') {
      discard(state, actor, [removeCard(actor.hand, intent.cardId)]);
      actor.hp++;
      log(state, { kind: 'healed', actorSeatId: actor.seatId, amount: 1 });
      afterHealing(state);
      suzy(state, random);
    }
    return;
  }
  if (pending.kind !== 'defend' && pending.kind !== 'mass_response' && pending.kind !== 'duel')
    throw new Error('Invalid defense');
  if (intent.method === 'decline') finishDefense(state, pending, true, random);
  else if (intent.method === 'barrel' || intent.method === 'innate') {
    if (intent.method === 'barrel') pending.barrelUsed = true;
    else pending.innateUsed = true;
    state.pending = null;
    startCheck(state, actor.seatId, { type: 'defense', defense: pending }, random);
  } else if (intent.method === 'card') {
    discard(state, actor, [removeCard(actor.hand, intent.cardId)]);
    pending.remaining--;
    // Suzy may replenish a Missed between Slab's two required responses.
    suzy(state, random);
    if (pending.remaining === 0) finishDefense(state, pending, false, random);
  }
}

function choose(state: MatchState, actor: PlayerState, ids: string[], random: RandomSource): void {
  const pending = state.pending!;
  if (pending.kind === 'kit_carlson') {
    for (const id of ids) actor.hand.push(removeCard(pending.cards, id));
    state.deck.push(...pending.cards);
    state.pending = null;
  } else if (pending.kind === 'lucky_duke') {
    finishCheck(
      state,
      actor.seatId,
      pending.cards,
      pending.cards.find((card) => card.id === ids[0])!,
      pending.check!,
      random,
    );
  } else if (pending.kind === 'general_store') {
    actor.hand.push(removeCard(pending.cards, ids[0]!));
    const next = pending.remainingSeatIds.shift();
    if (next)
      state.pending = newDecision(state, {
        kind: 'general_store',
        ownerSeatId: next,
        cards: pending.cards,
        remainingSeatIds: pending.remainingSeatIds,
      });
    else state.pending = null;
    suzy(state, random);
  } else if (pending.kind === 'turn_discard' || pending.kind === 'elimination_discard') {
    const cards: CardInstance[] = [];
    for (const id of ids)
      cards.push(
        actor.hand.some((card) => card.id === id)
          ? removeCard(actor.hand, id)
          : removeCard(actor.equipment, id),
      );
    discard(state, actor, cards);
    state.pending = null;
    suzy(state, random);
  } else throw new Error('Invalid selection');
}

export function applyIntent(
  state: MatchState,
  actorSeatId: string,
  intent: GameIntent,
  random: RandomSource,
): TransitionResult<MatchState> {
  try {
    assertMatch(state);
  } catch {
    return { ok: false, error: 'invalid_state' };
  }
  if (state.status !== 'active') return { ok: false, error: 'match_ended' };
  if (!state.players.some((entry) => entry.seatId === actorSeatId))
    return { ok: false, error: 'forbidden' };
  if (!intent || typeof intent !== 'object' || typeof intent.type !== 'string')
    return { ok: false, error: 'invalid_intent' };
  const actions = legalActions(state, actorSeatId);
  if (!actions.some((action) => permits(action, intent))) {
    if (state.pending?.ownerSeatId !== actorSeatId && intent.type !== 'sid_heal')
      return { ok: false, error: 'wrong_actor' };
    if (intent.type === 'choose' || intent.type === 'sid_heal')
      return { ok: false, error: 'illegal_choice' };
    if (intent.type === 'respond') return { ok: false, error: 'invalid_decision' };
    return { ok: false, error: 'invalid_intent' };
  }
  const next = clone(state);
  next.revision++;
  const actor = player(next, actorSeatId);
  try {
    switch (intent.type) {
      case 'draw':
        drawPhase(next, actor, intent, random);
        break;
      case 'play':
        play(next, actor, intent, random);
        break;
      case 'respond':
        respond(next, actor, intent, random);
        break;
      case 'choose':
        choose(next, actor, intent.cardIds, random);
        break;
      case 'end_turn': {
        next.pending = null;
        next.turn.phase = 'discard';
        next.tasks.push({ type: 'next_turn' });
        const count = actor.hand.length - actor.hp;
        if (count > 0)
          next.pending = newDecision(next, {
            kind: 'turn_discard',
            ownerSeatId: actor.seatId,
            count,
            includeEquipment: false,
          });
        break;
      }
      case 'sid_heal': {
        discard(
          next,
          actor,
          intent.cardIds.map((id) => removeCard(actor.hand, id)),
        );
        actor.hp++;
        log(next, { kind: 'healed', actorSeatId: actor.seatId, amount: 1 });
        afterHealing(next);
        if (next.pending?.ownerSeatId === actorSeatId && next.pending.kind === 'turn_discard') {
          next.pending.count = Math.max(0, actor.hand.length - actor.hp);
          if (next.pending.count === 0) next.pending = null;
        } else if (
          next.pending?.ownerSeatId === actorSeatId &&
          next.pending.kind === 'elimination_discard'
        ) {
          next.pending.count = actor.hand.length + actor.equipment.length;
          if (next.pending.count === 0) next.pending = null;
        }
        break;
      }
    }
    advance(next, random);
    assertMatch(next);
    return {
      ok: true,
      state: next,
      publicResolutions: next.publicResolutions.filter((entry) => entry.revision === next.revision),
    };
  } catch (error) {
    if (error instanceof ResourceUnavailable) return { ok: false, error: 'resource_unavailable' };
    throw error;
  }
}

export function abortMatch(
  state: MatchState,
  hostActorSeatId: string,
): TransitionResult<MatchState> {
  try {
    assertMatch(state);
  } catch {
    return { ok: false, error: 'invalid_state' };
  }
  if (state.hostSeatId !== hostActorSeatId) return { ok: false, error: 'forbidden' };
  if (state.status !== 'active') return { ok: false, error: 'match_ended' };
  const next = clone(state);
  next.status = 'aborted';
  next.revision++;
  // Pending pools are still physical cards. Return them without revealing them.
  if (next.pending && 'cards' in next.pending) next.deck.push(...next.pending.cards);
  next.pending = null;
  next.tasks = [];
  next.massEffect = null;
  next.outcome = { status: 'aborted', winner: null, winnerSeatIds: [] };
  assertMatch(next);
  return { ok: true, state: next, publicResolutions: [] };
}
