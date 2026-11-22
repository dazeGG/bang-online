import { useId, useState, type ReactNode } from 'react';
import type { CardInstance, GameActionOption, GameIntent, GameView } from '@bang/contracts';
import { cardLabel, cards } from './copy.js';
import { selectedIntent } from './command-state.js';
import { columnActions, primaryActionId, tablePrompt } from './table-model.js';

export function ActionChoices({
  actions,
  disabled,
  onAction,
  hand = [],
}: {
  actions: readonly GameActionOption[];
  disabled: boolean;
  onAction: (intent: GameIntent) => void;
  hand?: readonly CardInstance[];
}) {
  return (
    <div className="game-actions">
      {actions.map((action) =>
        action.selection ? (
          <SelectionAction
            key={action.id}
            action={action}
            disabled={disabled}
            onAction={onAction}
          />
        ) : (
          <button
            key={action.id}
            className="button button--primary"
            type="button"
            disabled={disabled}
            onClick={() => onAction(action.intent)}
          >
            {responseLabel(action, hand)}
          </button>
        ),
      )}
    </div>
  );
}

function responseLabel(action: GameActionOption, hand: readonly CardInstance[]) {
  const intent = action.intent;
  const card =
    intent.type === 'respond' && intent.method === 'card'
      ? hand.find((candidate) => candidate.id === intent.cardId)
      : undefined;
  if (!card) return action.label;
  // Server labels for defense cards already start with the card name.
  return action.label.startsWith(cards[card.kind].name)
    ? `Ответить: ${cardLabel(card)}`
    : `${action.label} · ${cardLabel(card)}`;
}

export function SelectionAction({
  action,
  disabled,
  onAction,
}: {
  action: GameActionOption;
  disabled: boolean;
  onAction: (intent: GameIntent) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const id = useId();
  const selection = action.selection!;
  const validIds = selected.filter((cardId) => selection.cards.some((card) => card.id === cardId));
  const intent = selectedIntent(action, validIds);
  return (
    <form
      className="card-selection"
      method="post"
      action="#"
      aria-labelledby={`${id}-title`}
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled && intent) {
          onAction(intent);
          setSelected([]);
        }
      }}
    >
      <fieldset disabled={disabled}>
        <legend id={`${id}-title`}>{action.label}</legend>
        <p className="hint">
          {selection.min === selection.max
            ? `Выберите ${selection.min}`
            : `Выберите от ${selection.min} до ${selection.max}`}
          .{selection.ordered && ' Нажимайте в нужном порядке. Номер показывает порядок выбора.'}
        </p>
        <div className="selection-cards">
          {selection.cards.map((card, index) => {
            const position = validIds.indexOf(card.id);
            return (
              <label
                key={card.id}
                htmlFor={`${id}-${index}`}
                className={`selection-card${position >= 0 ? ' selection-card--selected' : ''}`}
              >
                <input
                  id={`${id}-${index}`}
                  name="cards"
                  type="checkbox"
                  checked={position >= 0}
                  onChange={(event) => {
                    setSelected(
                      event.target.checked
                        ? [...validIds, card.id]
                        : validIds.filter((cardId) => cardId !== card.id),
                    );
                  }}
                />
                <span>
                  {cardLabel(card)}
                  {selection.ordered && position >= 0 ? ` · ${position + 1}` : ''}
                </span>
              </label>
            );
          })}
        </div>
        <p className="selection-count">
          Выбрано: {validIds.length}
          {selection.ordered && validIds.length > 0 && (
            <button type="button" className="button" onClick={() => setSelected([])}>
              Начать выбор заново
            </button>
          )}
        </p>
        <button className="button button--primary" type="submit" disabled={disabled || !intent}>
          Подтвердить выбор
        </button>
      </fieldset>
    </form>
  );
}

/**
 * Right-hand action column. Hand cards carry their own play actions; this column holds
 * every other server-derived choice. Card selections open in a dialog when `onSelect`
 * is supplied so the table stays visible on small screens.
 */
export function DecisionPanel({
  game,
  disabled,
  onAction,
  onSelect,
  hint,
  children,
}: {
  game: GameView;
  disabled: boolean;
  onAction: (intent: GameIntent) => void;
  onSelect?: (action: GameActionOption) => void;
  hint?: string | undefined;
  children?: ReactNode;
}) {
  const available = columnActions(game);
  const primary = primaryActionId(available);
  // The dominant action comes first, as in the design.
  const actions = [
    ...available.filter((action) => action.id === primary),
    ...available.filter((action) => action.id !== primary),
  ];
  const prompt = tablePrompt(game);
  return (
    <section className="action-column" aria-labelledby="decision-title">
      <h2 id="decision-title" className="visually-hidden">
        {prompt.title}
      </h2>
      {hint && <p className="action-hint">{hint}</p>}
      {children}
      {actions.map((action) => {
        const tone = action.id === primary ? 'button--primary' : 'button--secondary';
        if (action.selection && !onSelect)
          return (
            <SelectionAction
              key={action.id}
              action={action}
              disabled={disabled}
              onAction={onAction}
            />
          );
        return (
          <button
            key={action.id}
            className={`button ${tone}`}
            type="button"
            disabled={disabled}
            onClick={() => (action.selection ? onSelect?.(action) : onAction(action.intent))}
          >
            {action.selection ? `${action.label}…` : responseLabel(action, game.ownHand)}
          </button>
        );
      })}
    </section>
  );
}
