import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type {
  CardInstance,
  GameActionOption,
  GameIntent,
  GameView,
  PublicPlayerView,
} from '@bang/contracts';
import { ThemeSwitch } from '../theme.js';
import { CardDetails, Modal } from './CardDetails.js';
import { ActionChoices, DecisionPanel } from './DecisionPanel.js';
import { GameResult } from './GameResult.js';
import { commitPreparation, type PreparedResponse } from './command-state.js';
import { characters, resolutionParts, roles } from './copy.js';
import { CardButton, HandFan } from './Hand.js';
import { EquipmentChips, LifeTokens, PlayerBoard, Ribbon } from './PlayerBoard.js';
import { seatPlacements, tableLayout, type TableLayout } from './table-layout.js';
import {
  actionTargetNote,
  AUTO_DISCARD_NOTE,
  autoDiscards,
  cardActions,
  isOwnMove,
  ownRibbon,
  RESPONSE_KINDS,
  seatDistance,
  seatsAroundViewer,
  tablePrompt,
  weaponRange,
} from './table-model.js';
import { useElementSize } from './use-element-size.js';
import './game.css';

type TableDialog =
  | { type: 'card'; card: CardInstance; from: 'hand' | 'table' | 'discard' | 'revealed' }
  | { type: 'character'; seatId: string }
  | { type: 'role' }
  | { type: 'abort' }
  | { type: 'select'; actionId: string };

const DEFAULT_SIZE = { w: 1440, h: 900 };

export function GameTable(props: {
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
  if (props.game.status !== 'active') return <GameResult game={props.game} />;
  return <ActiveTable {...props} />;
}

function ActiveTable({
  game,
  disabled,
  notice,
  submitted,
  sending,
  onAction,
  onAbort,
  onSync,
  onRetry,
}: Parameters<typeof GameTable>[0]) {
  const [rootRef, size] = useElementSize<HTMLElement>(DEFAULT_SIZE);
  const [dialog, setDialog] = useState<TableDialog | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    if (!menu) return;
    const onPointer = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenu(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  // Close dialogs whose subject no longer exists after an authoritative update.
  const selectAction =
    dialog?.type === 'select'
      ? game.actions.find((action) => action.id === dialog.actionId)
      : undefined;
  if (
    (dialog?.type === 'select' && !selectAction) ||
    (dialog?.type === 'card' &&
      dialog.from === 'hand' &&
      !game.ownHand.some((card) => card.id === dialog.card.id))
  )
    setDialog(null);

  const layout = tableLayout(size.w, size.h);
  const { me, opponents } = seatsAroundViewer(game);
  const { seatW, seats } = seatPlacements(layout, opponents.length);
  const reach = weaponRange(me);
  const prompt = tablePrompt(game);
  const ownMove = isOwnMove(game);
  const turnOwner = game.players.find((player) => player.seatId === game.turn.seatId);
  const isHost = game.hostSeatId === game.ownSeatId;
  const lastEntry = game.publicResolutions.at(-1);
  const lastEvent = lastEntry ? resolutionParts(lastEntry, game) : null;

  let hint: string | undefined;
  if (!me.alive) hint = 'Вы выбыли. Можно следить за партией до конца.';
  else if (!ownMove) hint = 'Сейчас не ваш ход. Нажмите на карту, чтобы прочитать её.';
  else if (
    game.pending?.kind === 'turn' &&
    game.turn.phase === 'play' &&
    game.ownHand.length > me.hp
  )
    hint = `Лимит руки — ${me.hp}. В конце хода сбросите ${game.ownHand.length - me.hp}.`;

  const pending = game.pending;
  const sourceIndex =
    pending &&
    pending.ownerSeatId === game.ownSeatId &&
    RESPONSE_KINDS.has(pending.kind) &&
    pending.sourceSeatId !== game.ownSeatId
      ? opponents.findIndex((player) => player.seatId === pending.sourceSeatId)
      : -1;
  const shotFrom = sourceIndex >= 0 ? seats[sourceIndex] : undefined;
  const meX = layout.padX + layout.plaqueW / 2;
  const meY = layout.h - layout.bottomH * 0.55;

  const revealedTitle =
    pending?.kind === 'lucky_duke'
      ? 'Карты проверки'
      : pending?.kind === 'general_store'
        ? 'Открытые карты магазина'
        : 'Открытые карты';
  const logVisible = layout.wide || drawer;
  const pileH = Math.round(layout.pileW * 1.4);

  return (
    <section
      ref={rootRef}
      className={`table${layout.compact ? ' table--compact' : ''}`}
      aria-labelledby="game-title"
    >
      <header className="table-top" style={{ height: layout.topH }}>
        <span className="brand brand--table" aria-hidden="true">
          BANG!
        </span>
        {!layout.compact && <span className="table-room">Комната {game.roomCode}</span>}
        <h1 id="game-title" className="table-turn">
          Ход {game.turn.number} · {turnOwner?.name ?? 'игрок'}
        </h1>
        <div className="table-tools">
          {!layout.wide && (
            <button
              type="button"
              className={`icon-button${drawer ? ' icon-button--on' : ''}`}
              aria-label="Журнал событий"
              title="Журнал событий"
              aria-expanded={drawer}
              aria-controls="game-log"
              onClick={() => {
                setDrawer((open) => !open);
                setMenu(false);
              }}
            >
              <svg width="17" height="17" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M5 10.5a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 0 1h-2a.5.5 0 0 1-.5-.5m0-2a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5m0-2a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5m0-2a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5" />
                <path d="M3 0h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2v-1h1v1a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v1H1V2a2 2 0 0 1 2-2" />
                <path d="M1 5v-.5a.5.5 0 0 1 1 0V5h.5a.5.5 0 0 1 0 1h-2a.5.5 0 0 1 0-1zm0 3v-.5a.5.5 0 0 1 1 0V8h.5a.5.5 0 0 1 0 1h-2a.5.5 0 0 1 0-1zm0 3v-.5a.5.5 0 0 1 1 0v.5h.5a.5.5 0 0 1 0 1h-2a.5.5 0 0 1 0-1z" />
              </svg>
            </button>
          )}
          <ThemeSwitch />
          <div className="menu-wrap" ref={menuRef}>
            <button
              type="button"
              className={`icon-button${menu ? ' icon-button--on' : ''}`}
              aria-label="Меню"
              title="Меню"
              aria-expanded={menu}
              aria-controls="table-menu"
              onClick={() => setMenu((open) => !open)}
            >
              <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M2.5 12a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5m0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5m0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5" />
              </svg>
            </button>
            <div id="table-menu" className="table-menu" hidden={!menu}>
              <button
                type="button"
                onClick={() => {
                  setMenu(false);
                  onSync();
                }}
              >
                Обновить стол
              </button>
              {isHost && (
                <>
                  <span className="table-menu-rule" aria-hidden="true" />
                  <button
                    type="button"
                    className="table-menu-danger"
                    disabled={disabled}
                    onClick={() => {
                      setMenu(false);
                      setDialog({ type: 'abort' });
                    }}
                  >
                    Завершить без победителя
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="table-banners" style={{ top: layout.topH + 8, right: layout.sideW + 12 }}>
        {notice && (
          <p className="banner banner--error" role="alert">
            {notice}
          </p>
        )}
        {submitted && (
          <p className="banner" role="status">
            {sending ? 'Подтверждаем действие…' : 'Действие сохранено. Ждём подтверждения.'}
            <button
              className="button button--small"
              type="button"
              disabled={sending}
              onClick={onRetry}
            >
              Повторить запрос
            </button>
          </p>
        )}
        {game.waitingFor.length > 0 && (
          <p className="banner" role="status">
            Ждём возвращения:{' '}
            {game.waitingFor
              .map((id) => game.players.find((player) => player.seatId === id)?.name ?? 'игрок')
              .join(', ')}
            . {autoDiscards(game) ? AUTO_DISCARD_NOTE : 'Время не ограничено.'}
          </p>
        )}
        {preparationNotice && (
          <p className="banner" role="status">
            {preparationNotice}
          </p>
        )}
      </div>

      <div className="table-oval" style={layout.oval} aria-hidden="true">
        <div className="table-felt" />
      </div>

      {shotFrom && (
        <svg className="table-shot" aria-hidden="true">
          <line x1={shotFrom.x} y1={shotFrom.y} x2={Math.round(meX)} y2={Math.round(meY)} />
          <circle cx={Math.round(meX)} cy={Math.round(meY)} r="7" />
        </svg>
      )}

      <div className="table-center" style={{ left: layout.cx, top: layout.cy }}>
        <div className="pile">
          <div
            className="pile-deck"
            style={{ width: layout.pileW, height: pileH }}
            aria-hidden="true"
          >
            <span style={{ fontSize: Math.round(layout.pileW * 0.24) }}>BANG!</span>
          </div>
          <span className="pile-label">Колода · {game.drawPileCount}</span>
        </div>

        <div className={`prompt${prompt.mine ? ' prompt--mine' : ''}`} aria-live="polite">
          <p className="prompt-eyebrow">{prompt.eyebrow}</p>
          <h2 className="prompt-title">{prompt.title}</h2>
          {prompt.sub && <p className="prompt-sub">{prompt.sub}</p>}
          {game.revealedCards.length > 0 && (
            <section className="revealed-pool" aria-label={revealedTitle}>
              <h3>{revealedTitle}</h3>
              <div className="revealed-cards">
                {game.revealedCards.map((card) => (
                  <CardButton
                    key={card.id}
                    card={card}
                    height={Math.max(64, Math.round(layout.pileW * 1.15))}
                    onClick={() => setDialog({ type: 'card', card, from: 'revealed' })}
                  />
                ))}
              </div>
            </section>
          )}
          {!layout.compact && lastEvent && (
            <p className="prompt-last">
              {[
                lastEvent.actor,
                lastEvent.verb,
                lastEvent.card ? `«${lastEvent.card}»` : '',
                lastEvent.tail,
              ]
                .filter(Boolean)
                .join(' ')}
            </p>
          )}
        </div>

        <div className="pile">
          {game.discardTop ? (
            <CardButton
              card={game.discardTop}
              height={pileH}
              className="pile-discard"
              onClick={() =>
                game.discardTop &&
                setDialog({ type: 'card', card: game.discardTop, from: 'discard' })
              }
            />
          ) : (
            <span className="pile-empty" style={{ width: layout.pileW, height: pileH }}>
              Пусто
            </span>
          )}
          <span className="pile-label">Сброс</span>
        </div>
      </div>

      <ol className="table-seats" aria-label="Игроки по часовой стрелке">
        {opponents.map((player, index) => {
          const distance = seatDistance(game, me.seatId, player.seatId);
          return (
            <PlayerBoard
              key={player.seatId}
              player={player}
              game={game}
              distance={me.alive ? distance : null}
              inReach={me.alive && distance !== null && distance <= reach}
              style={{ left: seats[index]!.x, top: seats[index]!.y, width: seatW }}
              compact={layout.compact}
              onCard={(card) => setDialog({ type: 'card', card, from: 'table' })}
              onCharacter={(target) => setDialog({ type: 'character', seatId: target.seatId })}
            />
          );
        })}
      </ol>

      <div
        className="table-bottom"
        style={{ right: layout.sideW, height: layout.bottomH, paddingInline: layout.padX }}
      >
        <OwnPlaque
          game={game}
          me={me}
          reach={reach}
          layout={layout}
          onRole={() => setDialog({ type: 'role' })}
          onCharacter={() => setDialog({ type: 'character', seatId: me.seatId })}
          onCard={(card) => setDialog({ type: 'card', card, from: 'table' })}
        />
        <HandFan
          game={game}
          layout={layout}
          onCard={(card) => setDialog({ type: 'card', card, from: 'hand' })}
        />
        <div className="action-slot" style={{ width: layout.actionsW }}>
          <DecisionPanel
            game={game}
            disabled={disabled}
            onAction={(intent) => void onAction(intent)}
            onSelect={(action) => setDialog({ type: 'select', actionId: action.id })}
            hint={hint}
          >
            {preparation && !preparation.isCurrent && (
              <div className="preparation" aria-labelledby="preparation-title">
                <h3 id="preparation-title">Подготовьте ответ</h3>
                <p>Проверки идут по часовой стрелке. Карта останется в руке до вашего ответа.</p>
                {draft ? (
                  <p role="status" className="preparation-ready">
                    Ответ подготовлен.
                    <button
                      className="button button--secondary"
                      type="button"
                      onClick={() => setDraft(null)}
                    >
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
              </div>
            )}
          </DecisionPanel>
        </div>
      </div>

      <aside
        id="game-log"
        className={`table-log${layout.wide ? '' : ' table-log--drawer'}`}
        hidden={!logVisible}
        aria-labelledby="log-title"
        style={{
          top: layout.topH,
          width: layout.wide ? layout.sideW : Math.min(360, Math.round(layout.w * 0.48)),
        }}
      >
        <div className="table-log-head">
          <h2 id="log-title">Последние события</h2>
          {!layout.wide && (
            <button
              type="button"
              className="icon-button icon-button--paper"
              aria-label="Закрыть журнал"
              onClick={() => setDrawer(false)}
            >
              <img src="/icons/x.svg" alt="" width="18" height="18" />
            </button>
          )}
        </div>
        <p className="table-log-note">Это история раскрытых карт, а не сведения о текущих руках.</p>
        <ol className="table-log-list">
          {[...game.publicResolutions].reverse().map((entry) => {
            const parts = resolutionParts(entry, game);
            return (
              <li
                key={`${entry.revision}-${entry.ordinal}`}
                className={`log-row log-row--${parts.tone}`}
              >
                <span className="log-dot" aria-hidden="true" />
                <span>
                  {parts.actor && <b>{parts.actor}</b>} {parts.verb}{' '}
                  {parts.card && <span className="log-card">«{parts.card}»</span>} {parts.tail}
                </span>
              </li>
            );
          })}
        </ol>
      </aside>

      {dialog?.type === 'card' &&
        (dialog.from === 'hand' ? (
          <CardActionDetails
            card={dialog.card}
            game={game}
            disabled={disabled}
            onClose={() => setDialog(null)}
            onAction={onAction}
          />
        ) : (
          <CardDetails
            card={dialog.card}
            note={
              dialog.from === 'discard'
                ? 'Верхняя карта сброса.'
                : dialog.from === 'revealed'
                  ? 'Открытая карта в центре стола.'
                  : 'Открытая карта на столе.'
            }
            onClose={() => setDialog(null)}
          >
            {dialog.from === 'revealed' && (
              <SingleCardChoice
                game={game}
                card={dialog.card}
                disabled={disabled}
                onChoose={(intent) => {
                  setDialog(null);
                  void onAction(intent);
                }}
              />
            )}
          </CardDetails>
        ))}
      {dialog?.type === 'character' && (
        <CharacterDialog
          game={game}
          player={game.players.find((player) => player.seatId === dialog.seatId)!}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'role' && (
        <Modal eyebrow="Ваша роль" title={roles[game.ownRole].name} onClose={() => setDialog(null)}>
          <p className="dialog-text">{roles[game.ownRole].text}</p>
          <p className="dialog-note">
            {game.ownRole === 'sheriff' || !me.alive
              ? 'Ваша роль раскрыта за столом.'
              : 'Ваша роль видна только вам.'}
          </p>
        </Modal>
      )}
      {dialog?.type === 'abort' && (
        <Modal eyebrow="Хозяин комнаты" title="Завершить партию?" onClose={() => setDialog(null)}>
          <p className="dialog-text">
            Партия завершится для всех игроков без победителя. Продолжить её будет нельзя.
          </p>
          <div className="game-actions">
            <button
              type="button"
              className="button button--primary"
              disabled={disabled}
              onClick={() => {
                setDialog(null);
                onAbort();
              }}
            >
              Да, завершить без победителя
            </button>
          </div>
        </Modal>
      )}
      {dialog?.type === 'select' && selectAction && (
        <Modal eyebrow="Выбор карт" title={selectAction.label} onClose={() => setDialog(null)}>
          <ActionChoices
            actions={[selectAction]}
            hand={game.ownHand}
            disabled={disabled}
            onAction={(intent) => {
              setDialog(null);
              void onAction(intent);
            }}
          />
        </Modal>
      )}

      {layout.portrait && (
        <div className="rotate-notice" role="alert">
          <img src="/icons/star-fill.svg" alt="" width="36" height="36" />
          <strong>Поверните телефон</strong>
          <span>Стол рассчитан на горизонтальный экран — так помещаются все игроки и рука.</span>
        </div>
      )}
    </section>
  );
}

function OwnPlaque({
  game,
  me,
  reach,
  layout,
  onRole,
  onCharacter,
  onCard,
}: {
  game: GameView;
  me: PublicPlayerView;
  reach: number;
  layout: TableLayout;
  onRole: () => void;
  onCharacter: () => void;
  onCard: (card: CardInstance) => void;
}) {
  const ribbon = ownRibbon(game, me);
  return (
    <section
      className={`plaque${ribbon ? ` plaque--${ribbon.tone}` : ''}`}
      style={{ width: layout.plaqueW }}
      aria-label={`Вы: ${me.name}`}
    >
      <Ribbon ribbon={ribbon} className="plaque-ribbon" />
      <div className="plaque-head">
        <span className="seal seal--large" aria-hidden="true">
          {Array.from(me.name)[0]?.toLocaleUpperCase('ru')}
        </span>
        <div className="plaque-who">
          <div className="plaque-name">
            <strong>{me.name}</strong>
            <span className="plaque-you">вы</span>
            <button type="button" className="role-button" onClick={onRole}>
              {roles[game.ownRole].name}
            </button>
          </div>
          <button type="button" className="character-link" onClick={onCharacter}>
            {characters[me.characterId].name}
          </button>
        </div>
      </div>
      {!layout.compact && <p className="plaque-goal">{roles[game.ownRole].text}</p>}
      <div className="plaque-life">
        <LifeTokens hp={me.alive ? me.hp : 0} maxHp={me.maxHp} large />
        <strong>{me.alive ? `${me.hp} / ${me.maxHp}` : 'Выбыл'}</strong>
        {me.alive && <span className="plaque-muted">жизни</span>}
      </div>
      <div className="plaque-gear">
        <span className="reach" title="Игроки с красной меткой — в зоне вашего выстрела">
          <span className="reach-badge">{reach}</span>
          Досягаемость
        </span>
        <EquipmentChips player={me} onCard={onCard} />
      </div>
    </section>
  );
}

function CharacterDialog({
  game,
  player,
  onClose,
}: {
  game: GameView;
  player: PublicPlayerView;
  onClose: () => void;
}) {
  const own = player.seatId === game.ownSeatId;
  return (
    <Modal
      eyebrow={`Персонаж · ${player.name}`}
      title={characters[player.characterId].name}
      onClose={onClose}
    >
      <p className="dialog-text">{characters[player.characterId].text}</p>
      {!own && (
        <p className="dialog-note">
          {player.role ? `Роль раскрыта: ${roles[player.role].name}.` : 'Роль скрыта.'}
        </p>
      )}
    </Modal>
  );
}

/** General Store and Lucky Duke: pick the opened card directly from the table. */
function SingleCardChoice({
  game,
  card,
  disabled,
  onChoose,
}: {
  game: GameView;
  card: CardInstance;
  disabled: boolean;
  onChoose: (intent: GameIntent) => void;
}) {
  const action = game.actions.find(
    (candidate) =>
      candidate.intent.type === 'choose' &&
      candidate.selection?.min === 1 &&
      candidate.selection.max === 1 &&
      candidate.selection.cards.some((entry) => entry.id === card.id),
  );
  if (!action || action.intent.type !== 'choose') return null;
  const intent: GameIntent = { ...action.intent, cardIds: [card.id] };
  return (
    <div className="game-actions">
      <button
        type="button"
        className="button button--primary"
        disabled={disabled}
        onClick={() => onChoose(intent)}
      >
        {game.pending?.kind === 'lucky_duke' ? 'Выбрать этот результат' : 'Взять эту карту'}
      </button>
    </div>
  );
}

const targetNotes: Partial<Record<CardInstance['kind'], string>> = {
  panic: 'Только игрок на расстоянии 1.',
  jail: 'Любой игрок, кроме шерифа.',
  duel: 'Любой игрок.',
  cat_balou: 'Любой игрок.',
};

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
  const actions = cardActions(game, card.id);
  const targeted = actions.filter(
    (action) => action.intent.type === 'play' && action.intent.targetSeatId !== undefined,
  );
  const direct = actions.filter((action) => !targeted.includes(action));
  const { me, opponents } = seatsAroundViewer(game);
  const reach = weaponRange(me);
  const shooting = card.kind === 'bang' || card.kind === 'missed';
  const choose = (intent: GameIntent) => {
    onClose();
    void onAction(intent);
  };
  let note: string | undefined;
  if (targeted.length > 0)
    note = shooting
      ? `Ваша досягаемость — ${reach}. Игроки с красной меткой в зоне выстрела.`
      : targetNotes[card.kind];
  else if (actions.length === 0)
    note =
      game.preparation && !game.preparation.isCurrent
        ? 'Ответ на массовую атаку готовится в панели действий.'
        : !isOwnMove(game)
          ? 'Сейчас не ваш ход.'
          : card.kind === 'missed' && me.characterId !== 'calamity_janet'
            ? 'Играется только в ответ на выстрел.'
            : 'Сейчас эту карту сыграть нельзя.';
  const candidates = [
    ...(targeted.some(
      (action) => action.intent.type === 'play' && action.intent.targetSeatId === me.seatId,
    )
      ? [me]
      : []),
    ...opponents.filter((player) => player.alive),
  ];
  return (
    <CardDetails card={card} note={note} onClose={onClose}>
      {targeted.length > 0 && (
        <ul className="target-grid" aria-label="Цели">
          {candidates.flatMap((player) => {
            const distance = seatDistance(game, me.seatId, player.seatId);
            const inReach = distance !== null && distance > 0 && distance <= reach;
            const options = targeted.filter(
              (action) =>
                action.intent.type === 'play' && action.intent.targetSeatId === player.seatId,
            );
            const badge = (
              <span
                className={`distance distance--inline${inReach ? ' distance--reach' : ''}`}
                aria-hidden="true"
              >
                {distance === 0 ? '·' : distance}
              </span>
            );
            if (options.length === 0)
              return [
                <li key={player.seatId}>
                  <button type="button" className="target target--off" disabled>
                    {badge}
                    <span className="target-text">
                      <b>{player.name}</b>
                      <span>{unavailableNote(card, player, shooting)}</span>
                    </span>
                  </button>
                </li>,
              ];
            return options.map((action: GameActionOption) => (
              <li key={action.id}>
                <button
                  type="button"
                  className="target"
                  disabled={disabled}
                  onClick={() => choose(action.intent)}
                >
                  {badge}
                  <span className="target-text">
                    <b>{player.name}</b>
                    <span>{actionTargetNote(action.intent, game, distance)}</span>
                  </span>
                </button>
              </li>
            ));
          })}
        </ul>
      )}
      {direct.length > 0 && (
        <ActionChoices actions={direct} hand={game.ownHand} disabled={disabled} onAction={choose} />
      )}
    </CardDetails>
  );
}

function unavailableNote(card: CardInstance, player: PublicPlayerView, shooting: boolean) {
  if (shooting) return 'вне досягаемости';
  if (card.kind === 'panic') return 'дальше 1';
  if (card.kind === 'jail')
    return player.role === 'sheriff'
      ? 'шериф'
      : player.equipment.some((entry) => entry.kind === 'jail')
        ? 'уже в тюрьме'
        : 'недоступно';
  if (card.kind === 'cat_balou') return 'нечего сбросить';
  return 'недоступно';
}
