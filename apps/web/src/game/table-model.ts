import type {
  CardInstance,
  CardKind,
  GameActionOption,
  GameIntent,
  GameView,
  PublicPlayerView,
} from '@bang/contracts';
import { cardLabel, cards } from './copy.js';

/**
 * Display-only table geometry derived from the public projection. The server still
 * decides every legal target; these values only explain the table to the viewer.
 */
const WEAPON_RANGE: Partial<Record<CardKind, number>> = {
  volcanic: 1,
  schofield: 2,
  remington: 3,
  rev_carabine: 4,
  winchester: 5,
};

export function weaponRange(player: PublicPlayerView): number {
  return player.equipment.reduce((current, card) => WEAPON_RANGE[card.kind] ?? current, 1);
}

/** Mirrors the core distance rule over living seats in seat order. */
export function seatDistance(game: GameView, fromId: string, toId: string): number | null {
  if (fromId === toId) return 0;
  const living = game.players.filter((player) => player.alive);
  const from = living.findIndex((player) => player.seatId === fromId);
  const to = living.findIndex((player) => player.seatId === toId);
  if (from < 0 || to < 0) return null;
  const actor = living[from]!;
  const target = living[to]!;
  const has = (player: PublicPlayerView, kind: CardKind) =>
    player.equipment.some((card) => card.kind === kind);
  const raw = Math.abs(from - to);
  return Math.max(
    1,
    Math.min(raw, living.length - raw) +
      Number(has(target, 'mustang')) +
      Number(target.characterId === 'paul_regret') -
      Number(has(actor, 'scope')) -
      Number(actor.characterId === 'rose_doolan'),
  );
}

/** The viewer first, then everyone else clockwise starting after the viewer. */
export function seatsAroundViewer(game: GameView): {
  me: PublicPlayerView;
  opponents: PublicPlayerView[];
} {
  const ordered = [...game.players].sort((a, b) => a.seatIndex - b.seatIndex);
  const index = ordered.findIndex((player) => player.seatId === game.ownSeatId);
  const me = ordered[index]!;
  return { me, opponents: [...ordered.slice(index + 1), ...ordered.slice(0, index)] };
}

export const RESPONSE_KINDS = new Set(['defend', 'duel', 'mass_response']);

export function isOwnMove(game: GameView): boolean {
  return (
    game.status === 'active' &&
    (game.pending?.ownerSeatId === game.ownSeatId || game.preparation !== null)
  );
}

export function cardActions(game: GameView, cardId: string): GameActionOption[] {
  return game.actions.filter(
    (action) =>
      (action.intent.type === 'play' ||
        (action.intent.type === 'respond' && action.intent.method === 'card')) &&
      action.intent.cardId === cardId,
  );
}

/** Actions shown in the right-hand column: everything not started from a hand card. */
export function columnActions(game: GameView): GameActionOption[] {
  return game.actions.filter((action) => action.intent.type !== 'play');
}

/** Free checks first, then the first real response; declining and Sid stay secondary. */
export function primaryActionId(actions: readonly GameActionOption[]): string | null {
  const free = actions.find(
    (action) =>
      action.intent.type === 'respond' &&
      (action.intent.method === 'barrel' || action.intent.method === 'innate'),
  );
  if (free) return free.id;
  const main = actions.find(
    (action) =>
      action.intent.type !== 'sid_heal' &&
      !(action.intent.type === 'respond' && action.intent.method === 'decline'),
  );
  return (main ?? actions.find((action) => action.intent.type !== 'sid_heal'))?.id ?? null;
}

export function actionTargetNote(
  intent: GameIntent,
  game: GameView,
  distance: number | null,
): string {
  if (intent.type !== 'play') return '';
  if (intent.zone === 'hand') return 'карта из руки вслепую';
  if (intent.zone === 'equipment') {
    const target = game.players.find((player) => player.seatId === intent.targetSeatId);
    const card = target?.equipment.find((entry) => entry.id === intent.targetCardId);
    return card ? cardLabel(card) : 'карта со стола';
  }
  return distance === null || distance === 0 ? 'вы' : `расстояние ${distance}`;
}

export type SeatRibbon = { text: string; tone: 'turn' | 'danger' | 'out' } | null;

export function seatRibbon(game: GameView, player: PublicPlayerView): SeatRibbon {
  if (!player.alive) return { text: 'Выбыл', tone: 'out' };
  if (game.status !== 'active') return null;
  const pending = game.pending;
  if (
    pending &&
    pending.ownerSeatId === game.ownSeatId &&
    pending.sourceSeatId === player.seatId &&
    player.seatId !== game.ownSeatId &&
    RESPONSE_KINDS.has(pending.kind)
  ) {
    const text =
      pending.kind === 'duel'
        ? 'Дуэль с вами'
        : pending.kind === 'defend'
          ? 'Стреляет в вас'
          : 'Атакует';
    return { text, tone: 'danger' };
  }
  if (pending?.ownerSeatId === player.seatId) {
    return {
      text: pending.kind === 'turn' || pending.kind === 'draw_choice' ? 'Ходит' : 'Отвечает',
      tone: 'turn',
    };
  }
  if (game.turn.seatId === player.seatId) return { text: 'Ходит', tone: 'turn' };
  return null;
}

export function ownRibbon(game: GameView, me: PublicPlayerView): SeatRibbon {
  if (!me.alive) return { text: 'Выбыл', tone: 'out' };
  const pending = game.pending;
  if (game.status !== 'active' || pending?.ownerSeatId !== me.seatId) return null;
  if (pending.kind === 'turn' || pending.kind === 'draw_choice')
    return { text: 'Ваш ход', tone: 'turn' };
  if (RESPONSE_KINDS.has(pending.kind)) return { text: 'Под атакой', tone: 'danger' };
  return { text: 'Ваше действие', tone: 'turn' };
}

const responseNeed = (game: GameView): string => {
  const kind = game.pending?.kind;
  if (kind === 'duel') return '«Бэнг!»';
  if (kind === 'mass_response') return game.massEffect?.kind === 'indians' ? '«Бэнг!»' : '«Мимо!»';
  return '«Мимо!»';
};

export interface TablePrompt {
  mine: boolean;
  eyebrow: string;
  title: string;
  sub: string;
}

const ownTitles: Record<NonNullable<GameView['pending']>['kind'], string> = {
  turn: 'Ваш ход',
  defend: 'Защититесь от выстрела',
  duel: 'Ответьте на дуэль',
  mass_response: 'Ваш ответ на массовую атаку',
  general_store: 'Выберите карту из магазина',
  kit_carlson: 'Оставьте две карты',
  lucky_duke: 'Выберите результат проверки',
  draw_choice: 'Выберите источник добора',
  target_card: 'Выберите карту',
  rescue: 'Спаситесь или подтвердите выбывание',
  elimination_discard: 'Выберите порядок сброса карт',
  turn_discard: 'Сбросьте лишние карты',
};

/** Mirrors the server: an eliminated player's discard is settled after one minute. */
export const AUTO_DISCARD_NOTE = 'Через минуту без выбора карты сбросятся автоматически.';
export function autoDiscards(game: GameView): boolean {
  const pending = game.pending;
  return (
    pending?.kind === 'elimination_discard' &&
    game.players.find((entry) => entry.seatId === pending.ownerSeatId)?.alive === false
  );
}

export function tablePrompt(game: GameView): TablePrompt {
  const pending = game.pending;
  const name = (seatId: string | undefined) =>
    game.players.find((player) => player.seatId === seatId)?.name ?? 'игрок';
  if (!pending) return { mine: false, eyebrow: 'Ожидание', title: 'Разрешаем эффект', sub: '' };
  const me = game.players.find((player) => player.seatId === game.ownSeatId);
  const source = name(pending.sourceSeatId);
  const required = pending.requiredResponses ?? 1;
  if (pending.ownerSeatId === game.ownSeatId) {
    const subs: Partial<Record<typeof pending.kind, string>> = {
      turn:
        game.turn.phase === 'draw'
          ? 'Возьмите карты, чтобы начать ход.'
          : 'Выберите карту в руке или завершите ход.',
      draw_choice: 'Первую карту можно взять по способности персонажа.',
      defend: `${source} стреляет в вас. Нужно эффектов ${responseNeed(game)}: ${required}.`,
      duel:
        pending.sourceSeatId === game.ownSeatId
          ? `Ваша дуэль продолжается. Сбросьте ${responseNeed(game)} или потеряйте жизнь.`
          : `${source} вызвал вас на дуэль. Сбросьте ${responseNeed(game)} или потеряйте жизнь.`,
      mass_response: `${source}: ${game.massEffect?.kind === 'indians' ? '«Индейцы!»' : '«Гатлинг»'}. Нужно ${responseNeed(game)}.`,
      general_store: 'Открытые карты лежат в центре стола.',
      kit_carlson: 'Третья карта вернётся наверх колоды.',
      lucky_duke: 'Обе карты уйдут в сброс.',
      rescue: 'Жизни закончились. Спасите себя, если есть чем.',
      turn_discard: `Лимит руки — ${me?.hp ?? 0}.`,
      elimination_discard: autoDiscards(game)
        ? `Карты уйдут в сброс в выбранном порядке. ${AUTO_DISCARD_NOTE}`
        : 'Карты уйдут в сброс в выбранном порядке.',
    };
    return {
      mine: true,
      eyebrow: 'Ваше действие',
      title: ownTitles[pending.kind],
      sub: subs[pending.kind] ?? '',
    };
  }
  const owner = name(pending.ownerSeatId);
  const unlimited = 'Время не ограничено.';
  if (pending.kind === 'turn' || pending.kind === 'draw_choice')
    return {
      mine: false,
      eyebrow: 'Ожидание',
      title: `Ходит ${owner}`,
      sub: `Розыгрыш карт. ${unlimited}`,
    };
  const subs: Partial<Record<typeof pending.kind, string>> = {
    defend: `${owner} отвечает на выстрел.`,
    duel: 'Дуэль продолжается.',
    mass_response: 'Массовая атака: ответы по часовой стрелке.',
    general_store: `${owner} выбирает карту из магазина.`,
    kit_carlson: `${owner} выбирает карты.`,
    lucky_duke: `${owner} выбирает результат проверки.`,
    rescue: `${owner} решает, спасаться ли.`,
    turn_discard: `${owner} сбрасывает лишние карты.`,
    elimination_discard: `${owner} сбрасывает карты.`,
  };
  if (autoDiscards(game))
    return {
      mine: false,
      eyebrow: 'Ожидание',
      title: `Ждём: ${owner}`,
      sub: `${subs.elimination_discard} ${AUTO_DISCARD_NOTE}`,
    };
  return {
    mine: false,
    eyebrow: 'Ожидание',
    title: `Ждём: ${owner}`,
    sub: `${subs[pending.kind] ?? ''} ${unlimited}`.trim(),
  };
}

/** Public team information, including what a finished outcome implies. */
export function displayedRole(game: GameView, player: PublicPlayerView): PublicPlayerView['role'] {
  if (player.role) return player.role;
  if (player.seatId === game.ownSeatId) return game.ownRole;
  const outcome = game.outcome;
  if (outcome?.status === 'finished' && outcome.winnerSeatIds.includes(player.seatId)) {
    if (outcome.winner === 'outlaws') return 'outlaw';
    if (outcome.winner === 'renegade') return 'renegade';
    return 'deputy';
  }
  return null;
}

export function cardName(card: CardInstance): string {
  return cards[card.kind].name;
}
