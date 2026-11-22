import type { CSSProperties } from 'react';
import type { CardFace, CardInstance, GameView } from '@bang/contracts';
import { cardFaces, cardLabel, cards, equipmentKinds, suits } from './copy.js';
import { cardActions, isOwnMove } from './table-model.js';
import { handFan, type TableLayout } from './table-layout.js';

const clamp = (min: number, value: number, max: number) => Math.max(min, Math.min(max, value));

/** Card face sized by its height; the name shrinks to stay on one line. */
function faceStyle(card: CardFace, height: number): CSSProperties {
  const width = Math.round(height * 0.7);
  const pad = Math.round(height * 0.055);
  const name = cards[card.kind].name;
  return {
    width,
    height,
    padding: pad,
    gap: Math.round(height * 0.035),
    borderRadius: Math.round(height * 0.06),
    ['--corner-size' as string]: `${Math.round(clamp(11, height * 0.085, 17))}px`,
    ['--name-size' as string]: `${Math.round(Math.min(clamp(12, height * 0.115, 22), (width - pad * 2 - 4) / (name.length * 0.62)))}px`,
    ['--short-size' as string]: `${Math.round(clamp(9, height * 0.068, 13))}px`,
    ['--tag-size' as string]: `${Math.round(clamp(8, height * 0.055, 11))}px`,
    ['--card-pad' as string]: `${pad}px`,
  };
}

function faceClass(card: CardFace) {
  return `card-face${equipmentKinds.has(card.kind) ? ' card-face--blue' : ''}`;
}

function FaceContent({ card }: { card: CardFace }) {
  const red = card.suit === 'hearts' || card.suit === 'diamonds';
  return (
    <>
      <span className={`card-corner${red ? ' card-corner--red' : ''}`}>
        {card.rank}
        {suits[card.suit]}
      </span>
      <strong className="card-name">{cards[card.kind].name}</strong>
      <span className="card-short">{cardFaces[card.kind].short}</span>
      <span className="card-tag">{cardFaces[card.kind].tag}</span>
    </>
  );
}

export function CardFaceView({
  card,
  height,
  className = '',
}: {
  card: CardFace;
  height: number;
  className?: string;
}) {
  return (
    <div
      className={`${faceClass(card)} ${className}`}
      style={faceStyle(card, height)}
      aria-hidden="true"
    >
      <FaceContent card={card} />
    </div>
  );
}

export function CardButton({
  card,
  onClick,
  available = false,
  height = 120,
  className = '',
}: {
  card: CardInstance;
  onClick: () => void;
  available?: boolean;
  height?: number;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`${faceClass(card)}${available ? ' card-face--available' : ''} ${className}`}
      style={faceStyle(card, height)}
      aria-label={`${cardLabel(card)}. Подробнее${available ? ', доступно действие' : ''}`}
      onClick={onClick}
    >
      <FaceContent card={card} />
    </button>
  );
}

export function HandFan({
  game,
  layout,
  onCard,
}: {
  game: GameView;
  layout: TableLayout;
  onCard: (card: CardInstance) => void;
}) {
  const hand = game.ownHand;
  const fan = handFan(layout, hand.length);
  const ownMove = isOwnMove(game);
  return (
    <section
      className="hand-fan"
      aria-labelledby="hand-title"
      style={{ paddingBottom: fan.paddingBottom }}
    >
      <h2 id="hand-title" className="visually-hidden">
        Ваша рука: {hand.length}
      </h2>
      {hand.length === 0 && <p className="hand-empty">В руке нет карт.</p>}
      {hand.map((card, index) => {
        const position = fan.cards[index]!;
        const available = cardActions(game, card.id).length > 0;
        return (
          <div
            key={card.id}
            className="hand-slot"
            style={{
              marginLeft: position.marginLeft,
              transform: `rotate(${position.rotate}deg) translateY(${position.drop}px)`,
            }}
          >
            <CardButton
              card={card}
              height={layout.cardH}
              available={available}
              className={ownMove && !available ? 'card-face--muted' : ''}
              onClick={() => onCard(card)}
            />
          </div>
        );
      })}
    </section>
  );
}
