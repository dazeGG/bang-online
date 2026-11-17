import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHARACTER_ALIASES, CLASSIC_CHARACTERS, CLASSIC_DECK } from '../src/index.js';

// Reviewed publisher facts, stored separately from the implementation catalog.
const facts = JSON.parse(
  readFileSync(new URL('./fixtures/classic-catalog.json', import.meta.url), 'utf8'),
) as {
  cards: { kind: string; suit: string; rank: string }[];
  characters: { id: string; maxHp: number }[];
  verification: { kindCounts: Record<string, number>; suitCounts: Record<string, number> };
};
const faces = (cards: readonly { kind: string; suit: string; rank: string }[]) =>
  cards.map(({ kind, suit, rank }) => `${kind}/${suit}/${rank}`).sort();

describe('source-backed classic inventory', () => {
  it('matches every physical publisher card, not merely the aggregate size', () => {
    expect(CLASSIC_DECK).toHaveLength(80);
    expect(new Set(CLASSIC_DECK.map((card) => card.id)).size).toBe(80);
    expect(faces(CLASSIC_DECK)).toEqual(faces(facts.cards));
    for (const [kind, count] of Object.entries(facts.verification.kindCounts)) {
      expect(CLASSIC_DECK.filter((card) => card.kind === kind)).toHaveLength(count);
    }
    for (const [suit, count] of Object.entries(facts.verification.suitCounts)) {
      expect(CLASSIC_DECK.filter((card) => card.suit === suit)).toHaveLength(count);
    }
    const copies = CLASSIC_DECK.filter((card) => card.kind === 'stagecoach');
    expect(copies.map(({ suit, rank }) => ({ suit, rank }))).toEqual([
      { suit: 'spades', rank: '9' },
      { suit: 'spades', rank: '9' },
    ]);
    expect(copies[0]?.id).not.toBe(copies[1]?.id);
  });

  it('matches all sixteen character health values and canonical Cassidy identity', () => {
    expect(CLASSIC_CHARACTERS).toHaveLength(16);
    expect(new Set(CLASSIC_CHARACTERS.map((character) => character.id)).size).toBe(16);
    expect(CLASSIC_CHARACTERS.map(({ id, maxHp }) => ({ id, maxHp }))).toEqual(
      facts.characters.map(({ id, maxHp }) => ({ id, maxHp })),
    );
    expect(CHARACTER_ALIASES.burt_cassidy).toBe('bart_cassidy');
    expect(
      CLASSIC_CHARACTERS.every(({ ability, source }) => ability.length > 0 && source.length > 0),
    ).toBe(true);
  });
});
