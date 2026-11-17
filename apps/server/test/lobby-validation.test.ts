import { ROOM_CODE_PATTERN } from '@bang/contracts';
import { describe, expect, it } from 'vitest';
import {
  generateRoomCode,
  generateSeatToken,
  hashSeatToken,
  parseDisplayName,
  parseRoomCode,
  parseSeatId,
  parseSeatToken,
} from '../src/lobby-validation.js';

describe('display names', () => {
  it('normalizes whitespace and keeps Cyrillic', () => {
    expect(parseDisplayName('  Дикий \t  Билл ')).toBe('Дикий Билл');
  });

  it('counts code points, not UTF-16 units', () => {
    expect(parseDisplayName('🤠'.repeat(24))).toBe('🤠'.repeat(24));
    expect(parseDisplayName('🤠'.repeat(25))).toBeUndefined();
  });

  it.each(['', '   ', 'a'.repeat(25), 'bad\u0000name', 'rtl‮trick', 'zero​width', 42, null])(
    'rejects %j',
    (value) => {
      expect(parseDisplayName(value)).toBeUndefined();
    },
  );
});

describe('room codes and seat credentials', () => {
  it('generates readable room codes that the parser accepts', () => {
    for (let index = 0; index < 200; index += 1) {
      const code = generateRoomCode();
      expect(code).toMatch(ROOM_CODE_PATTERN);
      expect(parseRoomCode(code.toLowerCase())).toBe(code);
    }
  });

  it.each(['', 'ABCDEFGHJ', 'ABCDEFGHJKM', 'ABCDEFGHJ0', 'ABCDEFGHJI', 'ABCDEFGHJL', 7])(
    'rejects room code %j',
    (value) => {
      expect(parseRoomCode(value)).toBeUndefined();
    },
  );

  it('generates unique 256-bit seat tokens and stores only a 32-byte digest', () => {
    const tokens = new Set(Array.from({ length: 100 }, generateSeatToken));
    expect(tokens.size).toBe(100);
    for (const token of tokens) {
      expect(parseSeatToken(token)).toBe(token);
      expect(Buffer.from(token, 'base64url')).toHaveLength(32);
      expect(hashSeatToken(token)).toHaveLength(32);
      expect(hashSeatToken(token).toString('base64url')).not.toBe(token);
    }
  });

  it.each(['short', 'x'.repeat(43) + '=', 'a'.repeat(42) + '!', {}, undefined])(
    'rejects malformed seat token %j',
    (value) => {
      expect(parseSeatToken(value)).toBeUndefined();
    },
  );

  it('accepts only canonical lowercase UUID seat ids', () => {
    expect(parseSeatId('3f2504e0-4f89-41d3-9a0c-0305e82c3301')).toBeDefined();
    expect(parseSeatId('3F2504E0-4F89-41D3-9A0C-0305E82C3301')).toBeUndefined();
    expect(parseSeatId("x' OR 1=1 --")).toBeUndefined();
  });
});
