import { createHash, randomBytes, randomInt } from 'node:crypto';
import {
  DISPLAY_NAME_MAX_LENGTH,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  ROOM_CODE_PATTERN,
} from '@bang/contracts';

/** 32 random bytes encoded as unpadded base64url. */
const SEAT_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function generateRoomCode(): string {
  let code = '';
  for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
    code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

export function generateSeatToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Only the hash is stored, so a database leak does not reveal usable seat tokens. */
export function hashSeatToken(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest();
}

export function parseRoomCode(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const code = value.trim().toUpperCase();
  return ROOM_CODE_PATTERN.test(code) ? code : undefined;
}

export function parseSeatToken(value: unknown): string | undefined {
  return typeof value === 'string' && SEAT_TOKEN_PATTERN.test(value) ? value : undefined;
}

export function parseSeatId(value: unknown): string | undefined {
  return typeof value === 'string' && UUID_PATTERN.test(value) ? value : undefined;
}

/**
 * Normalizes a display name: NFC, collapsed whitespace, no control/format/private-use
 * characters, 1..DISPLAY_NAME_MAX_LENGTH code points.
 */
export function parseDisplayName(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > DISPLAY_NAME_MAX_LENGTH * 8) return undefined;
  const name = value.normalize('NFC').replace(/\s+/gu, ' ').trim();
  if (/[\p{Cc}\p{Cf}\p{Co}\p{Cn}\p{Cs}]/u.test(name)) return undefined;
  const length = [...name].length;
  return length >= 1 && length <= DISPLAY_NAME_MAX_LENGTH ? name : undefined;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
