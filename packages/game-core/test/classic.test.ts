import { describe, expect, it } from 'vitest';
import {
  canStartClassicMatch,
  getClassicRoleDistribution,
  isClassicPlayerCount,
} from '../src/index.js';

describe('classic role composition', () => {
  it.each([
    [4, 0, 2],
    [5, 1, 2],
    [6, 1, 3],
    [7, 2, 3],
  ])('assigns the official roles for %i players', (players, deputies, outlaws) => {
    const roles = getClassicRoleDistribution(players);
    expect(roles).toHaveLength(players);
    expect(roles.filter((role) => role === 'sheriff')).toHaveLength(1);
    expect(roles.filter((role) => role === 'renegade')).toHaveLength(1);
    expect(roles.filter((role) => role === 'deputy')).toHaveLength(deputies);
    expect(roles.filter((role) => role === 'outlaw')).toHaveLength(outlaws);
  });

  it.each([0, 3, 8, 4.5, NaN, Infinity])('rejects unsupported player count %s', (players) => {
    expect(isClassicPlayerCount(players)).toBe(false);
    expect(() => getClassicRoleDistribution(players)).toThrow(RangeError);
  });
});

describe('classic match start condition', () => {
  it.each([4, 5, 6, 7])('allows %i ready players', (players) => {
    expect(canStartClassicMatch(Array.from({ length: players }, () => true))).toBe(true);
  });

  it.each([0, 1, 3, 8])('rejects %i ready players', (players) => {
    expect(canStartClassicMatch(Array.from({ length: players }, () => true))).toBe(false);
  });

  it('requires every seated player to be ready', () => {
    expect(canStartClassicMatch([true, true, true, false])).toBe(false);
  });
});
