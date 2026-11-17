import { describe, expect, it } from 'vitest';
import type { DecisionKind, GameActionOption, GameIntent } from '../src/index.js';
import { CLASSIC_DECK } from '../src/index.js';

const card = CLASSIC_DECK[0]!;
/** One representable interaction for every public decision variant, not engine proof. */
export const decisionFixtures = {
  turn: { type: 'draw', source: 'deck' },
  defend: { type: 'respond', decisionId: 'defend', method: 'card', cardId: card.id },
  duel: { type: 'respond', decisionId: 'duel', method: 'decline' },
  mass_response: { type: 'respond', decisionId: 'mass', method: 'barrel' },
  general_store: { type: 'choose', decisionId: 'store', cardIds: [card.id] },
  kit_carlson: { type: 'choose', decisionId: 'kit', cardIds: ['own-1', 'own-2'] },
  lucky_duke: { type: 'choose', decisionId: 'check', cardIds: [card.id] },
  draw_choice: { type: 'draw', source: 'opponent', targetSeatId: 'other' },
  target_card: { type: 'play', cardId: 'own-panic', targetSeatId: 'other', zone: 'hand' },
  rescue: { type: 'respond', decisionId: 'rescue', method: 'decline' },
  elimination_discard: { type: 'choose', decisionId: 'elimination', cardIds: ['own-2', 'own-1'] },
  turn_discard: { type: 'choose', decisionId: 'discard', cardIds: ['own-1'] },
} satisfies Record<DecisionKind, GameIntent>;

describe('public action contract fixtures', () => {
  it('represents all decision variants and round-trips concrete intents', () => {
    expect(Object.keys(decisionFixtures)).toHaveLength(12);
    expect(JSON.parse(JSON.stringify(decisionFixtures))).toEqual(decisionFixtures);
    expect(decisionFixtures.target_card).not.toHaveProperty('targetCardId');
  });

  it('keeps ordered selections and Sid payment representable without provisional consumption', () => {
    const action: GameActionOption = {
      id: 'discard',
      label: 'Choose discard order',
      intent: { type: 'choose', decisionId: 'discard', cardIds: [] },
      selection: { cards: [card], min: 1, max: 1, ordered: true },
    };
    const sid: GameIntent = { type: 'sid_heal', cardIds: ['own-1', 'own-2'] };
    expect(action.selection?.ordered).toBe(true);
    expect(action.intent).toEqual({ type: 'choose', decisionId: 'discard', cardIds: [] });
    expect(sid.cardIds).toHaveLength(2);
  });
});
