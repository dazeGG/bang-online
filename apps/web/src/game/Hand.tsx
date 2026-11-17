import type { CardInstance, GameActionOption } from '@bang/contracts';
import { cardLabel, cards, equipmentKinds, suits } from './copy.js';

export function CardButton({
  card,
  onClick,
  available = false,
}: {
  card: CardInstance;
  onClick: () => void;
  available?: boolean;
}) {
  return (
    <button
      type="button"
      className={`playing-card${equipmentKinds.has(card.kind) ? ' playing-card--blue' : ''}${available ? ' playing-card--available' : ''}`}
      aria-label={`${cardLabel(card)}. Подробнее${available ? ', доступно действие' : ''}`}
      onClick={onClick}
    >
      <span
        className={`card-corner${card.suit === 'hearts' || card.suit === 'diamonds' ? ' card-corner--red' : ''}`}
      >
        {card.rank}
        {suits[card.suit]}
      </span>
      <strong>{cards[card.kind].name}</strong>
      <span className="card-bottom">{available ? 'Выбрать действие' : 'Подробнее'}</span>
    </button>
  );
}

export function Hand({
  hand,
  actions,
  onCard,
}: {
  hand: readonly CardInstance[];
  actions: readonly GameActionOption[];
  onCard: (card: CardInstance) => void;
}) {
  return (
    <section className="hand-section" aria-labelledby="hand-title">
      <h2 id="hand-title">
        Ваша рука <span className="hint">{hand.length}</span>
      </h2>
      <div className="hand-cards">
        {hand.map((card) => (
          <CardButton
            key={card.id}
            card={card}
            onClick={() => onCard(card)}
            available={actions.some(
              (action) =>
                (action.intent.type === 'play' ||
                  (action.intent.type === 'respond' && action.intent.method === 'card')) &&
                action.intent.cardId === card.id,
            )}
          />
        ))}
      </div>
      {hand.length === 0 && <p className="hint">В руке нет карт.</p>}
    </section>
  );
}
