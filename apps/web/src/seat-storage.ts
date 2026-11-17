/**
 * Seat credentials live in localStorage per room so a refresh, a new tab, or a browser
 * restart on the same device returns to the same seat. The token never enters the URL.
 */
export interface StoredSeat {
  seatId: string;
  seatToken: string;
}

const seatKey = (roomCode: string) => `bang:seat:${roomCode}`;
const NAME_KEY = 'bang:name';

export function loadSeat(roomCode: string): StoredSeat | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(seatKey(roomCode)) ?? 'null');
    if (
      typeof value === 'object' &&
      value !== null &&
      'seatId' in value &&
      'seatToken' in value &&
      typeof value.seatId === 'string' &&
      typeof value.seatToken === 'string'
    ) {
      return { seatId: value.seatId, seatToken: value.seatToken };
    }
  } catch {
    // Storage may be blocked (private mode) or hold corrupted data.
  }
  return null;
}

export function saveSeat(roomCode: string, seat: StoredSeat) {
  try {
    localStorage.setItem(seatKey(roomCode), JSON.stringify(seat));
  } catch {
    // Without storage the seat survives only while this page stays open.
  }
}

export function clearSeat(roomCode: string) {
  try {
    localStorage.removeItem(seatKey(roomCode));
  } catch {
    // Ignore unavailable storage.
  }
}

export function isSeatStorageKey(key: string | null, roomCode: string) {
  return key === null || key === seatKey(roomCode);
}

export function loadLastName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveLastName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // Ignore unavailable storage.
  }
}
