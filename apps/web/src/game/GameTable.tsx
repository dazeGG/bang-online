import { useEffect, useEffectEvent, useState } from 'react';
import type { CardInstance, GameIntent, GameView, PublicPlayerView } from '@bang/contracts';
import { CardDetails, Modal } from './CardDetails.js';
import { ActionChoices, DecisionPanel } from './DecisionPanel.js';
import { commitPreparation, type PreparedResponse } from './command-state.js';
import { characters, resolutionText, roles } from './copy.js';
import { CardButton, Hand } from './Hand.js';
import { PlayerBoard } from './PlayerBoard.js';
import './game.css';

export function GameTable({
  game,
  disabled,
  notice,
  submitted,
  sending,
  onAction,
  onAbort,
  onSync,
  onRetry,
}: {
  game: GameView;
  disabled: boolean;
  notice: string | null;
  submitted: boolean;
  sending: boolean;
  onAction: (intent: GameIntent) => Promise<void>;
  onAbort: () => void;
  onSync: () => void;
  onRetry: () => void;
}) {
  const [detail, setDetail] = useState<CardInstance | null>(null);
  const [character, setCharacter] = useState<PublicPlayerView | null>(null);
  const [confirmAbort, setConfirmAbort] = useState(false);
  const [draft, setDraft] = useState<PreparedResponse | null>(null);
  const [preparationNotice, setPreparationNotice] = useState<string | null>(null);
  const preparation = game.preparation;
  if (
    draft &&
    (!preparation ||
      preparation.massEffectId !== draft.massEffectId ||
      preparation.guard !== draft.guard)
  ) {
    setDraft(null);
    setPreparationNotice('Доступная защита изменилась. Выберите ответ заново.');
  }
  const resolvePreparation = useEffectEvent(() => {
    const prepared = draft;
    if (!prepared) return;
    if (preparation?.isCurrent && !disabled) {
      const intent = commitPreparation(prepared, preparation, game.pending?.id);
      if (intent)
        void onAction(intent).then(() => {
          setDraft(null);
          setPreparationNotice(null);
        });
    }
  });
  useEffect(() => {
    resolvePreparation();
  }, [game.revision, game.pending?.id, preparation, disabled]);

  const me = game.players.find((player) => player.seatId === game.ownSeatId)!;
  const turn = game.players.find((player) => player.seatId === game.turn.seatId);
  const winner =
    game.outcome?.status === 'finished'
      ? (
          {
            sheriff_deputies: 'Победа шерифа и помощников',
            outlaws: 'Победа бандитов',
            renegade: 'Победа ренегата',
          } as const
        )[game.outcome.winner]
      : 'Партия завершена без победителя';
  return (
    <section className="game-table" aria-labelledby="game-title">
      <header className="game-heading">
        <div>
          <p className="eyebrow">Комната {game.roomCode}</p>
          <h1 id="game-title">
            {game.status === 'active'
              ? `Ход ${game.turn.number}`
              : game.status === 'aborted'
                ? 'Партия завершена'
                : 'Итог партии'}
          </h1>
        </div>
        <button className="button" type="button" onClick={onSync}>
          Обновить стол
        </button>
      </header>
      {notice && (
        <p className="form-error game-notice" role="alert">
          {notice}
        </p>
      )}
      {submitted && (
        <p className="notice" role="status">
          {sending ? 'Подтверждаем действие…' : 'Действие сохранено. Ждём подтверждения.'}
          <button className="button" type="button" disabled={sending} onClick={onRetry}>
            Повторить запрос
          </button>
        </p>
      )}
      {game.waitingFor.length > 0 && (
        <p className="notice" role="status">
          Ждём возвращения:{' '}
          {game.waitingFor
            .map((id) => game.players.find((player) => player.seatId === id)?.name ?? 'игрок')
            .join(', ')}
          . Время не ограничено.
        </p>
      )}
      <div className="own-identity">
        <strong>{roles[game.ownRole].name}</strong>
        <span>{roles[game.ownRole].text}</span>
        <span className="hint">
          {game.ownRole === 'sheriff' || !me.alive
            ? 'Ваша роль раскрыта за столом.'
            : 'Ваша роль видна только вам.'}
        </span>
      </div>
      <ol className="player-boards" aria-label="Игроки по часовой стрелке">
        {game.players.map((player) => (
          <PlayerBoard
            key={player.seatId}
            player={player}
            game={game}
            onCard={setDetail}
            onCharacter={setCharacter}
          />
        ))}
      </ol>
      <div className="table-center">
        <div>
          <span className="pile-label">Колода</span>
          <strong className="draw-pile">
            BANG!<small>{game.drawPileCount} карт</small>
          </strong>
        </div>
        <div>
          <span className="pile-label">Сброс</span>
          {game.discardTop ? (
            <CardButton card={game.discardTop} onClick={() => setDetail(game.discardTop)} />
          ) : (
            <span className="empty-pile">Пусто</span>
          )}
        </div>
        {game.status === 'active' && <p>Ходит {turn?.name ?? 'игрок'}</p>}
      </div>
      {game.status === 'active' ? (
        <>
          <DecisionPanel
            key={game.pending?.id ?? 'none'}
            game={game}
            disabled={disabled}
            onAction={onAction}
          />
          {preparation && !preparation.isCurrent && (
            <section className="preparation-panel" aria-labelledby="preparation-title">
              <h2 id="preparation-title">Подготовьте ответ</h2>
              <p>Проверки идут по часовой стрелке. Карта останется в руке до вашего ответа.</p>
              {draft ? (
                <p role="status">
                  Ответ подготовлен.{' '}
                  <button className="button" type="button" onClick={() => setDraft(null)}>
                    Изменить ответ
                  </button>
                </p>
              ) : (
                <ActionChoices
                  actions={preparation.actions}
                  hand={game.ownHand}
                  disabled={disabled}
                  onAction={(intent) => {
                    setPreparationNotice(null);
                    setDraft({
                      massEffectId: preparation.massEffectId,
                      guard: preparation.guard,
                      intent,
                    });
                  }}
                />
              )}
            </section>
          )}
          {preparationNotice && (
            <p className="notice" role="status">
              {preparationNotice}
            </p>
          )}
        </>
      ) : (
        <div className="game-result" role="status">
          <h2>{winner}</h2>
          {game.outcome?.status === 'finished' && (
            <p>
              {game.outcome.winnerSeatIds
                .map((id) => game.players.find((player) => player.seatId === id)?.name ?? 'Игрок')
                .join(', ')}
            </p>
          )}
          <p>Для следующей партии создайте новую комнату.</p>
          <a className="button" href="/">
            На главную
          </a>
        </div>
      )}
      <Hand hand={game.ownHand} actions={game.actions} onCard={setDetail} />
      {game.revealedCards.length > 0 && (
        <section className="revealed-pool">
          <h2>
            {game.pending?.kind === 'lucky_duke'
              ? 'Карты проверки'
              : game.pending?.kind === 'general_store'
                ? 'Открытые карты магазина'
                : 'Открытые карты'}
          </h2>
          <div className="hand-cards">
            {game.revealedCards.map((card) => (
              <CardButton key={card.id} card={card} onClick={() => setDetail(card)} />
            ))}
          </div>
        </section>
      )}
      <details className="game-history">
        <summary>Последние события</summary>
        <p className="hint">Это история раскрытых карт, а не сведения о текущих руках.</p>
        <ol>
          {game.publicResolutions.map((entry) => (
            <li key={`${entry.revision}-${entry.ordinal}`}>{resolutionText(entry, game)}</li>
          ))}
        </ol>
      </details>
      {game.status === 'active' && game.hostSeatId === game.ownSeatId && (
        <footer className="game-footer">
          <button
            className="button button--quiet"
            type="button"
            disabled={disabled}
            onClick={() => setConfirmAbort(true)}
          >
            Завершить без победителя
          </button>
        </footer>
      )}
      {detail && (
        <CardActionDetails
          card={detail}
          game={game}
          disabled={disabled}
          onClose={() => setDetail(null)}
          onAction={onAction}
        />
      )}
      {character && (
        <Modal title={characters[character.characterId].name} onClose={() => setCharacter(null)}>
          <p>{characters[character.characterId].text}</p>
        </Modal>
      )}
      {confirmAbort && (
        <Modal title="Завершить партию?" onClose={() => setConfirmAbort(false)}>
          <p>Партия завершится для всех игроков без победителя. Продолжить её будет нельзя.</p>
          <button
            type="button"
            className="button"
            disabled={disabled}
            onClick={() => {
              setConfirmAbort(false);
              onAbort();
            }}
          >
            Да, завершить без победителя
          </button>
        </Modal>
      )}
    </section>
  );
}

export function CardActionDetails({
  card,
  game,
  disabled,
  onClose,
  onAction,
}: {
  card: CardInstance;
  game: GameView;
  disabled: boolean;
  onClose: () => void;
  onAction: (intent: GameIntent) => Promise<void>;
}) {
  const actions = game.actions.filter(
    (action) =>
      (action.intent.type === 'play' ||
        (action.intent.type === 'respond' && action.intent.method === 'card')) &&
      action.intent.cardId === card.id,
  );
  return (
    <CardDetails card={card} onClose={onClose}>
      <ActionChoices
        actions={actions}
        hand={game.ownHand}
        disabled={disabled}
        onAction={(intent) => {
          onClose();
          void onAction(intent);
        }}
      />
    </CardDetails>
  );
}
