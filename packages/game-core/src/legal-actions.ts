import type { GameActionOption, GameIntent } from './api.js';
import type { CardKind } from './catalog.js';
import type { DefenseDecision, MatchState, PlayerState } from './model.js';
import {
  distance,
  hasEquipment,
  isEquipment,
  living,
  matchesResponse,
  player,
  range,
  WEAPON_RANGE,
} from './mechanics.js';

const names: Record<CardKind, string> = {
  bang: 'Бэнг!',
  missed: 'Мимо!',
  beer: 'Пиво',
  saloon: 'Салун',
  panic: 'Паника!',
  cat_balou: 'Красотка Кэт',
  duel: 'Дуэль',
  general_store: 'Магазин',
  gatling: 'Гатлинг',
  indians: 'Индейцы!',
  stagecoach: 'Дилижанс',
  wells_fargo: 'Уэллс Фарго',
  barrel: 'Бочка',
  dynamite: 'Динамит',
  jail: 'Тюрьма',
  mustang: 'Мустанг',
  scope: 'Прицел',
  volcanic: 'Вулканик',
  schofield: 'Скофилд',
  remington: 'Ремингтон',
  rev_carabine: 'Карабин',
  winchester: 'Винчестер',
};
function option(label: string, intent: GameIntent): GameActionOption {
  return { id: JSON.stringify(intent), label, intent };
}
export function defenseActions(actor: PlayerState, defense: DefenseDecision): GameActionOption[] {
  const actions: GameActionOption[] = actor.hand
    .filter((card) => matchesResponse(actor, card, defense.requirement))
    .map((card) =>
      option(`${names[card.kind]} — ответить`, {
        type: 'respond',
        decisionId: defense.id,
        method: 'card',
        cardId: card.id,
      }),
    );
  if (defense.requirement === 'missed') {
    if (hasEquipment(actor, 'barrel') && !defense.barrelUsed)
      actions.push(
        option('Проверить «Бочку»', { type: 'respond', decisionId: defense.id, method: 'barrel' }),
      );
    if (actor.characterId === 'jourdonnais' && !defense.innateUsed)
      actions.push(
        option('Проверить способность Джордонне', {
          type: 'respond',
          decisionId: defense.id,
          method: 'innate',
        }),
      );
  }
  actions.push(
    option('Принять урон', { type: 'respond', decisionId: defense.id, method: 'decline' }),
  );
  return actions;
}

function playActions(state: MatchState, actor: PlayerState): GameActionOption[] {
  const actions: GameActionOption[] = [];
  for (const card of actor.hand) {
    const base = { type: 'play', cardId: card.id } as const;
    if (
      card.kind === 'bang' ||
      (card.kind === 'missed' && actor.characterId === 'calamity_janet')
    ) {
      if (
        state.turn.bangsPlayed > 0 &&
        actor.characterId !== 'willy_the_kid' &&
        !hasEquipment(actor, 'volcanic')
      )
        continue;
      for (const target of living(state))
        if (
          target.seatId !== actor.seatId &&
          distance(state, actor.seatId, target.seatId) <= range(actor)
        ) {
          actions.push(option(`Бэнг! → ${target.name}`, { ...base, targetSeatId: target.seatId }));
        }
    } else if (card.kind === 'duel') {
      for (const target of living(state))
        if (target.seatId !== actor.seatId)
          actions.push(option(`Дуэль → ${target.name}`, { ...base, targetSeatId: target.seatId }));
    } else if (card.kind === 'panic' || card.kind === 'cat_balou') {
      for (const target of living(state)) {
        if (card.kind === 'panic' && distance(state, actor.seatId, target.seatId) > 1) continue;
        if (
          target.hand.some((entry) => entry.id !== card.id) ||
          (target.seatId === actor.seatId && actor.characterId === 'suzy_lafayette')
        ) {
          actions.push(
            option(`${names[card.kind]} → ${target.name}: рука`, {
              ...base,
              targetSeatId: target.seatId,
              zone: 'hand',
            }),
          );
        }
        for (const equipment of target.equipment)
          actions.push(
            option(`${names[card.kind]} → ${target.name}: ${names[equipment.kind]}`, {
              ...base,
              targetSeatId: target.seatId,
              zone: 'equipment',
              targetCardId: equipment.id,
            }),
          );
      }
    } else if (card.kind === 'jail') {
      for (const target of living(state))
        if (
          target.seatId !== actor.seatId &&
          target.role !== 'sheriff' &&
          !hasEquipment(target, 'jail')
        ) {
          actions.push(option(`Тюрьма → ${target.name}`, { ...base, targetSeatId: target.seatId }));
        }
    } else if (isEquipment(card.kind)) {
      if (!hasEquipment(actor, card.kind))
        actions.push(option(`Выложить: ${names[card.kind]}`, base));
    } else if (card.kind !== 'missed') actions.push(option(`Сыграть: ${names[card.kind]}`, base));
  }
  actions.push(option('Закончить ход', { type: 'end_turn' }));
  return actions;
}

export function legalActions(state: MatchState, seatId: string): GameActionOption[] {
  if (state.status !== 'active') return [];
  const actor = player(state, seatId);
  const actions: GameActionOption[] = [];
  const pending = state.pending;
  if (pending?.ownerSeatId === seatId) {
    if (pending.kind === 'turn' || pending.kind === 'draw_choice') {
      if (state.turn.phase === 'draw') {
        actions.push(option('Взять карты из колоды', { type: 'draw', source: 'deck' }));
        if (actor.characterId === 'pedro_ramirez' && state.discard.length > 0)
          actions.push(option('Первая карта из сброса', { type: 'draw', source: 'discard' }));
        if (actor.characterId === 'jesse_jones')
          for (const target of living(state)) {
            if (target.seatId !== actor.seatId && target.hand.length > 0)
              actions.push(
                option(`Первая карта из руки: ${target.name}`, {
                  type: 'draw',
                  source: 'opponent',
                  targetSeatId: target.seatId,
                }),
              );
          }
      } else if (state.turn.phase === 'play') actions.push(...playActions(state, actor));
    } else if (
      pending.kind === 'defend' ||
      pending.kind === 'mass_response' ||
      pending.kind === 'duel'
    )
      actions.push(...defenseActions(actor, pending));
    else if (pending.kind === 'rescue') {
      if (living(state).length > 2)
        for (const card of actor.hand)
          if (card.kind === 'beer')
            actions.push(
              option('Пиво: спастись', {
                type: 'respond',
                decisionId: pending.id,
                method: 'card',
                cardId: card.id,
              }),
            );
      actions.push(
        option('Не спасаться', { type: 'respond', decisionId: pending.id, method: 'decline' }),
      );
    } else {
      let cards = 'cards' in pending ? pending.cards : [];
      let count = 1;
      let label = 'Взять карту';
      switch (pending.kind) {
        case 'turn_discard':
          cards = actor.hand;
          count = Math.max(0, actor.hand.length - actor.hp);
          label = 'Сбросить лишние карты';
          break;
        case 'elimination_discard':
          cards = [...actor.hand, ...actor.equipment];
          count = cards.length;
          label = 'Сбросить карты в выбранном порядке';
          break;
        case 'kit_carlson':
          count = 2;
          label = 'Оставить две карты';
          break;
        case 'lucky_duke':
          label = 'Выбрать результат проверки';
          break;
      }
      actions.push({
        ...option(label, { type: 'choose', decisionId: pending.id, cardIds: [] }),
        selection: {
          cards,
          min: count,
          max: count,
          ordered:
            pending.kind === 'turn_discard' ||
            pending.kind === 'elimination_discard' ||
            pending.kind === 'kit_carlson',
        },
      });
    }
  }
  if (
    actor.alive &&
    actor.characterId === 'sid_ketchum' &&
    actor.hp < actor.maxHp &&
    actor.hand.length >= 2
  ) {
    actions.push({
      ...option('Сид: сбросить две карты и восстановить жизнь', {
        type: 'sid_heal',
        cardIds: ['', ''],
      }),
      selection: { cards: actor.hand, min: 2, max: 2, ordered: true },
    });
  }
  return actions;
}

export function permits(action: GameActionOption, intent: GameIntent): boolean {
  if (action.intent.type !== intent.type) return false;
  if (!action.selection) {
    const expected = action.intent as unknown as Record<string, unknown>;
    const actual = intent as unknown as Record<string, unknown>;
    return (
      Object.keys(expected).length === Object.keys(actual).length &&
      Object.entries(expected).every(([key, value]) => actual[key] === value)
    );
  }
  if (intent.type !== 'choose' && intent.type !== 'sid_heal') return false;
  const keys = Object.keys(intent);
  if (
    keys.length !== (intent.type === 'choose' ? 3 : 2) ||
    keys.some(
      (key) =>
        !['type', 'cardIds', ...(intent.type === 'choose' ? ['decisionId'] : [])].includes(key),
    )
  )
    return false;
  if (
    intent.type === 'choose' &&
    (action.intent.type !== 'choose' || action.intent.decisionId !== intent.decisionId)
  )
    return false;
  const ids = intent.cardIds;
  return (
    Array.isArray(ids) &&
    ids.length >= action.selection.min &&
    ids.length <= action.selection.max &&
    new Set(ids).size === ids.length &&
    ids.every((id) => action.selection!.cards.some((card) => card.id === id))
  );
}

export function isWeapon(kind: CardKind): boolean {
  return WEAPON_RANGE[kind] !== undefined;
}
