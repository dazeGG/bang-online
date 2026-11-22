export const CLASSIC_RULESET_ID = 'classic-v1' as const;
export * from './api.js';
export * from './catalog.js';
export {
  createMatch,
  applyIntent,
  abortMatch,
  overdueIntent,
  OVERDUE_DECISION_KINDS,
} from './engine.js';
export { projectMatch } from './projection.js';
export { decodeMatch } from './invariants.js';
export type { MatchState, PlayerState } from './model.js';
export const CLASSIC_PLAYER_LIMITS = { min: 4, max: 7 } as const;

export type ClassicPlayerCount = 4 | 5 | 6 | 7;
export type ClassicRole = 'sheriff' | 'deputy' | 'outlaw' | 'renegade';

const roleDistributions: Record<ClassicPlayerCount, readonly ClassicRole[]> = {
  4: ['sheriff', 'outlaw', 'outlaw', 'renegade'],
  5: ['sheriff', 'deputy', 'outlaw', 'outlaw', 'renegade'],
  6: ['sheriff', 'deputy', 'outlaw', 'outlaw', 'outlaw', 'renegade'],
  7: ['sheriff', 'deputy', 'deputy', 'outlaw', 'outlaw', 'outlaw', 'renegade'],
};

export function isClassicPlayerCount(count: number): count is ClassicPlayerCount {
  return (
    Number.isInteger(count) &&
    count >= CLASSIC_PLAYER_LIMITS.min &&
    count <= CLASSIC_PLAYER_LIMITS.max
  );
}

/** Returns the role composition, never an assigned or shuffled seating order. */
export function getClassicRoleDistribution(count: number): readonly ClassicRole[] {
  if (!isClassicPlayerCount(count)) {
    throw new RangeError('Classic BANG! requires an integer player count between 4 and 7.');
  }

  return [...roleDistributions[count]];
}

/**
 * A classic match may start only with a supported player count where every seated
 * player has confirmed readiness. Waiting lobbies may hold fewer players.
 */
export function canStartClassicMatch(readiness: readonly boolean[]): boolean {
  return isClassicPlayerCount(readiness.length) && readiness.every((ready) => ready);
}
