import { CLASSIC_RULESET_ID } from '@bang/game-core';
import type {
  GameView,
  RoomStatus,
  GameStartRequest,
  GameCommandRequest,
  GameAbortRequest,
  GameSyncRequest,
  GameCommandResult,
  GameSyncResult,
} from './game.js';
import { PROTOCOL_VERSION } from './game.js';
export * from './game.js';

export { CLASSIC_PLAYER_LIMITS, CLASSIC_RULESET_ID, canStartClassicMatch } from '@bang/game-core';

export interface HealthResponse {
  status: 'ok';
  service: 'bang-server';
  rulesetId: typeof CLASSIC_RULESET_ID;
}

export interface ServerInfo {
  protocolVersion: typeof PROTOCOL_VERSION;
  rulesetId: typeof CLASSIC_RULESET_ID;
  minPlayers: number;
  maxPlayers: number;
}

/** Public invitation code alphabet: no 0/O, 1/I/L to keep codes readable aloud. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;
/** Existing 10-character invitations stay valid; only new rooms use the shorter format. */
export const ROOM_CODE_PATTERN =
  /^(?:[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}|[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{10})$/;
export const DISPLAY_NAME_MAX_LENGTH = 24;

export type LobbyErrorCode =
  | 'invalid_request'
  | 'invalid_name'
  | 'name_taken'
  | 'room_not_found'
  | 'room_full'
  | 'room_closed'
  | 'invalid_session'
  | 'not_attached'
  | 'forbidden'
  | 'unavailable';

export interface LobbySeatView {
  /** Public seat identifier. It is not a credential. */
  seatId: string;
  seatIndex: number;
  name: string;
  ready: boolean;
  host: boolean;
  connected: boolean;
}

/** The lobby view is identical for every seat in the room; it contains no secrets. */
export interface LobbyView {
  roomCode: string;
  rulesetId: typeof CLASSIC_RULESET_ID;
  status: RoomStatus;
  /** Monotonic room revision. Presence updates may repeat the same revision. */
  revision: number;
  minPlayers: number;
  maxPlayers: number;
  seats: LobbySeatView[];
  canStart: boolean;
}

export interface RoomPreview {
  roomCode: string;
  status: RoomStatus;
  seatCount: number;
  maxPlayers: number;
  joinable: boolean;
}

export interface CreateRoomRequest {
  name: string;
}

export interface JoinRoomRequest {
  name: string;
}

/** Returned once on create/join. `seatToken` is the only proof of seat ownership. */
export interface SeatCredentials {
  roomCode: string;
  seatId: string;
  seatToken: string;
}

export interface ErrorResponse {
  error: LobbyErrorCode;
}

export interface LobbyAttachRequest {
  roomCode: string;
  seatToken: string;
}

export type LobbyResult =
  | { ok: true; seatId: string; lobby: LobbyView; game?: GameView }
  | { ok: false; error: LobbyErrorCode };

export type RoomView =
  | { status: 'lobby'; lobby: LobbyView }
  | { status: 'active' | 'finished' | 'aborted'; game: GameView };

export type LobbyCommandResult = { ok: true } | { ok: false; error: LobbyErrorCode };

export type LobbyClosedReason = 'left' | 'kicked';

export interface ServerToClientEvents {
  'game:state': (game: GameView) => void;
  'server:info': (info: ServerInfo) => void;
  'lobby:state': (lobby: LobbyView) => void;
  /** The attached seat no longer exists; the stored seat token is now useless. */
  'lobby:closed': (event: { reason: LobbyClosedReason }) => void;
}

export interface ClientToServerEvents {
  'game:start': (request: GameStartRequest, ack: (result: GameCommandResult) => void) => void;
  'game:command': (request: GameCommandRequest, ack: (result: GameCommandResult) => void) => void;
  'game:sync': (request: GameSyncRequest, ack: (result: GameSyncResult) => void) => void;
  'game:abort': (request: GameAbortRequest, ack: (result: GameCommandResult) => void) => void;
  'client:ping': (ack: (result: { serverTime: string }) => void) => void;
  /** Authenticates a seat token and performs a full lobby resynchronization. */
  'lobby:attach': (request: LobbyAttachRequest, ack: (result: LobbyResult) => void) => void;
  'lobby:set-ready': (
    request: { ready: boolean },
    ack: (result: LobbyCommandResult) => void,
  ) => void;
  'lobby:leave': (ack: (result: LobbyCommandResult) => void) => void;
  'lobby:kick': (request: { seatId: string }, ack: (result: LobbyCommandResult) => void) => void;
}
