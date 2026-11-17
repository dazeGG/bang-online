import type { CardInstance, GameView, PublicPlayerView } from '@bang/contracts';
import { cardLabel, characters, roles } from './copy.js';

export function PlayerBoard({
  player,
  game,
  onCard,
  onCharacter,
}: {
  player: PublicPlayerView;
  game: GameView;
  onCard: (card: CardInstance) => void;
  onCharacter: (player: PublicPlayerView) => void;
}) {
  const current = game.status === 'active' && game.pending?.ownerSeatId === player.seatId;
  const connected = game.presence.find((presence) => presence.seatId === player.seatId)?.connected;
  return (
    <li
      className={`player-board${current ? ' player-board--current' : ''}${!player.alive ? ' player-board--out' : ''}`}
    >
      <div className="player-board-head">
        <h3>
          {player.name}
          {player.seatId === game.ownSeatId && <span className="hint"> · вы</span>}
        </h3>
        {current && (
          <span className="current-badge">
            {player.seatId === game.ownSeatId ? 'Ваше действие' : 'Действует'}
          </span>
        )}
      </div>
      <button type="button" className="character-link" onClick={() => onCharacter(player)}>
        {characters[player.characterId].name}
      </button>
      <p className="player-life">
        {player.alive ? `♥ ${player.hp} / ${player.maxHp}` : 'Выбыл'}{' '}
        <span className="hint">· карт: {player.handCount}</span>
      </p>
      <p className="player-role">
        {player.role ? roles[player.role].name : 'Роль скрыта'}
        {!connected && ' · не в сети'}
      </p>
      {player.equipment.length > 0 && (
        <ul className="equipment-list" aria-label={`Снаряжение: ${player.name}`}>
          {player.equipment.map((card) => (
            <li key={card.id}>
              <button type="button" onClick={() => onCard(card)}>
                {cardLabel(card)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
