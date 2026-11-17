import { describe, expect, it } from 'vitest';
import { parseInvitation, parseRoomPath, roomPath } from '../src/navigation.js';

describe('room invitations', () => {
  it('creates short paths for both new and existing rooms', () => {
    expect(roomPath('K7M4RW')).toBe('/r/K7M4RW');
    expect(roomPath('ABCDEFGHJK')).toBe('/r/ABCDEFGHJK');
  });

  it.each(['/r/K7M4RW', '/r/k7m4rw/', '/room/K7M4RW'])('opens %s', (path) => {
    expect(parseRoomPath(path)).toBe('K7M4RW');
  });

  it.each(['/room/ABCDEFGHJK', '/r/ABCDEFGHJK/'])('preserves legacy invitation %s', (path) => {
    expect(parseRoomPath(path)).toBe('ABCDEFGHJK');
  });

  it.each([
    'k7m4rw',
    ' K7M4RW ',
    'https://bang.dazinho.ru/r/K7M4RW',
    'https://bang.dazinho.ru/r/K7M4RW/?from=friend#join',
    '/r/K7M4RW',
  ])('accepts pasted invitation %s', (value) => {
    expect(parseInvitation(value)).toBe('K7M4RW');
  });

  it('accepts existing links and codes', () => {
    expect(parseInvitation('https://bang.dazinho.ru/room/ABCDEFGHJK')).toBe('ABCDEFGHJK');
    expect(parseInvitation('abcdefghjk')).toBe('ABCDEFGHJK');
  });

  it.each([
    '',
    '/r/K7M4RW/extra',
    '/other/K7M4RW',
    '/r/ABCDEF2',
    '/r/ABCDEF23',
    '/r/ABCDEF234',
    '/r/ABCD01',
    'javascript:alert(1)',
    'https://',
  ])('rejects malformed invitation %s', (value) => {
    expect(parseInvitation(value)).toBeNull();
  });
});
