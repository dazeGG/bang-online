import type {
  GameAbortRequest,
  GameCommandRequest,
  GameIntent,
  GameStartRequest,
  GameSyncRequest,
} from '@bang/contracts';
import { isPlainObject } from './lobby-validation.js';

const id = (value: unknown): value is string =>
  typeof value === 'string' && value.length >= 1 && value.length <= 128 && !/\p{Cc}/u.test(value);
const revision = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const keys = (value: Record<string, unknown>, required: string[], optional: string[] = []) =>
  required.every((key) => Object.hasOwn(value, key)) &&
  Object.keys(value).every((key) => required.includes(key) || optional.includes(key));
const ids = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.length <= 80 &&
  value.every(id) &&
  new Set(value).size === value.length;

export function parseGameIntent(value: unknown): GameIntent | undefined {
  if (!isPlainObject(value)) return undefined;
  switch (value['type']) {
    case 'draw':
      if (
        (value['source'] === 'deck' || value['source'] === 'discard') &&
        keys(value, ['type', 'source'])
      )
        return { type: 'draw', source: value['source'] };
      if (
        value['source'] === 'opponent' &&
        keys(value, ['type', 'source', 'targetSeatId']) &&
        id(value['targetSeatId'])
      )
        return { type: 'draw', source: 'opponent', targetSeatId: value['targetSeatId'] };
      break;
    case 'play': {
      if (
        !keys(value, ['type', 'cardId'], ['targetSeatId', 'zone', 'targetCardId']) ||
        !id(value['cardId'])
      )
        break;
      if (value['targetSeatId'] !== undefined && !id(value['targetSeatId'])) break;
      if (value['zone'] !== undefined && value['zone'] !== 'hand' && value['zone'] !== 'equipment')
        break;
      if (
        value['targetCardId'] !== undefined &&
        (!id(value['targetCardId']) || value['zone'] !== 'equipment')
      )
        break;
      if (value['zone'] !== undefined && value['targetSeatId'] === undefined) break;
      return {
        type: 'play',
        cardId: value['cardId'],
        ...(value['targetSeatId'] === undefined
          ? {}
          : { targetSeatId: value['targetSeatId'] as string }),
        ...(value['zone'] === undefined ? {} : { zone: value['zone'] }),
        ...(value['targetCardId'] === undefined
          ? {}
          : { targetCardId: value['targetCardId'] as string }),
      };
    }
    case 'end_turn':
      if (keys(value, ['type'])) return { type: 'end_turn' };
      break;
    case 'respond':
      if (!id(value['decisionId'])) break;
      if (
        value['method'] === 'card' &&
        keys(value, ['type', 'decisionId', 'method', 'cardId']) &&
        id(value['cardId'])
      )
        return {
          type: 'respond',
          decisionId: value['decisionId'],
          method: 'card',
          cardId: value['cardId'],
        };
      if (
        (value['method'] === 'barrel' ||
          value['method'] === 'innate' ||
          value['method'] === 'decline') &&
        keys(value, ['type', 'decisionId', 'method'])
      )
        return {
          type: 'respond',
          decisionId: value['decisionId'],
          method: value['method'] as 'barrel' | 'innate' | 'decline',
        };
      break;
    case 'choose':
      if (
        keys(value, ['type', 'decisionId', 'cardIds']) &&
        id(value['decisionId']) &&
        ids(value['cardIds'])
      )
        return { type: 'choose', decisionId: value['decisionId'], cardIds: [...value['cardIds']] };
      break;
    case 'sid_heal':
      if (
        keys(value, ['type', 'cardIds']) &&
        ids(value['cardIds']) &&
        value['cardIds'].length === 2
      )
        return { type: 'sid_heal', cardIds: [value['cardIds'][0]!, value['cardIds'][1]!] };
  }
  return undefined;
}

export function parseGameStart(value: unknown): GameStartRequest | undefined {
  return isPlainObject(value) &&
    keys(value, ['commandId', 'expectedRevision']) &&
    id(value['commandId']) &&
    revision(value['expectedRevision'])
    ? { commandId: value['commandId'], expectedRevision: value['expectedRevision'] }
    : undefined;
}

export function parseGameAbort(value: unknown): GameAbortRequest | undefined {
  return isPlainObject(value) &&
    keys(value, ['commandId', 'expectedRevision', 'matchId']) &&
    id(value['commandId']) &&
    revision(value['expectedRevision']) &&
    id(value['matchId'])
    ? {
        commandId: value['commandId'],
        expectedRevision: value['expectedRevision'],
        matchId: value['matchId'],
      }
    : undefined;
}

export function parseGameCommand(value: unknown): GameCommandRequest | undefined {
  if (!isPlainObject(value) || !keys(value, ['commandId', 'expectedRevision', 'matchId', 'intent']))
    return undefined;
  const base = parseGameAbort({
    commandId: value['commandId'],
    expectedRevision: value['expectedRevision'],
    matchId: value['matchId'],
  });
  const intent = parseGameIntent(value['intent']);
  return base !== undefined && intent !== undefined ? { ...base, intent } : undefined;
}

export function parseGameSync(value: unknown): GameSyncRequest | undefined {
  if (
    !isPlainObject(value) ||
    !keys(value, [], ['matchId']) ||
    (value['matchId'] !== undefined && !id(value['matchId']))
  )
    return undefined;
  return value['matchId'] === undefined ? {} : { matchId: value['matchId'] as string };
}
