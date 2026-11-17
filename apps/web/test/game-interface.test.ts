import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { DecisionKind, GameActionOption, GameView } from '@bang/contracts';
import { ActionChoices, DecisionPanel } from '../src/game/DecisionPanel.js';
import { CardActionDetails, GameTable } from '../src/game/GameTable.js';
import { cards, characters, resolutionText } from '../src/game/copy.js';

const card = { id: 'mine', kind: 'missed', rank: '8', suit: 'hearts' } as const;
function fixture(kind: DecisionKind = 'defend'): GameView {
  return {
    matchId: 'match',
    rulesetVersion: 'classic-v1',
    revision: 4,
    status: 'active',
    hostSeatId: 'me',
    ownSeatId: 'me',
    ownRole: 'renegade',
    ownHand: [card],
    players: [
      {
        seatId: 'me',
        name: 'Я',
        seatIndex: 0,
        characterId: 'sid_ketchum',
        hp: 3,
        maxHp: 4,
        alive: true,
        role: null,
        handCount: 1,
        equipment: [],
      },
      {
        seatId: 'other',
        name: '<script>hidden</script>',
        seatIndex: 1,
        characterId: 'lucky_duke',
        hp: 4,
        maxHp: 4,
        alive: true,
        role: null,
        handCount: 4,
        equipment: [],
      },
    ],
    turn: { seatId: 'other', phase: 'play', number: 2 },
    pending: { id: 'decision', kind, ownerSeatId: 'me' },
    massEffect: null,
    preparation: null,
    actions: [
      {
        id: 'defend',
        label: 'Сбросить карту',
        intent: { type: 'respond', decisionId: 'decision', method: 'card', cardId: 'mine' },
      },
    ],
    drawPileCount: 70,
    discardTop: null,
    revealedCards: [],
    publicResolutions: [],
    timeoutPolicy: 'wait-for-required-actor',
    outcome: null,
    roomCode: 'ABCDEF',
    presence: [
      { seatId: 'me', connected: true },
      { seatId: 'other', connected: false },
    ],
    waitingFor: [],
    deliverySequence: 1,
  };
}

describe('complete decision interface', () => {
  it("exposes a matching defense card action from hand details without another card's actions", () => {
    const game = fixture();
    game.actions = [
      ...game.actions,
      {
        id: 'other-card',
        label: 'Not this card',
        intent: { type: 'respond', decisionId: 'decision', method: 'card', cardId: 'foreign' },
      },
    ];
    const html = renderToStaticMarkup(
      createElement(CardActionDetails, {
        card,
        game,
        disabled: false,
        onClose: () => undefined,
        onAction: async () => undefined,
      }),
    );
    expect(html).toContain('Сбросить карту · Мимо! · 8♥');
    expect(html).not.toContain('Not this card');
  });
  const decisionKinds: DecisionKind[] = [
    'turn',
    'defend',
    'duel',
    'mass_response',
    'general_store',
    'kit_carlson',
    'lucky_duke',
    'draw_choice',
    'target_card',
    'rescue',
    'elimination_discard',
    'turn_discard',
  ];
  it.each(decisionKinds)('renders %s with actionable Russian controls', (kind) => {
    const html = renderToStaticMarkup(
      createElement(DecisionPanel, {
        game: fixture(kind),
        disabled: false,
        onAction: () => undefined,
      }),
    );
    expect(html).toContain('Сбросить карту');
    expect(html).toContain('Мимо! · 8♥');
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('disabled=""');
  });
  it('renders ordered/multiple private choices as labelled native checkbox controls with explicit confirmation', () => {
    const action: GameActionOption = {
      id: 'choose',
      label: 'Оставьте две карты',
      intent: { type: 'choose', decisionId: 'kit', cardIds: [] },
      selection: {
        cards: [card, { ...card, id: 'second', rank: '9' }],
        min: 2,
        max: 2,
        ordered: true,
      },
    };
    const html = renderToStaticMarkup(
      createElement(ActionChoices, {
        actions: [action],
        disabled: false,
        onAction: () => undefined,
      }),
    );
    expect(html.match(/type="checkbox"/g)).toHaveLength(2);
    expect(html).toContain('Подтвердить выбор');
    expect(html).toContain('<fieldset>');
    expect(html).not.toContain('последняя сброшенная');
  });
  it('disables authoritative commands while uncertain or disconnected', () => {
    const html = renderToStaticMarkup(
      createElement(DecisionPanel, { game: fixture(), disabled: true, onAction: () => undefined }),
    );
    expect(html).toContain('disabled=""');
  });
  it('provides Russian descriptions for all22cards and16characters', () => {
    expect(Object.keys(cards)).toHaveLength(22);
    expect(Object.keys(characters)).toHaveLength(16);
    for (const entry of [...Object.values(cards), ...Object.values(characters)]) {
      expect(entry.name).toMatch(/[А-Яа-яЁё]/);
      expect(entry.text.length).toBeGreaterThan(20);
    }
  });
});

describe('private table and lifecycle', () => {
  it('labels public Lucky Duke cards as checks and preserves the General Store label', () => {
    const lucky = fixture('lucky_duke');
    lucky.revealedCards = [card];
    const store = fixture('general_store');
    store.revealedCards = [card];
    const luckyHtml = render(lucky);
    expect(luckyHtml).toContain('Карты проверки');
    expect(luckyHtml).not.toContain('Открытые карты магазина');
    expect(render(store)).toContain('Открытые карты магазина');
  });
  it('distinguishes Lucky Duke revealed check from the last chosen result', () => {
    const game = fixture();
    const first = { revision: 5, ordinal: 1, kind: 'check', actorSeatId: 'me', card } as const;
    const chosen = { ...first, ordinal: 2, card: { ...card, suit: 'spades' } } as const;
    game.publicResolutions = [first, chosen];
    expect(resolutionText(first, game)).toContain('открыта для проверки');
    expect(resolutionText(chosen, game)).toContain('результат проверки');
  });
  it('reports damage on the victim actor rather than the responsible source target', () => {
    expect(
      resolutionText(
        {
          revision: 4,
          ordinal: 0,
          kind: 'damage',
          actorSeatId: 'me',
          targetSeatId: 'other',
          amount: 2,
        },
        fixture(),
      ),
    ).toBe('Я потерял жизней: 2');
  });
  const render = (game: GameView) =>
    renderToStaticMarkup(
      createElement(GameTable, {
        game,
        disabled: false,
        notice: null,
        submitted: false,
        sending: false,
        onAction: async () => undefined,
        onAbort: () => undefined,
        onSync: () => undefined,
        onRetry: () => undefined,
      }),
    );
  it('shows own role/hand, only public data for others and escapes names', () => {
    const html = render(fixture());
    expect(html).toContain('Ренегат');
    expect(html).toContain('Роль скрыта');
    expect(html).toContain('Мимо!');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('seatToken');
  });
  it('offers host abort but no guest abort, including when host was eliminated', () => {
    expect(render(fixture())).toContain('Завершить без победителя');
    expect(render({ ...fixture(), hostSeatId: 'other' })).not.toContain('Завершить без победителя');
    const eliminated = fixture();
    eliminated.players = eliminated.players.map((player) =>
      player.seatId === 'me' ? { ...player, alive: false } : player,
    );
    expect(render(eliminated)).toContain('Завершить без победителя');
  });
  it('has terminal result and next-room path without reset, response or abort controls', () => {
    const game = fixture();
    game.status = 'aborted';
    game.pending = null;
    game.actions = [];
    game.outcome = { status: 'aborted', winner: null, winnerSeatIds: [] };
    const html = render(game);
    expect(html).toContain('без победителя');
    expect(html.match(/Партия завершена без победителя/g)).toHaveLength(1);
    expect(html).toContain('создайте новую комнату');
    expect(html).not.toContain('Завершить без победителя');
    expect(html).not.toContain('Сбросить карту');
    const finishedHtml = render({
      ...game,
      status: 'finished',
      outcome: { status: 'finished', winner: 'outlaws', winnerSeatIds: ['other'] },
    });
    expect(finishedHtml).toContain('Итог партии');
    expect(finishedHtml.match(/Победа бандитов/g)).toHaveLength(1);
  });
  it('shows missing required actor and preserves non-current preparation as a separate draft', () => {
    const game = fixture();
    game.waitingFor = ['other'];
    game.preparation = {
      massEffectId: 'mass',
      guard: 'own-defense',
      seatId: 'me',
      isCurrent: false,
      actions: game.actions,
    };
    const html = render(game);
    expect(html).toContain('Время не ограничено');
    expect(html).toContain('Подготовьте ответ');
    expect(html).toContain('Карта останется в руке');
  });
});
