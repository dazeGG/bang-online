import type { CSSProperties } from 'react';
import type { CardInstance, GameView, PublicPlayerView } from '@bang/contracts';
import { cardLabel, cards, characters, roles } from './copy.js';
import { seatRibbon, type SeatRibbon, weaponRange } from './table-model.js';

const RANGE_KINDS = new Set(['volcanic', 'schofield', 'remington', 'rev_carabine', 'winchester']);
/** Short weapon names for phone-sized seats. */
const SHORT_NAMES: Partial<Record<CardInstance['kind'], string>> = {
  volcanic: 'Вулк.',
  schofield: 'Скоф.',
  remington: 'Рем.',
  rev_carabine: 'Кар.',
  winchester: 'Винч.',
};
const dangerFirst = (card: CardInstance) =>
  card.kind === 'jail' || card.kind === 'dynamite' ? 0 : 1;

export function EquipmentChips({
  player,
  onCard,
  compact = false,
}: {
  player: PublicPlayerView;
  onCard: (card: CardInstance) => void;
  compact?: boolean;
}) {
  if (player.equipment.length === 0) return null;
  return (
    <ul className="chips" aria-label={`Снаряжение: ${player.name}`}>
      {[...player.equipment]
        .sort((a, b) => dangerFirst(a) - dangerFirst(b))
        .map((card) => (
          <li key={card.id}>
            <button
              type="button"
              className={`chip${card.kind === 'jail' || card.kind === 'dynamite' ? ' chip--danger' : ''}`}
              aria-label={`${cardLabel(card)}. Подробнее`}
              onClick={() => onCard(card)}
            >
              {(compact && SHORT_NAMES[card.kind]) || cards[card.kind].name}
              {RANGE_KINDS.has(card.kind)
                ? ` · ${weaponRange({ ...player, equipment: [card] })}`
                : ''}
            </button>
          </li>
        ))}
    </ul>
  );
}

export function LifeTokens({
  hp,
  maxHp,
  large = false,
}: {
  hp: number;
  maxHp: number;
  large?: boolean;
}) {
  return (
    <span className={`life-tokens${large ? ' life-tokens--large' : ''}`} aria-hidden="true">
      {Array.from({ length: maxHp }, (_, index) => (
        <span key={index} className={index < hp ? 'token token--full' : 'token'} />
      ))}
    </span>
  );
}

export function Ribbon({ ribbon, className = '' }: { ribbon: SeatRibbon; className?: string }) {
  if (!ribbon) return null;
  return <span className={`ribbon ribbon--${ribbon.tone} ${className}`}>{ribbon.text}</span>;
}

export function PlayerBoard({
  player,
  game,
  distance,
  inReach,
  style,
  compact = false,
  onCard,
  onCharacter,
}: {
  player: PublicPlayerView;
  game: GameView;
  distance: number | null;
  inReach: boolean;
  style: CSSProperties;
  compact?: boolean;
  onCard: (card: CardInstance) => void;
  onCharacter: (player: PublicPlayerView) => void;
}) {
  const ribbon = seatRibbon(game, player);
  const connected =
    game.presence.find((presence) => presence.seatId === player.seatId)?.connected ?? true;
  const awaited = game.waitingFor.includes(player.seatId);
  const jailed = player.equipment.some((card) => card.kind === 'jail');
  const status = !player.alive
    ? player.role
      ? `Роль: ${roles[player.role].name}`
      : ''
    : !connected
      ? awaited
        ? 'не в сети — ждём'
        : 'не в сети'
      : jailed
        ? 'в тюрьме'
        : player.role === 'sheriff' && !compact
          ? 'Шериф'
          : '';
  return (
    <li
      className={`tseat${ribbon ? ` tseat--${ribbon.tone}` : ''}${!player.alive ? ' tseat--out' : ''}`}
      style={style}
    >
      <div className="tseat-card">
        <Ribbon ribbon={ribbon} className="tseat-ribbon" />
        {player.alive && distance !== null && (
          <span
            className={`distance${inReach ? ' distance--reach' : ''}`}
            title={
              inReach
                ? `Расстояние ${distance} — в зоне выстрела`
                : `Расстояние ${distance} — далеко`
            }
          >
            <span aria-hidden="true">{distance}</span>
            <span className="visually-hidden">
              {`Расстояние ${distance}${inReach ? ', в зоне выстрела' : ''}`}
            </span>
          </span>
        )}
        <div className="tseat-head">
          <span className="seal" aria-hidden="true">
            {Array.from(player.name)[0]?.toLocaleUpperCase('ru')}
          </span>
          <div className="tseat-who">
            <h3 className="tseat-name">
              <span>{player.name}</span>
              {player.role === 'sheriff' && (
                <img src="/icons/star-fill.svg" alt="Шериф" width="14" height="14" />
              )}
            </h3>
            <button type="button" className="character-link" onClick={() => onCharacter(player)}>
              {characters[player.characterId].name}
            </button>
          </div>
        </div>
        <div className="tseat-stats">
          <LifeTokens hp={player.alive ? player.hp : 0} maxHp={player.maxHp} />
          <span className="tseat-hp">
            {player.alive ? `${player.hp}/${player.maxHp}` : ''}
            <span className="visually-hidden">
              {player.alive ? ` жизней из ${player.maxHp}` : 'Выбыл'}
            </span>
          </span>
          <span className="tseat-hand" title="Карт в руке">
            <span className="mini-card" aria-hidden="true" />
            <span className="visually-hidden">Карт в руке:</span> {player.handCount}
          </span>
        </div>
        <EquipmentChips player={player} onCard={onCard} compact={compact} />
        {status && (
          <span className={`tseat-status${!connected ? ' tseat-status--alert' : ''}`}>
            {status}
          </span>
        )}
        {!player.role && <span className="visually-hidden">Роль скрыта</span>}
      </div>
    </li>
  );
}
