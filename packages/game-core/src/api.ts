import type { ClassicRole } from './index.js';
import type { CardInstance, CardFace, CharacterId } from './catalog.js';

export interface RandomSource {
  /** Uniform integer in [0, maxExclusive). Production injects crypto.randomInt. */
  int(maxExclusive: number): number;
}

export interface MatchParticipant {
  seatId: string;
  name: string;
  seatIndex: number;
}

export interface CreateMatchInput {
  matchId: string;
  participants: readonly MatchParticipant[];
  hostSeatId: string;
  rulesetVersion: 'classic-v1';
}

export type GameIntent =
  | { type: 'draw'; source: 'deck' | 'discard' }
  | { type: 'draw'; source: 'opponent'; targetSeatId: string }
  | {
      type: 'play';
      cardId: string;
      targetSeatId?: string;
      zone?: 'hand' | 'equipment';
      targetCardId?: string;
    }
  | { type: 'end_turn' }
  | { type: 'respond'; decisionId: string; method: 'card'; cardId: string }
  | { type: 'respond'; decisionId: string; method: 'barrel' | 'innate' | 'decline' }
  | { type: 'choose'; decisionId: string; cardIds: string[] }
  | { type: 'sid_heal'; cardIds: [string, string] };

/** A selection action is a template: replace choose/sid cardIds before submission. */
export interface GameActionOption {
  id: string;
  label: string;
  intent: GameIntent;
  selection?: {
    cards: readonly CardInstance[];
    min: number;
    max: number;
    ordered: boolean;
  };
}

export type GamePhase = 'checks' | 'draw' | 'play' | 'discard';
export type GameStatus = 'active' | 'finished' | 'aborted';
export type DecisionKind =
  | 'turn'
  | 'defend'
  | 'duel'
  | 'mass_response'
  | 'general_store'
  | 'kit_carlson'
  | 'lucky_duke'
  | 'draw_choice'
  | 'target_card'
  | 'rescue'
  | 'elimination_discard'
  | 'turn_discard';

export interface PublicDecision {
  id: string;
  kind: DecisionKind;
  ownerSeatId: string;
  sourceSeatId?: string;
  sourceCard?: CardFace;
  requiredResponses?: number;
}

export interface MassEffectProgress {
  massEffectId: string;
  kind: 'gatling' | 'indians';
  sourceSeatId: string;
  /** Canonical clockwise order, starting after the source player. */
  order: readonly string[];
  resolvedSeatIds: readonly string[];
  currentSeatId: string | null;
}

/** Own-only options for a local draft; no reservation, consumption or RNG. */
export interface MassResponsePreparation {
  massEffectId: string;
  seatId: string;
  isCurrent: boolean;
  /** Changes whenever own available defense context changes; compare by equality. */
  guard: string;
  actions: readonly GameActionOption[];
}

export interface PublicPlayerView extends MatchParticipant {
  characterId: CharacterId;
  hp: number;
  maxHp: number;
  alive: boolean;
  role: ClassicRole | null;
  handCount: number;
  equipment: readonly CardInstance[];
}

/** Historical face only: never an instance ID or a claim of current ownership. */
export interface PublicResolution {
  revision: number;
  ordinal: number;
  kind:
    | 'played'
    | 'check'
    | 'black_jack_reveal'
    | 'damage'
    | 'healed'
    | 'eliminated'
    | 'discarded'
    | 'mass_resolved';
  actorSeatId: string;
  targetSeatId?: string;
  card?: CardFace;
  amount?: number;
}

export type MatchOutcome =
  | {
      status: 'finished';
      winner: 'sheriff_deputies' | 'outlaws' | 'renegade';
      winnerSeatIds: readonly string[];
    }
  | { status: 'aborted'; winner: null; winnerSeatIds: readonly [] };

export const PUBLIC_RESOLUTION_LIMIT = 64;
export const MATCH_TIMEOUT_POLICY = 'wait-for-required-actor' as const;

/** Per-seat projection. No other hands, hidden roles, deck order or credentials. */
export interface CoreGameView {
  matchId: string;
  rulesetVersion: 'classic-v1';
  revision: number;
  status: GameStatus;
  hostSeatId: string;
  ownSeatId: string;
  ownRole: ClassicRole;
  ownHand: readonly CardInstance[];
  players: readonly PublicPlayerView[];
  turn: { seatId: string; phase: GamePhase; number: number };
  pending: PublicDecision | null;
  massEffect: MassEffectProgress | null;
  preparation: MassResponsePreparation | null;
  /** Current actor's legal actions plus this viewer's optional Sid interrupt. */
  actions: readonly GameActionOption[];
  drawPileCount: number;
  discardTop: CardInstance | null;
  /** Public Store/check pools; Kit's cards appear only in own selection options. */
  revealedCards: readonly CardInstance[];
  publicResolutions: readonly PublicResolution[];
  timeoutPolicy: typeof MATCH_TIMEOUT_POLICY;
  outcome: MatchOutcome | null;
}

export type RuleError =
  | 'invalid_intent'
  | 'invalid_state'
  | 'wrong_actor'
  | 'invalid_decision'
  | 'illegal_card'
  | 'illegal_target'
  | 'illegal_choice'
  | 'match_ended'
  | 'forbidden'
  | 'resource_unavailable';

export type TransitionResult<State> =
  | { ok: true; state: State; publicResolutions: readonly PublicResolution[] }
  | { ok: false; error: RuleError };
