import { CLASSIC_RULESET_ID } from '@bang/game-core';

export { CLASSIC_PLAYER_LIMITS, CLASSIC_RULESET_ID } from '@bang/game-core';

export interface HealthResponse {
  status: 'ok';
  service: 'bang-server';
  rulesetId: typeof CLASSIC_RULESET_ID;
}

export interface ServerInfo {
  protocolVersion: 1;
  rulesetId: typeof CLASSIC_RULESET_ID;
  minPlayers: number;
  maxPlayers: number;
}

export interface ServerToClientEvents {
  'server:info': (info: ServerInfo) => void;
}

export interface ClientToServerEvents {
  'client:ping': (ack: (result: { serverTime: string }) => void) => void;
}
