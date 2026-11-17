import type { RandomSource } from './api.js';
import type { CardInstance } from './catalog.js';
import type { CheckPurpose, DamageTask, DefenseDecision, MatchState } from './model.js';
import {
  clockwise,
  discard,
  drawCard,
  drawTo,
  face,
  hasEquipment,
  living,
  log,
  newDecision,
  player,
  randomInt,
  removeCard,
  suzy,
} from './mechanics.js';

export function checkVictory(state: MatchState): boolean {
  const alive = living(state);
  const sheriff = state.players.find((actor) => actor.role === 'sheriff')!;
  let winner: 'sheriff_deputies' | 'outlaws' | 'renegade' | null = null;
  if (!sheriff.alive) {
    winner = alive.length === 1 && alive[0]!.role === 'renegade' ? 'renegade' : 'outlaws';
  } else if (!alive.some((actor) => actor.role === 'outlaw' || actor.role === 'renegade'))
    winner = 'sheriff_deputies';
  if (winner === null) return false;
  state.status = 'finished';
  state.outcome = {
    status: 'finished',
    winner,
    winnerSeatIds: state.players
      .filter((actor) =>
        winner === 'sheriff_deputies'
          ? actor.role === 'sheriff' || actor.role === 'deputy'
          : actor.role === (winner === 'outlaws' ? 'outlaw' : 'renegade'),
      )
      .map((actor) => actor.seatId),
  };
  state.pending = null;
  state.tasks = [];
  state.massEffect = null;
  return true;
}

export function startDefense(
  state: MatchState,
  target: string,
  source: string,
  requirement: 'bang' | 'missed',
  remaining: number,
  kind: DefenseDecision['kind'],
  duelOtherSeatId: string | null = null,
): void {
  state.pending = newDecision(state, {
    kind,
    ownerSeatId: target,
    sourceSeatId: source,
    requirement,
    remaining,
    barrelUsed: false,
    innateUsed: false,
    duelOtherSeatId,
  });
}

export function startCheck(
  state: MatchState,
  ownerSeatId: string,
  purpose: CheckPurpose,
  random: RandomSource,
): void {
  const actor = player(state, ownerSeatId);
  const cards = [drawCard(state, random)];
  if (actor.characterId === 'lucky_duke') {
    cards.push(drawCard(state, random));
    state.pending = newDecision(state, { kind: 'lucky_duke', ownerSeatId, cards, check: purpose });
  } else finishCheck(state, ownerSeatId, cards, cards[0]!, purpose, random);
}

export function finishCheck(
  state: MatchState,
  seatId: string,
  cards: CardInstance[],
  chosen: CardInstance,
  purpose: CheckPurpose,
  random: RandomSource,
): void {
  const actor = player(state, seatId);
  state.pending = null;
  // Preserve physical discard order, but identify the selected result as the last
  // public check summary. Historical summaries are metadata, not ownership zones.
  for (const card of cards) {
    state.discard.push(card);
  }
  for (const card of [...cards.filter((entry) => entry.id !== chosen.id), chosen])
    log(state, { kind: 'check', actorSeatId: seatId, card: face(card) });
  if (purpose.type === 'defense') {
    const defense = purpose.defense;
    if (chosen.suit === 'hearts') defense.remaining--;
    if (defense.remaining > 0) state.pending = defense;
    else finishDefense(state, defense, false, random);
  } else if (purpose.type === 'jail') {
    const jail = actor.equipment.find((card) => card.kind === 'jail');
    if (!jail) throw new Error('Missing Jail');
    discard(state, actor, [removeCard(actor.equipment, jail.id)]);
    if (chosen.suit !== 'hearts') {
      // The failed Jail check replaces this turn's remaining draw phase.
      const draw = state.tasks.at(-1);
      if (draw?.type !== 'draw_phase' || draw.seatId !== seatId)
        throw new Error('Invalid Jail continuation');
      state.tasks.pop();
      state.tasks.push({ type: 'next_turn' });
    }
  } else {
    const dynamite = actor.equipment.find((card) => card.kind === 'dynamite');
    if (!dynamite) throw new Error('Missing Dynamite');
    removeCard(actor.equipment, dynamite.id);
    const value = Number(chosen.rank);
    if (chosen.suit === 'spades' && value >= 2 && value <= 9) {
      discard(state, actor, [dynamite]);
      state.tasks.push({ type: 'damage', seatId, sourceSeatId: null, amount: 3 });
    } else {
      const nextId = clockwise(state, seatId)[0] ?? seatId;
      player(state, nextId).equipment.push(dynamite);
    }
  }
}

export function finishDefense(
  state: MatchState,
  defense: DefenseDecision,
  damaged: boolean,
  random: RandomSource,
): void {
  state.pending = null;
  if (!damaged && defense.kind === 'duel') {
    startDefense(
      state,
      defense.duelOtherSeatId!,
      defense.sourceSeatId,
      'bang',
      1,
      'duel',
      defense.ownerSeatId,
    );
    return;
  }
  if (damaged)
    state.tasks.push({
      type: 'damage',
      seatId: defense.ownerSeatId,
      sourceSeatId: defense.sourceSeatId,
      amount: 1,
    });
  // Suzy draws after Duel ends, including before El Gringo's damage theft.
  if (!damaged) suzy(state, random);
}

function eliminate(state: MatchState, damage: DamageTask, random: RandomSource): void {
  const actor = player(state, damage.seatId);
  actor.alive = false;
  actor.hp = 0;
  log(state, { kind: 'eliminated', actorSeatId: actor.seatId });
  state.tasks.push({
    type: 'kill_consequences',
    seatId: actor.seatId,
    sourceSeatId: damage.sourceSeatId,
  });
  const vulture = living(state).find((entry) => entry.characterId === 'vulture_sam');
  if (vulture) {
    vulture.hand.push(...actor.hand, ...actor.equipment);
    actor.hand = [];
    actor.equipment = [];
  } else if (actor.hand.length + actor.equipment.length > 1) {
    state.pending = newDecision(state, {
      kind: 'elimination_discard',
      ownerSeatId: actor.seatId,
      count: actor.hand.length + actor.equipment.length,
      includeEquipment: true,
    });
  } else {
    discard(state, actor, [...actor.hand, ...actor.equipment]);
    actor.hand = [];
    actor.equipment = [];
  }
  suzy(state, random);
}

export function declineRescue(state: MatchState, damage: DamageTask, random: RandomSource): void {
  state.pending = null;
  eliminate(state, damage, random);
}

export function afterHealing(state: MatchState): void {
  if (state.pending?.kind === 'rescue' && player(state, state.pending.ownerSeatId).hp > 0) {
    state.tasks.push({ type: 'after_damage', damage: state.pending.damage });
    state.pending = null;
  }
}

/** Resolve forced frames only. Every actual player choice stops at durable pending. */
export function advance(state: MatchState, random: RandomSource): void {
  let steps = 0;
  while (state.status === 'active' && state.pending === null && state.tasks.length > 0) {
    if (++steps > 500) throw new Error('Invalid effect loop');
    const task = state.tasks.pop()!;
    switch (task.type) {
      case 'start_turn': {
        const actor = player(state, task.seatId);
        state.turn = {
          seatId: actor.seatId,
          phase: 'checks',
          number: state.turn.number + 1,
          bangsPlayed: 0,
        };
        state.tasks.push(
          { type: 'draw_phase', seatId: actor.seatId },
          { type: 'jail_check', seatId: actor.seatId },
        );
        if (hasEquipment(actor, 'dynamite'))
          startCheck(state, actor.seatId, { type: 'dynamite', ownerSeatId: actor.seatId }, random);
        break;
      }
      case 'jail_check': {
        const actor = player(state, task.seatId);
        if (!actor.alive) {
          state.tasks = [];
          if (!checkVictory(state)) state.tasks.push({ type: 'next_turn' });
        } else if (hasEquipment(actor, 'jail'))
          startCheck(state, actor.seatId, { type: 'jail', ownerSeatId: actor.seatId }, random);
        break;
      }
      case 'draw_phase': {
        state.turn.phase = 'draw';
        const actor = player(state, task.seatId);
        state.pending = newDecision(state, {
          kind: ['jesse_jones', 'pedro_ramirez'].includes(actor.characterId)
            ? 'draw_choice'
            : 'turn',
          ownerSeatId: actor.seatId,
        });
        break;
      }
      case 'resume_play': {
        suzy(state, random);
        if (checkVictory(state)) break;
        const actor = player(state, state.turn.seatId);
        if (!actor.alive) state.tasks.push({ type: 'next_turn' });
        else {
          state.turn.phase = 'play';
          state.pending = newDecision(state, { kind: 'turn', ownerSeatId: actor.seatId });
        }
        break;
      }
      case 'next_turn': {
        suzy(state, random);
        if (!checkVictory(state)) {
          const next = clockwise(state, state.turn.seatId)[0];
          if (!next) throw new Error('No next player');
          state.tasks.push({ type: 'start_turn', seatId: next });
        }
        break;
      }
      case 'mass_next': {
        const mass = state.massEffect;
        if (!mass) throw new Error('Missing mass continuation');
        if (mass.currentSeatId !== null) mass.resolvedSeatIds.push(mass.currentSeatId);
        const next = mass.order.find(
          (seatId) => !mass.resolvedSeatIds.includes(seatId) && player(state, seatId).alive,
        );
        if (!next) {
          log(state, { kind: 'mass_resolved', actorSeatId: mass.sourceSeatId });
          state.massEffect = null;
        } else {
          mass.currentSeatId = next;
          state.tasks.push({ type: 'mass_next' });
          startDefense(
            state,
            next,
            mass.sourceSeatId,
            mass.kind === 'indians' ? 'bang' : 'missed',
            1,
            'mass_response',
          );
        }
        break;
      }
      case 'damage': {
        const actor = player(state, task.seatId);
        if (!actor.alive) break;
        actor.hp -= task.amount;
        log(state, {
          kind: 'damage',
          actorSeatId: actor.seatId,
          amount: task.amount,
          ...(task.sourceSeatId === null ? {} : { targetSeatId: task.sourceSeatId }),
        });
        if (actor.hp <= 0)
          state.pending = newDecision(state, {
            kind: 'rescue',
            ownerSeatId: actor.seatId,
            damage: task,
          });
        else state.tasks.push({ type: 'after_damage', damage: task });
        break;
      }
      case 'after_damage': {
        const actor = player(state, task.damage.seatId);
        if (actor.alive && actor.hp > 0) {
          // A lost Duel finishes damage/rescue first. Surviving Suzy replenishes
          // before Gringo takes a card; a dying Suzy cannot draw a rescue Beer.
          suzy(state, random);
          if (actor.characterId === 'bart_cassidy')
            drawTo(state, actor, task.damage.amount, random);
          else if (
            actor.characterId === 'el_gringo' &&
            task.damage.sourceSeatId !== null &&
            task.damage.sourceSeatId !== actor.seatId
          ) {
            const source = player(state, task.damage.sourceSeatId);
            for (let index = 0; index < task.damage.amount && source.hand.length > 0; index++) {
              actor.hand.push(source.hand.splice(randomInt(random, source.hand.length), 1)[0]!);
              suzy(state, random);
            }
          }
        }
        break;
      }
      case 'kill_consequences': {
        if (task.sourceSeatId === null || task.sourceSeatId === task.seatId) break;
        const victim = player(state, task.seatId),
          source = player(state, task.sourceSeatId);
        if (!source.alive) break;
        if (victim.role === 'outlaw') drawTo(state, source, 3, random);
        else if (source.role === 'sheriff' && victim.role === 'deputy') {
          const count = source.hand.length + source.equipment.length;
          if (count > 1)
            state.pending = newDecision(state, {
              kind: 'elimination_discard',
              ownerSeatId: source.seatId,
              count,
              includeEquipment: true,
            });
          else {
            discard(state, source, [...source.hand, ...source.equipment]);
            source.hand = [];
            source.equipment = [];
            suzy(state, random);
          }
        }
        break;
      }
    }
  }
}
