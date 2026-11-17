import type { ClassicRole } from './index.js';
import type { CardInstance, CharacterId } from './catalog.js';
import type {
  GamePhase,
  GameStatus,
  MatchOutcome,
  MatchParticipant,
  PublicDecision,
  PublicResolution,
} from './api.js';

export interface PlayerState extends MatchParticipant {
  role: ClassicRole;
  characterId: CharacterId;
  hp: number;
  maxHp: number;
  alive: boolean;
  hand: CardInstance[];
  equipment: CardInstance[];
}

export interface DefenseDecision extends PublicDecision {
  kind: 'defend' | 'mass_response' | 'duel';
  sourceSeatId: string;
  requirement: 'bang' | 'missed';
  remaining: number;
  barrelUsed: boolean;
  innateUsed: boolean;
  duelOtherSeatId: string | null;
}
export type CheckPurpose =
  | { type: 'defense'; defense: DefenseDecision }
  | { type: 'dynamite'; ownerSeatId: string }
  | { type: 'jail'; ownerSeatId: string };
export type PendingDecision =
  | DefenseDecision
  | (PublicDecision & { kind: 'turn' | 'draw_choice' })
  | (PublicDecision & {
      kind: 'kit_carlson' | 'lucky_duke';
      cards: CardInstance[];
      check: CheckPurpose | null;
    })
  | (PublicDecision & { kind: 'general_store'; cards: CardInstance[]; remainingSeatIds: string[] })
  | (PublicDecision & { kind: 'rescue'; damage: DamageTask })
  | (PublicDecision & {
      kind: 'turn_discard' | 'elimination_discard';
      count: number;
      includeEquipment: boolean;
    });

export interface DamageTask {
  type: 'damage';
  seatId: string;
  sourceSeatId: string | null;
  amount: number;
}
export type EffectTask =
  | { type: 'start_turn'; seatId: string }
  | { type: 'jail_check'; seatId: string }
  | { type: 'draw_phase'; seatId: string }
  | { type: 'resume_play' }
  | { type: 'next_turn' }
  | { type: 'mass_next' }
  | DamageTask
  | { type: 'after_damage'; damage: DamageTask }
  | { type: 'kill_consequences'; seatId: string; sourceSeatId: string | null };

export interface MassState {
  massEffectId: string;
  kind: 'gatling' | 'indians';
  sourceSeatId: string;
  order: string[];
  resolvedSeatIds: string[];
  currentSeatId: string | null;
}

/** Entirely serializable private state. Cards occur in exactly one ownership zone. */
export interface MatchState {
  schemaVersion: 1;
  rulesetVersion: 'classic-v1';
  catalogVersion: string;
  matchId: string;
  revision: number;
  status: GameStatus;
  hostSeatId: string;
  timeoutPolicy: 'wait-for-required-actor';
  players: PlayerState[];
  deck: CardInstance[];
  discard: CardInstance[];
  turn: { seatId: string; phase: GamePhase; number: number; bangsPlayed: number };
  pending: PendingDecision | null;
  tasks: EffectTask[];
  massEffect: MassState | null;
  outcome: MatchOutcome | null;
  publicResolutions: PublicResolution[];
  decisionSerial: number;
}
