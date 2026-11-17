import type {
  CoreGameView,
  CreateMatchInput,
  GameIntent,
  GameStatus,
  RandomSource,
  TransitionResult,
} from '@bang/game-core';
import type { GameEngine } from '../src/game-store.js';

/** Deliberately synthetic engine: tests storage/transport, never proves classic rules. */
export interface FixtureState {
  matchId: string;
  revision: number;
  status: GameStatus;
  input: CreateMatchInput;
  entropy: number[];
  current: number;
  privateCanary: string;
}

export const fixtureEngine: GameEngine<FixtureState> = {
  createMatch(input: CreateMatchInput, random: RandomSource): FixtureState {
    return {
      matchId: input.matchId,
      revision: 1,
      status: 'active',
      input,
      entropy: [random.int(100)],
      current: 0,
      privateCanary: 'PRIVATE_DECK_CANARY',
    };
  },
  decodeMatch(raw: unknown): FixtureState {
    if (
      typeof raw !== 'object' ||
      raw === null ||
      !('input' in raw) ||
      !('privateCanary' in raw) ||
      !('revision' in raw) ||
      typeof raw.revision !== 'number'
    )
      throw new Error('Corrupt fixture snapshot.');
    return structuredClone(raw) as FixtureState;
  },
  applyIntent(
    state: FixtureState,
    actor: string,
    intent: GameIntent,
    random: RandomSource,
  ): TransitionResult<FixtureState> {
    if (state.input.participants[state.current]?.seatId !== actor)
      return { ok: false, error: 'wrong_actor' };
    if (intent.type !== 'end_turn') return { ok: false, error: 'illegal_card' };
    return {
      ok: true,
      state: {
        ...state,
        revision: state.revision + 1,
        current: (state.current + 1) % state.input.participants.length,
        entropy: [...state.entropy, random.int(100)],
      },
      publicResolutions: [],
    };
  },
  abortMatch(state: FixtureState, actor: string): TransitionResult<FixtureState> {
    if (state.input.hostSeatId !== actor) return { ok: false, error: 'forbidden' };
    return {
      ok: true,
      state: { ...state, revision: state.revision + 1, status: 'aborted' },
      publicResolutions: [],
    };
  },
  projectMatch(state: FixtureState, viewer: string): CoreGameView {
    const current = state.input.participants[state.current]!.seatId;
    return {
      matchId: state.matchId,
      rulesetVersion: 'classic-v1',
      revision: state.revision,
      status: state.status,
      hostSeatId: state.input.hostSeatId,
      ownSeatId: viewer,
      ownRole: viewer === state.input.hostSeatId ? 'sheriff' : 'outlaw',
      ownHand: [{ id: `PRIVATE_HAND_${viewer}`, kind: 'bang', suit: 'hearts', rank: 'A' }],
      players: state.input.participants.map((p) => ({
        ...p,
        characterId: 'bart_cassidy',
        hp: 4,
        maxHp: 4,
        alive: true,
        role: p.seatId === state.input.hostSeatId ? 'sheriff' : null,
        handCount: 1,
        equipment: [],
      })),
      turn: { seatId: current, phase: 'play', number: state.revision },
      pending:
        state.status === 'active'
          ? { id: `d-${state.revision}`, kind: 'turn', ownerSeatId: current }
          : null,
      massEffect: null,
      preparation: null,
      actions:
        state.status === 'active' && current === viewer
          ? [{ id: 'end', label: 'End', intent: { type: 'end_turn' } }]
          : [],
      drawPileCount: 76,
      discardTop: null,
      revealedCards: [],
      publicResolutions: [],
      timeoutPolicy: 'wait-for-required-actor',
      outcome:
        state.status === 'aborted' ? { status: 'aborted', winner: null, winnerSeatIds: [] } : null,
    };
  },
};
