import { useId, useState } from 'react';
import type { CardInstance, GameActionOption, GameIntent, GameView } from '@bang/contracts';
import { cardLabel } from './copy.js';
import { selectedIntent } from './command-state.js';

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
            className="button"
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
  return card ? `${action.label} · ${cardLabel(card)}` : action.label;
}

function SelectionAction({
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
        <button className="button" type="submit" disabled={disabled || !intent}>
          Подтвердить выбор
        </button>
      </fieldset>
    </form>
  );
}

const decisions: Record<NonNullable<GameView['pending']>['kind'], string> = {
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

export function DecisionPanel({
  game,
  disabled,
  onAction,
}: {
  game: GameView;
  disabled: boolean;
  onAction: (intent: GameIntent) => void;
}) {
  const pending = game.pending;
  const actor = game.players.find((player) => player.seatId === pending?.ownerSeatId);
  const source = game.players.find((player) => player.seatId === pending?.sourceSeatId);
  const own = pending?.ownerSeatId === game.ownSeatId;
  const actions = game.actions.filter((action) => action.intent.type !== 'play');
  return (
    <section className="decision-panel" aria-labelledby="decision-title">
      <h2 id="decision-title">
        {own && pending
          ? decisions[pending.kind]
          : actor
            ? `Ждём: ${actor.name}`
            : 'Разрешаем эффект'}
      </h2>
      {pending?.sourceCard && (
        <p>
          {cardLabel(pending.sourceCard)}
          {source ? ` · ${source.name}` : ''}
        </p>
      )}
      {pending?.requiredResponses !== undefined && own && (
        <p>Осталось эффектов защиты: {pending.requiredResponses}.</p>
      )}
      {own && pending?.kind === 'turn' && game.turn.phase === 'play' && (
        <p>Выберите карту в руке или завершите ход.</p>
      )}
      <ActionChoices
        actions={actions}
        disabled={disabled}
        onAction={onAction}
        hand={game.ownHand}
      />
    </section>
  );
}
