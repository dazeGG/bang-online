import { describe, expect, it } from 'vitest';
import {
  parseGameAbort,
  parseGameCommand,
  parseGameIntent,
  parseGameStart,
  parseGameSync,
} from '../src/game-validation.js';

describe('strict gameplay wire validation', () => {
  it.each([
    { type: 'draw', source: 'deck' },
    { type: 'draw', source: 'discard' },
    { type: 'draw', source: 'opponent', targetSeatId: 'seat' },
    { type: 'play', cardId: 'own' },
    { type: 'play', cardId: 'own', targetSeatId: 'seat', zone: 'hand' },
    {
      type: 'play',
      cardId: 'own',
      targetSeatId: 'seat',
      zone: 'equipment',
      targetCardId: 'public',
    },
    { type: 'end_turn' },
    { type: 'respond', decisionId: 'd', method: 'card', cardId: 'own' },
    ...['barrel', 'innate', 'decline'].map((method) => ({
      type: 'respond',
      decisionId: 'd',
      method,
    })),
    { type: 'choose', decisionId: 'd', cardIds: ['a', 'b'] },
    { type: 'sid_heal', cardIds: ['a', 'b'] },
  ])('accepts and copies the concrete variant %j', (intent) => {
    expect(parseGameIntent(intent)).toEqual(intent);
    expect(
      parseGameCommand({ commandId: 'cmd', expectedRevision: 1, matchId: 'match', intent }),
    ).toEqual({ commandId: 'cmd', expectedRevision: 1, matchId: 'match', intent });
  });

  it.each([
    null,
    [],
    {},
    { type: 'end_turn', actorSeatId: 'spoof' },
    { type: 'draw', source: 'opponent' },
    { type: 'draw', source: 'deck', targetSeatId: 's' },
    { type: 'play', cardId: '' },
    { type: 'play', cardId: 'x', zone: 'hand' },
    { type: 'play', cardId: 'x', targetSeatId: 's', zone: 'hand', targetCardId: 'hidden' },
    { type: 'respond', decisionId: 'd', method: ['barrel'] },
    { type: 'respond', decisionId: 'd', method: { toString: 'barrel' } },
    { type: 'respond', decisionId: 'd', method: 'barrel', cardId: 'x' },
    { type: 'respond', decisionId: 'd', method: 'card' },
    { type: 'choose', decisionId: 'd', cardIds: ['x', 'x'] },
    { type: 'choose', decisionId: 'd', cardIds: Array.from({ length: 81 }, (_, i) => String(i)) },
    { type: 'sid_heal', cardIds: ['x'] },
    { type: 'sid_heal', cardIds: ['x', 'x'] },
    { type: 'sid_heal', cardIds: ['x', 'y', 'z'] },
  ])('rejects malformed variant %j', (intent) => expect(parseGameIntent(intent)).toBeUndefined());

  it('rejects invalid envelopes and preserves ordered selections', () => {
    expect(parseGameStart({ commandId: 'x', expectedRevision: 0 })).toBeDefined();
    for (const expectedRevision of [-1, 1.2, Infinity, Number.MAX_SAFE_INTEGER + 1, '1'])
      expect(parseGameStart({ commandId: 'x', expectedRevision })).toBeUndefined();
    expect(parseGameStart({ commandId: 'x'.repeat(129), expectedRevision: 1 })).toBeUndefined();
    // Server-settled overdue decisions own this receipt namespace.
    expect(parseGameStart({ commandId: 'overdue:3', expectedRevision: 1 })).toBeUndefined();
    expect(
      parseGameAbort({ commandId: 'x', expectedRevision: 1, matchId: 'm', hostSeatId: 'spoof' }),
    ).toBeUndefined();
    expect(
      parseGameCommand({
        commandId: 'x',
        expectedRevision: 1,
        matchId: 'm',
        intent: { type: 'end_turn' },
        seatId: 'spoof',
      }),
    ).toBeUndefined();
    expect(parseGameSync({})).toEqual({});
    expect(parseGameSync({ matchId: 'm' })).toEqual({ matchId: 'm' });
    expect(parseGameSync({ seatId: 'spoof' })).toBeUndefined();
    expect(parseGameIntent({ type: 'choose', decisionId: 'd', cardIds: ['b', 'a'] })).toEqual({
      type: 'choose',
      decisionId: 'd',
      cardIds: ['b', 'a'],
    });
  });
});
