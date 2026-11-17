import type { CoreGameView, GameActionOption, GameIntent } from '@bang/game-core';

/** Test-only policy operates solely on projected legal actions, never mutates a match. */
export function chooseTraceIntent(view: CoreGameView): GameIntent {
  const actions = view.actions;
  const decline = actions.find(
    (action) => action.intent.type === 'respond' && action.intent.method === 'decline',
  );
  const draw = actions.find(
    (action) => action.intent.type === 'draw' && action.intent.source === 'deck',
  );
  const selection = actions.find((action) => action.selection !== undefined);
  const attacks = actions.filter(
    (action) =>
      action.intent.type === 'play' &&
      ['bang', 'gatling', 'indians', 'duel'].includes(
        view.ownHand.find(
          (card) => card.id === (action.intent as Extract<GameIntent, { type: 'play' }>).cardId,
        )?.kind ?? '',
      ),
  );
  const sheriff = view.players.find((actor) => actor.role === 'sheriff')?.seatId;
  const lawful = view.ownRole === 'sheriff' || view.ownRole === 'deputy';
  const preferred = attacks.find(
    (action) =>
      action.intent.type === 'play' &&
      (lawful ? action.intent.targetSeatId !== sheriff : action.intent.targetSeatId === sheriff),
  );
  const action: GameActionOption | undefined =
    decline ??
    draw ??
    selection ??
    preferred ??
    attacks[0] ??
    actions.find((option) => option.intent.type === 'end_turn') ??
    actions[0];
  if (action === undefined) throw new Error(`No legal trace action at ${view.pending?.kind}`);
  if (action.selection !== undefined) {
    if (action.intent.type !== 'choose') throw new Error('Unexpected trace selection template.');
    return {
      ...action.intent,
      cardIds: action.selection.cards.slice(0, action.selection.min).map((card) => card.id),
    };
  }
  return action.intent;
}
