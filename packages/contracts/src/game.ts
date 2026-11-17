import type { CoreGameView, GameIntent, GameStatus, RuleError } from '@bang/game-core';

export type {
  CoreGameView,
  GameIntent,
  GameActionOption,
  GamePhase,
  DecisionKind,
  PublicDecision,
  PublicPlayerView,
  PublicResolution,
  MatchOutcome,
  MassEffectProgress,
  MassResponsePreparation,
  CardFace,
  CardInstance,
  CardKind,
  CardSuit,
  CardRank,
  CharacterId,
} from '@bang/game-core';
export const PROTOCOL_VERSION = 3 as const;
export type RoomStatus = 'lobby' | GameStatus;

export interface GamePresence {
  seatId: string;
  connected: boolean;
}

export interface GameView extends CoreGameView {
  roomCode: string;
  presence: readonly GamePresence[];
  /** Only required actors whose absence currently prevents authoritative progress. */
  waitingFor: readonly string[];
  /** Increases for every delivery, including presence changes at the same revision. */
  deliverySequence: number;
}

export interface GameStartRequest {
  commandId: string;
  /** Room revision, unlike every other game command. */
  expectedRevision: number;
}

export interface GameCommandBase {
  commandId: string;
  expectedRevision: number;
  matchId: string;
}

export interface GameCommandRequest extends GameCommandBase {
  intent: GameIntent;
}

export type GameAbortRequest = GameCommandBase;
export interface GameSyncRequest {
  matchId?: string;
}

export type GameErrorCode =
  | RuleError
  | 'invalid_request'
  | 'not_attached'
  | 'unavailable'
  | 'room_not_found'
  | 'room_closed'
  | 'not_ready'
  | 'stale_revision'
  | 'command_conflict'
  | 'match_not_found';

/** Durable retry receipts contain no historical private projection. */
export type GameCommandResult =
  | { ok: true; commandId: string; revision: number; matchId: string; status: GameStatus }
  | { ok: false; error: GameErrorCode; commandId?: string; revision?: number; matchId?: string };

export type GameSyncResult = { ok: true; game: GameView } | { ok: false; error: GameErrorCode };
