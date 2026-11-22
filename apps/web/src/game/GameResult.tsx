import type { GameView } from '@bang/contracts';
import { SaloonLayout } from '../SaloonLayout.js';
import { characters, roles } from './copy.js';
import { displayedRole } from './table-model.js';

const winners = {
  sheriff_deputies: 'Победа шерифа и помощников',
  outlaws: 'Победа бандитов',
  renegade: 'Победа ренегата',
} as const;

function turnsLabel(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} ход`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} хода`;
  return `${count} ходов`;
}

/** Terminal result. Roles are shown only where the projection or outcome made them public. */
export function GameResult({ game }: { game: GameView }) {
  const outcome = game.outcome;
  const finished = outcome?.status === 'finished';
  const winnerIds = finished ? outcome.winnerSeatIds : [];
  const title = finished ? winners[outcome.winner] : 'Партия завершена без победителя';
  const lead = finished
    ? winnerIds
        .map((id) => game.players.find((player) => player.seatId === id)?.name ?? 'Игрок')
        .join(', ')
    : 'Хозяин комнаты остановил партию.';
  const ordered = [...game.players].sort(
    (a, b) =>
      Number(winnerIds.includes(b.seatId)) - Number(winnerIds.includes(a.seatId)) ||
      a.seatIndex - b.seatIndex,
  );
  return (
    <SaloonLayout variant="result" eyebrow="Итог партии" title={title} lead={lead}>
      <p className="room-line">
        Комната {game.roomCode} · {turnsLabel(game.turn.number)}
      </p>
      <ol className="result-list" aria-label="Игроки и роли">
        {ordered.map((player) => {
          const role = displayedRole(game, player);
          const won = winnerIds.includes(player.seatId);
          const side =
            role === 'sheriff' || role === 'deputy'
              ? 'law'
              : role === 'renegade'
                ? 'renegade'
                : role === 'outlaw'
                  ? 'outlaw'
                  : 'unknown';
          return (
            <li key={player.seatId} className={`result-row${won ? ' result-row--won' : ''}`}>
              <span className="result-star">
                {won && <img src="/icons/star-fill.svg" alt="Победитель" width="18" height="18" />}
              </span>
              <span className="result-who">
                <b>
                  {player.name}
                  {player.seatId === game.ownSeatId && <span className="result-you"> · вы</span>}
                </b>
                <span>
                  {characters[player.characterId].name} · {player.alive ? 'в живых' : 'выбыл'}
                </span>
              </span>
              <span className={`role-pill role-pill--${side}`}>
                {role ? roles[role].name : 'Роль скрыта'}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="hint">Для следующей партии создайте новую комнату.</p>
      <a className="button button--primary" href="/">
        На главную
      </a>
    </SaloonLayout>
  );
}
