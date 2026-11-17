import { describe, expect, it } from 'vitest';
import type { GameActionOption, GameView, MassResponsePreparation } from '@bang/contracts';
import {
  acceptsGame,
  claimOutbox,
  clearOutbox,
  commitPreparation,
  readOutbox,
  selectedIntent,
  type SubmittedCommand,
} from '../src/game/command-state.js';

function storage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}
const envelope: SubmittedCommand = {
  event: 'game:command',
  request: {
    commandId: 'same-on-retry',
    expectedRevision: 12,
    matchId: 'match',
    intent: { type: 'end_turn' },
  },
};

describe('durable submitted command envelopes', () => {
  it('restores the exact accepted envelope after timeout/reload, including ID and revision', () => {
    const store = storage();
    claimOutbox(store, 'seat', envelope);
    expect(readOutbox(store, 'seat')).toEqual(envelope);
    expect(readOutbox(store, 'seat')).toEqual(envelope);
    expect(clearOutbox(store, 'seat', envelope.request.commandId)).toBeNull();
    expect(readOutbox(store, 'seat')).toBeNull();
  });
  it('serial lock sections adopt an existing other-tab request rather than overwriting it', () => {
    const store = storage();
    const second: SubmittedCommand = {
      event: 'game:start',
      request: { commandId: 'other-tab', expectedRevision: 99 },
    };
    expect(claimOutbox(store, 'seat', envelope)).toEqual(envelope);
    expect(claimOutbox(store, 'seat', second)).toEqual(envelope);
    expect(readOutbox(store, 'seat')).toEqual(envelope);
    clearOutbox(store, 'seat', envelope.request.commandId);
    claimOutbox(store, 'seat', second);
    expect(clearOutbox(store, 'seat', envelope.request.commandId)).toEqual(second);
    expect(readOutbox(store, 'seat')).toEqual(second);
  });
  it('keeps start and abort retries as their original event', () => {
    const store = storage();
    const abort: SubmittedCommand = {
      event: 'game:abort',
      request: { commandId: 'abort', expectedRevision: 8, matchId: 'match' },
    };
    claimOutbox(store, 'seat', abort);
    expect(readOutbox(store, 'seat')).toEqual(abort);
  });
  it.each([
    '{',
    '{"event":"other","request":{}}',
    '{"event":"game:start","request":{"commandId":"x","expectedRevision":-1}}',
  ])('fails closed for corrupt stored request %s', (value) => {
    const store = storage();
    store.setItem('seat', value);
    expect(() => readOutbox(store, 'seat')).toThrow();
  });
});

describe('private view ordering', () => {
  const current = {
    matchId: 'match',
    ownSeatId: 'me',
    roomCode: 'ABCDEF',
    revision: 9,
    deliverySequence: 40,
  } as GameView;
  it('ignores older game revisions even with later presence sequence', () => {
    expect(
      acceptsGame(current, { ...current, revision: 8, deliverySequence: 900 }, 'ABCDEF', 'me'),
    ).toBe(false);
  });
  it('accepts same-revision presence only in order', () => {
    expect(acceptsGame(current, { ...current, deliverySequence: 41 }, 'ABCDEF', 'me')).toBe(true);
    expect(acceptsGame(current, { ...current, deliverySequence: 39 }, 'ABCDEF', 'me')).toBe(false);
  });
  it('resets the sequence baseline on authenticated attachment, preserving revision floor', () => {
    expect(acceptsGame(current, { ...current, deliverySequence: 1 }, 'ABCDEF', 'me', true)).toBe(
      true,
    );
    expect(
      acceptsGame(current, { ...current, revision: 8, deliverySequence: 1 }, 'ABCDEF', 'me', true),
    ).toBe(false);
  });
  it('rejects foreign room, seat or unsolicited match replacement', () => {
    expect(acceptsGame(current, { ...current, ownSeatId: 'other' }, 'ABCDEF', 'me')).toBe(false);
    expect(acceptsGame(current, { ...current, roomCode: 'OTHER' }, 'ABCDEF', 'me')).toBe(false);
    expect(acceptsGame(current, { ...current, matchId: 'new' }, 'ABCDEF', 'me')).toBe(false);
  });
});

const card = { id: 'missed1', kind: 'missed', rank: '8', suit: 'hearts' } as const;
describe('explicit selection templates', () => {
  const action: GameActionOption = {
    id: 'pick',
    label: 'Choose',
    intent: { type: 'choose', decisionId: 'decision', cardIds: [] },
    selection: { cards: [card, { ...card, id: 'missed2' }], min: 2, max: 2, ordered: true },
  };
  it('preserves submitted order and does not submit placeholder arrays', () => {
    expect(selectedIntent(action, [])).toBeNull();
    expect(selectedIntent(action, ['missed2', 'missed1'])).toEqual({
      type: 'choose',
      decisionId: 'decision',
      cardIds: ['missed2', 'missed1'],
    });
  });
  it('rejects duplicate, foreign, excess and insufficient cards', () => {
    for (const ids of [
      ['missed1'],
      ['missed1', 'missed1'],
      ['missed1', 'foreign'],
      ['missed1', 'missed2', 'foreign'],
    ])
      expect(selectedIntent(action, ids)).toBeNull();
  });
  it('fills Sid payment with exactly two distinct owned IDs', () => {
    const sid: GameActionOption = { ...action, intent: { type: 'sid_heal', cardIds: ['', ''] } };
    expect(selectedIntent(sid, ['missed1', 'missed2'])).toEqual({
      type: 'sid_heal',
      cardIds: ['missed1', 'missed2'],
    });
  });
});

describe('parallel draft, canonical clockwise submission', () => {
  const intent = {
    type: 'respond',
    decisionId: 'provisional',
    method: 'card',
    cardId: card.id,
  } as const;
  const draft = { massEffectId: 'mass1', guard: 'defense1', intent };
  const preparation: MassResponsePreparation = {
    massEffectId: 'mass1',
    guard: 'defense1',
    seatId: 'me',
    isCurrent: false,
    actions: [{ id: 'respond', label: 'Мимо!', intent }],
  };
  it('does not submit a future responder or an unresolved decision', () => {
    expect(commitPreparation(draft, preparation, 'fresh')).toBeNull();
    expect(commitPreparation(draft, { ...preparation, isCurrent: true }, undefined)).toBeNull();
  });
  it('uses the fresh canonical decision ID when current, with no old revision bypass', () => {
    expect(commitPreparation(draft, { ...preparation, isCurrent: true }, 'fresh')).toEqual({
      ...intent,
      decisionId: 'fresh',
    });
  });
  it('requires re-prompt after defense context/effect/options change', () => {
    expect(
      commitPreparation(draft, { ...preparation, isCurrent: true, guard: 'changed' }, 'fresh'),
    ).toBeNull();
    expect(
      commitPreparation(draft, { ...preparation, isCurrent: true, massEffectId: 'mass2' }, 'fresh'),
    ).toBeNull();
    expect(
      commitPreparation(draft, { ...preparation, isCurrent: true, actions: [] }, 'fresh'),
    ).toBeNull();
  });
});
