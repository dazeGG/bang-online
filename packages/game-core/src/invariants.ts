import { CLASSIC_CATALOG_VERSION, CLASSIC_CHARACTERS, CLASSIC_DECK } from './catalog.js';
import { getClassicRoleDistribution, isClassicPlayerCount } from './index.js';
import type { DamageTask, DefenseDecision, EffectTask, MatchState } from './model.js';

type Obj = Record<string, unknown>;
function fail(): never {
  throw new Error('Invalid saved classic match');
}
function object(value: unknown, required: string[], optional: string[] = []): Obj {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return fail();
  const result = value as Obj;
  if (
    required.some((key) => !Object.hasOwn(result, key)) ||
    Object.keys(result).some((key) => !required.includes(key) && !optional.includes(key))
  )
    return fail();
  return result;
}
function array(value: unknown, max = 80): unknown[] {
  if (!Array.isArray(value) || value.length > max) return fail();
  return value as unknown[];
}
function text(value: unknown, max = 128): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > max) return fail();
  return value;
}
function integer(value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max)
    return fail();
  return value;
}
function oneOf<T extends string>(value: unknown, choices: readonly T[]): T {
  if (typeof value !== 'string' || !choices.includes(value as T)) return fail();
  return value as T;
}
function unique(values: unknown[]): void {
  if (new Set(values).size !== values.length) fail();
}
function bool(value: unknown): boolean {
  if (typeof value !== 'boolean') return fail();
  return value;
}
const deck = new Map(CLASSIC_DECK.map((card) => [card.id, card]));
function cardFace(raw: unknown, instance: boolean): string | null {
  const card = object(raw, instance ? ['id', 'kind', 'suit', 'rank'] : ['kind', 'suit', 'rank']);
  const candidates = instance ? [deck.get(text(card.id))] : CLASSIC_DECK;
  if (
    !candidates.some(
      (entry) =>
        entry && entry.kind === card.kind && entry.suit === card.suit && entry.rank === card.rank,
    )
  )
    fail();
  return instance ? text(card.id) : null;
}

/** Saved boundaries have a small, exact continuation grammar. Forced frames never
 * remain between commands: advance consumes them before exposing a decision. */
function validateContinuations(state: MatchState): void {
  if (state.status !== 'active') return;
  const pending = state.pending!;
  const actor = (seatId: string) => state.players.find((entry) => entry.seatId === seatId)!;
  const mass = state.massEffect;
  const playTasks: EffectTask[] = [{ type: 'resume_play' }];
  const massTasks: EffectTask[] = [...playTasks, { type: 'mass_next' }];
  function requireTasks(expected: EffectTask[]): void {
    if (
      state.tasks.length !== expected.length ||
      expected.some((task, index) =>
        Object.entries(task).some(
          ([key, value]) => (state.tasks[index] as unknown as Obj)[key] !== value,
        ),
      )
    )
      fail();
  }
  function requirePlay(): void {
    if (state.turn.phase !== 'play') fail();
  }
  function requireNoMass(): void {
    if (mass !== null) fail();
  }
  if (mass) {
    requirePlay();
    if (
      mass.sourceSeatId !== state.turn.seatId ||
      !actor(mass.sourceSeatId).alive ||
      mass.currentSeatId === null
    )
      fail();
    const sourceIndex = state.players.findIndex((entry) => entry.seatId === mass.sourceSeatId);
    const clockwise = [
      ...state.players.slice(sourceIndex + 1),
      ...state.players.slice(0, sourceIndex),
    ].map((entry) => entry.seatId);
    const canonicalOrder = clockwise.filter((id) => mass.order.includes(id));
    if (
      canonicalOrder.some((id, index) => mass.order[index] !== id) ||
      canonicalOrder.length !== mass.order.length ||
      state.players.some(
        (entry) =>
          entry.alive && entry.seatId !== mass.sourceSeatId && !mass.order.includes(entry.seatId),
      ) ||
      mass.resolvedSeatIds.some((id, index) => mass.order[index] !== id) ||
      mass.currentSeatId !== mass.order[mass.resolvedSeatIds.length] ||
      mass.order.slice(mass.resolvedSeatIds.length + 1).some((id) => !actor(id).alive)
    )
      fail();
  }
  function validateDefense(defense: DefenseDecision): void {
    requirePlay();
    if (
      defense.sourceSeatId !== state.turn.seatId ||
      !actor(defense.sourceSeatId).alive ||
      !actor(defense.ownerSeatId).alive
    )
      fail();
    const defender = actor(defense.ownerSeatId);
    if (defense.barrelUsed && !defender.equipment.some((card) => card.kind === 'barrel')) fail();
    if (defense.innateUsed && defender.characterId !== 'jourdonnais') fail();
    if (defense.kind === 'mass_response') {
      if (
        !mass ||
        defense.ownerSeatId !== mass.currentSeatId ||
        defense.sourceSeatId !== mass.sourceSeatId ||
        defense.remaining !== 1 ||
        defense.requirement !== (mass.kind === 'indians' ? 'bang' : 'missed')
      )
        fail();
    } else {
      requireNoMass();
      if (defense.kind === 'defend') {
        if (
          defense.ownerSeatId === defense.sourceSeatId ||
          defense.requirement !== 'missed' ||
          defense.remaining >
            (actor(defense.sourceSeatId).characterId === 'slab_the_killer' ? 2 : 1)
        )
          fail();
      } else if (
        defense.requirement !== 'bang' ||
        defense.remaining !== 1 ||
        (defense.ownerSeatId !== defense.sourceSeatId &&
          defense.duelOtherSeatId !== defense.sourceSeatId) ||
        !actor(defense.duelOtherSeatId!).alive
      )
        fail();
    }
    if (defense.requirement !== 'missed' && (defense.barrelUsed || defense.innateUsed)) fail();
  }
  function damageTasks(damage: DamageTask): EffectTask[] {
    if (mass) {
      requirePlay();
      if (
        damage.seatId !== mass.currentSeatId ||
        damage.sourceSeatId !== mass.sourceSeatId ||
        damage.amount !== 1
      )
        fail();
      return massTasks;
    }
    if (damage.sourceSeatId === null) {
      if (
        damage.seatId !== state.turn.seatId ||
        damage.amount !== 3 ||
        state.turn.phase !== 'checks'
      )
        fail();
      return [
        { type: 'draw_phase', seatId: damage.seatId },
        { type: 'jail_check', seatId: damage.seatId },
      ];
    }
    requirePlay();
    if (
      damage.sourceSeatId !== state.turn.seatId ||
      damage.amount !== 1 ||
      (damage.seatId !== damage.sourceSeatId && !actor(damage.sourceSeatId).alive)
    )
      fail();
    return playTasks;
  }
  switch (pending.kind) {
    case 'turn':
    case 'draw_choice':
      requireNoMass();
      requireTasks([]);
      if (pending.kind === 'draw_choice' && state.turn.phase !== 'draw') fail();
      break;
    case 'defend':
    case 'duel':
    case 'mass_response':
      validateDefense(pending);
      requireTasks(mass ? massTasks : playTasks);
      break;
    case 'kit_carlson':
      requireNoMass();
      requireTasks(playTasks);
      if (pending.ownerSeatId !== state.turn.seatId || state.turn.phase !== 'draw') fail();
      break;
    case 'general_store': {
      requireNoMass();
      requirePlay();
      requireTasks(playTasks);
      if (!actor(state.turn.seatId).alive) fail();
      const start = state.players.findIndex((entry) => entry.seatId === state.turn.seatId);
      const order = [...state.players.slice(start), ...state.players.slice(0, start)]
        .filter((entry) => entry.alive)
        .map((entry) => entry.seatId);
      const remaining = order.slice(order.indexOf(pending.ownerSeatId) + 1);
      if (
        remaining.length !== pending.remainingSeatIds.length ||
        remaining.some((id, index) => pending.remainingSeatIds[index] !== id)
      )
        fail();
      break;
    }
    case 'lucky_duke': {
      const check = pending.check!;
      if (check.type === 'defense') {
        validateDefense(check.defense);
        requireTasks(mass ? massTasks : playTasks);
        if (!check.defense.barrelUsed || check.defense.innateUsed) fail();
      } else {
        requireNoMass();
        if (
          state.turn.phase !== 'checks' ||
          pending.ownerSeatId !== state.turn.seatId ||
          !actor(pending.ownerSeatId).equipment.some((card) => card.kind === check.type)
        )
          fail();
        requireTasks(
          check.type === 'jail'
            ? [{ type: 'draw_phase', seatId: pending.ownerSeatId }]
            : [
                { type: 'draw_phase', seatId: pending.ownerSeatId },
                { type: 'jail_check', seatId: pending.ownerSeatId },
              ],
        );
      }
      break;
    }
    case 'rescue':
      requireTasks(damageTasks(pending.damage));
      break;
    case 'turn_discard':
      requireNoMass();
      requireTasks([{ type: 'next_turn' }]);
      break;
    case 'elimination_discard': {
      if (!pending.includeEquipment) fail();
      const owner = actor(pending.ownerSeatId);
      if (!owner.alive) {
        const task = state.tasks.at(-1);
        if (task?.type !== 'kill_consequences' || task.seatId !== pending.ownerSeatId) fail();
        const continuation = damageTasks({
          type: 'damage',
          seatId: task.seatId,
          sourceSeatId: task.sourceSeatId,
          amount: task.sourceSeatId === null ? 3 : 1,
        });
        requireTasks([...continuation, task]);
      } else {
        requirePlay();
        if (
          owner.role !== 'sheriff' ||
          owner.seatId !== state.turn.seatId ||
          !state.players.some((entry) => !entry.alive && entry.role === 'deputy')
        )
          fail();
        if (
          mass &&
          (actor(mass.currentSeatId!).alive || actor(mass.currentSeatId!).role !== 'deputy')
        )
          fail();
        requireTasks(mass ? massTasks : playTasks);
      }
      break;
    }
  }
}

/** Decode is deliberately fail-closed, including nested continuation and card zones. */
export function decodeMatch(raw: unknown): MatchState {
  const state = object(raw, [
    'schemaVersion',
    'rulesetVersion',
    'catalogVersion',
    'matchId',
    'revision',
    'status',
    'hostSeatId',
    'timeoutPolicy',
    'players',
    'deck',
    'discard',
    'turn',
    'pending',
    'tasks',
    'massEffect',
    'outcome',
    'publicResolutions',
    'decisionSerial',
  ]);
  if (
    state.schemaVersion !== 1 ||
    state.rulesetVersion !== 'classic-v1' ||
    state.catalogVersion !== CLASSIC_CATALOG_VERSION ||
    state.timeoutPolicy !== 'wait-for-required-actor'
  )
    fail();
  text(state.matchId, 80);
  integer(state.revision, 1);
  integer(state.decisionSerial, 1);
  const status = oneOf(state.status, ['active', 'finished', 'aborted']);
  const players = array(state.players, 7).map((rawPlayer) =>
    object(rawPlayer, [
      'seatId',
      'name',
      'seatIndex',
      'role',
      'characterId',
      'hp',
      'maxHp',
      'alive',
      'hand',
      'equipment',
    ]),
  );
  if (!isClassicPlayerCount(players.length)) fail();
  const seats = players.map((actor) => text(actor.seatId));
  unique(seats);
  unique(players.map((actor) => integer(actor.seatIndex, 0, 6)));
  unique(players.map((actor) => text(actor.characterId)));
  if (
    players.some(
      (actor, index) =>
        index > 0 && Number(actor.seatIndex) <= Number(players[index - 1]!.seatIndex),
    )
  )
    fail();
  const seat = (value: unknown): string => {
    const id = text(value);
    if (!seats.includes(id)) fail();
    return id;
  };
  seat(state.hostSeatId);
  const roles = getClassicRoleDistribution(players.length);
  if (
    JSON.stringify([...roles].sort()) !== JSON.stringify(players.map((actor) => actor.role).sort())
  )
    fail();
  const owned: string[] = [];
  const cards = (value: unknown): unknown[] => {
    const list = array(value);
    for (const entry of list) owned.push(cardFace(entry, true)!);
    return list;
  };
  for (const actor of players) {
    text(actor.name);
    bool(actor.alive);
    const character = CLASSIC_CHARACTERS.find((entry) => entry.id === actor.characterId);
    if (!character || actor.maxHp !== character.maxHp + Number(actor.role === 'sheriff')) fail();
    integer(actor.hp, -2, actor.maxHp as number);
    if (actor.alive === false && actor.hp !== 0) fail();
    cards(actor.hand);
    const equipment = cards(actor.equipment).map((entry) => entry as Obj);
    const equipmentKinds = equipment.map((entry) => entry.kind);
    unique(equipmentKinds);
    if (
      equipmentKinds.some(
        (kind) =>
          ![
            'barrel',
            'dynamite',
            'scope',
            'mustang',
            'jail',
            'volcanic',
            'schofield',
            'remington',
            'rev_carabine',
            'winchester',
          ].includes(String(kind)),
      )
    )
      fail();
    if (
      equipmentKinds.filter((kind) =>
        ['volcanic', 'schofield', 'remington', 'rev_carabine', 'winchester'].includes(String(kind)),
      ).length > 1
    )
      fail();
    if (actor.role === 'sheriff' && equipmentKinds.includes('jail')) fail();
  }
  cards(state.deck);
  cards(state.discard);
  const turn = object(state.turn, ['seatId', 'phase', 'number', 'bangsPlayed']);
  seat(turn.seatId);
  oneOf(turn.phase, ['checks', 'draw', 'play', 'discard']);
  integer(turn.number, 1);
  integer(turn.bangsPlayed, 0);
  function publicDecision(rawPending: unknown, extra: string[]): Obj {
    const pending = object(
      rawPending,
      ['id', 'kind', 'ownerSeatId', ...extra],
      ['sourceSeatId', 'sourceCard', 'requiredResponses'],
    );
    text(pending.id);
    seat(pending.ownerSeatId);
    if (pending.sourceSeatId !== undefined) seat(pending.sourceSeatId);
    if (pending.sourceCard !== undefined) cardFace(pending.sourceCard, false);
    if (pending.requiredResponses !== undefined) integer(pending.requiredResponses, 1, 2);
    return pending;
  }
  function defense(rawDefense: unknown): Obj {
    const pending = publicDecision(rawDefense, [
      'requirement',
      'remaining',
      'barrelUsed',
      'innateUsed',
      'duelOtherSeatId',
    ]);
    oneOf(pending.kind, ['defend', 'duel', 'mass_response']);
    seat(pending.sourceSeatId);
    oneOf(pending.requirement, ['bang', 'missed']);
    integer(pending.remaining, 1, 2);
    bool(pending.barrelUsed);
    bool(pending.innateUsed);
    if (pending.kind === 'duel') {
      seat(pending.duelOtherSeatId);
      if (
        pending.requirement !== 'bang' ||
        pending.remaining !== 1 ||
        pending.duelOtherSeatId === pending.ownerSeatId
      )
        fail();
    } else if (pending.duelOtherSeatId !== null) fail();
    return pending;
  }
  function damage(rawDamage: unknown): Obj {
    const result = object(rawDamage, ['type', 'seatId', 'sourceSeatId', 'amount']);
    if (result.type !== 'damage') fail();
    seat(result.seatId);
    if (result.sourceSeatId !== null) seat(result.sourceSeatId);
    if (result.amount !== 1 && result.amount !== 3) fail();
    return result;
  }
  let pending: Obj | null = null;
  if (state.pending !== null) {
    const base = state.pending as Obj;
    switch (base?.kind) {
      case 'turn':
      case 'draw_choice':
        pending = publicDecision(base, []);
        if (pending.ownerSeatId !== turn.seatId || !['draw', 'play'].includes(String(turn.phase)))
          fail();
        break;
      case 'defend':
      case 'mass_response':
      case 'duel':
        pending = defense(base);
        break;
      case 'kit_carlson':
      case 'lucky_duke': {
        pending = publicDecision(base, ['cards', 'check']);
        const pool = cards(pending.cards);
        if (pool.length !== (pending.kind === 'kit_carlson' ? 3 : 2)) fail();
        if (pending.kind === 'kit_carlson') {
          if (pending.check !== null) fail();
        } else {
          const check = pending.check as Obj;
          if (check?.type === 'defense') {
            object(check, ['type', 'defense']);
            const target = defense(check.defense);
            if (target.ownerSeatId !== pending.ownerSeatId) fail();
          } else {
            object(check, ['type', 'ownerSeatId']);
            oneOf(check.type, ['jail', 'dynamite']);
            if (seat(check.ownerSeatId) !== pending.ownerSeatId) fail();
          }
        }
        break;
      }
      case 'general_store': {
        pending = publicDecision(base, ['cards', 'remainingSeatIds']);
        const remaining = array(pending.remainingSeatIds, 6).map(seat);
        unique(remaining);
        if (
          remaining.includes(String(pending.ownerSeatId)) ||
          cards(pending.cards).length !== remaining.length + 1
        )
          fail();
        break;
      }
      case 'rescue': {
        pending = publicDecision(base, ['damage']);
        const effect = damage(pending.damage);
        if (effect.seatId !== pending.ownerSeatId) fail();
        const actor = players.find((entry) => entry.seatId === pending!.ownerSeatId)!;
        if (!actor.alive || Number(actor.hp) > 0) fail();
        break;
      }
      case 'turn_discard':
      case 'elimination_discard':
        pending = publicDecision(base, ['count', 'includeEquipment']);
        integer(pending.count, 1, 80);
        bool(pending.includeEquipment);
        if (
          pending.kind === 'turn_discard' &&
          (pending.ownerSeatId !== turn.seatId ||
            turn.phase !== 'discard' ||
            pending.includeEquipment !== false)
        )
          fail();
        break;
      default:
        fail();
    }
    const actor = players.find((entry) => entry.seatId === pending!.ownerSeatId)!;
    if (actor.alive === false && pending.kind !== 'elimination_discard') fail();
    if (
      pending.kind === 'turn_discard' &&
      pending.count !== (actor.hand as unknown[]).length - Number(actor.hp)
    )
      fail();
    if (
      pending.kind === 'elimination_discard' &&
      pending.count !== (actor.hand as unknown[]).length + (actor.equipment as unknown[]).length
    )
      fail();
    if (pending.kind === 'kit_carlson' && actor.characterId !== 'kit_carlson') fail();
    if (pending.kind === 'lucky_duke' && actor.characterId !== 'lucky_duke') fail();
  }
  for (const rawTask of array(state.tasks, 32)) {
    const task = rawTask as Obj;
    switch (task?.type) {
      case 'start_turn':
      case 'jail_check':
      case 'draw_phase':
        object(task, ['type', 'seatId']);
        seat(task.seatId);
        break;
      case 'resume_play':
      case 'next_turn':
      case 'mass_next':
        object(task, ['type']);
        break;
      case 'damage':
        damage(task);
        break;
      case 'after_damage':
        object(task, ['type', 'damage']);
        damage(task.damage);
        break;
      case 'kill_consequences':
        object(task, ['type', 'seatId', 'sourceSeatId']);
        seat(task.seatId);
        if (task.sourceSeatId !== null) seat(task.sourceSeatId);
        break;
      default:
        fail();
    }
  }
  const tasks = state.tasks as Obj[];
  if (pending) {
    if (pending.kind === 'turn' || pending.kind === 'draw_choice') {
      if (tasks.length !== 0) fail();
    } else if (tasks.length === 0) fail();
    if (
      ['defend', 'duel', 'kit_carlson', 'general_store'].includes(String(pending.kind)) &&
      tasks.at(-1)?.type !== 'resume_play'
    )
      fail();
    if (pending.kind === 'turn_discard' && tasks.at(-1)?.type !== 'next_turn') fail();
    if (pending.kind === 'mass_response' && tasks.at(-1)?.type !== 'mass_next') fail();
  }
  if (state.massEffect !== null) {
    const mass = object(state.massEffect, [
      'massEffectId',
      'kind',
      'sourceSeatId',
      'order',
      'resolvedSeatIds',
      'currentSeatId',
    ]);
    text(mass.massEffectId);
    oneOf(mass.kind, ['gatling', 'indians']);
    seat(mass.sourceSeatId);
    const order = array(mass.order, 6).map(seat),
      resolved = array(mass.resolvedSeatIds, 6).map(seat);
    unique(order);
    unique(resolved);
    if (order.includes(String(mass.sourceSeatId)) || resolved.some((id) => !order.includes(id)))
      fail();
    if (
      mass.currentSeatId !== null &&
      (!order.includes(seat(mass.currentSeatId)) || resolved.includes(String(mass.currentSeatId)))
    )
      fail();
  } else if (
    pending?.kind === 'mass_response' ||
    (state.tasks as Obj[]).some((task) => task.type === 'mass_next')
  )
    fail();
  if (state.outcome === null) {
    if (status !== 'active' || pending === null) fail();
  } else {
    const outcome = object(state.outcome, ['status', 'winner', 'winnerSeatIds']);
    if (
      outcome.status !== status ||
      status === 'active' ||
      pending !== null ||
      state.massEffect !== null ||
      (state.tasks as unknown[]).length > 0
    )
      fail();
    const winners = array(outcome.winnerSeatIds, 7).map(seat);
    unique(winners);
    if (status === 'aborted') {
      if (outcome.winner !== null || winners.length !== 0) fail();
    } else {
      const winner = oneOf(outcome.winner, ['sheriff_deputies', 'outlaws', 'renegade']);
      const expected = players
        .filter((actor) =>
          winner === 'sheriff_deputies'
            ? actor.role === 'sheriff' || actor.role === 'deputy'
            : actor.role === (winner === 'outlaws' ? 'outlaw' : 'renegade'),
        )
        .map((actor) => actor.seatId);
      if (JSON.stringify([...winners].sort()) !== JSON.stringify(expected.sort())) fail();
      const sheriff = players.find((actor) => actor.role === 'sheriff')!;
      const survivors = players.filter((actor) => actor.alive);
      if (
        winner === 'sheriff_deputies'
          ? !sheriff.alive ||
            survivors.some((actor) => actor.role === 'outlaw' || actor.role === 'renegade')
          : winner === 'renegade'
            ? sheriff.alive || survivors.length !== 1 || survivors[0]!.role !== 'renegade'
            : sheriff.alive || (survivors.length === 1 && survivors[0]!.role === 'renegade')
      )
        fail();
    }
  }
  for (const actor of players)
    if (
      status === 'active' &&
      actor.alive &&
      Number(actor.hp) <= 0 &&
      (pending?.kind !== 'rescue' || pending.ownerSeatId !== actor.seatId)
    )
      fail();
  if (status === 'finished' && players.some((actor) => actor.alive && Number(actor.hp) <= 0))
    fail();
  let previousRevision = 0,
    previousOrdinal = -1;
  for (const rawEntry of array(state.publicResolutions, 64)) {
    const entry = object(
      rawEntry,
      ['revision', 'ordinal', 'kind', 'actorSeatId'],
      ['targetSeatId', 'card', 'amount'],
    );
    const revision = integer(entry.revision, 1, Number(state.revision)),
      ordinal = integer(entry.ordinal, 0);
    if (
      revision < previousRevision ||
      (revision === previousRevision && ordinal <= previousOrdinal)
    )
      fail();
    previousRevision = revision;
    previousOrdinal = ordinal;
    oneOf(entry.kind, [
      'played',
      'check',
      'black_jack_reveal',
      'damage',
      'healed',
      'eliminated',
      'discarded',
      'mass_resolved',
    ]);
    seat(entry.actorSeatId);
    if (entry.targetSeatId !== undefined) seat(entry.targetSeatId);
    if (entry.card !== undefined) cardFace(entry.card, false);
    if (entry.amount !== undefined) integer(entry.amount, 1, 3);
  }
  unique(owned);
  if (owned.length !== 80 || CLASSIC_DECK.some((card) => !owned.includes(card.id))) fail();
  validateContinuations(raw as MatchState);
  // Return a detached JSON value: callers cannot mutate a database driver's object.
  return JSON.parse(JSON.stringify(raw)) as MatchState;
}

export function assertMatch(state: MatchState): void {
  decodeMatch(state);
}
