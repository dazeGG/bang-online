import type {
  GameAbortRequest,
  GameActionOption,
  GameCommandRequest,
  GameIntent,
  GameStartRequest,
  GameView,
  MassResponsePreparation,
} from '@bang/contracts';

export type SubmittedCommand =
  | { event: 'game:start'; request: GameStartRequest }
  | { event: 'game:command'; request: GameCommandRequest }
  | { event: 'game:abort'; request: GameAbortRequest };

export interface PreparedResponse {
  massEffectId: string;
  guard: string;
  intent: GameIntent;
}

export const outboxKey = (roomCode: string, seatId: string) => `bang:command:${roomCode}:${seatId}`;

export function claimOutbox(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  key: string,
  envelope: SubmittedCommand,
): SubmittedCommand {
  const existing = readOutbox(storage, key);
  if (existing) return existing;
  storage.setItem(key, JSON.stringify(envelope));
  return envelope;
}

export function clearOutbox(
  storage: Pick<Storage, 'getItem' | 'removeItem'>,
  key: string,
  commandId: string,
): SubmittedCommand | null {
  const existing = readOutbox(storage, key);
  if (existing?.request.commandId !== commandId) return existing;
  storage.removeItem(key);
  return null;
}

/** Only submitted envelopes survive reload; local defense drafts never enter storage. */
export function readOutbox(
  storage: Pick<Storage, 'getItem'>,
  key: string,
): SubmittedCommand | null {
  const raw: unknown = JSON.parse(storage.getItem(key) ?? 'null');
  if (raw === null) return null;
  if (typeof raw !== 'object' || !('event' in raw) || !('request' in raw))
    throw Error('invalid_outbox');
  const request = raw.request;
  if (
    typeof request !== 'object' ||
    request === null ||
    !('commandId' in request) ||
    typeof request.commandId !== 'string' ||
    !request.commandId ||
    !('expectedRevision' in request) ||
    !Number.isSafeInteger(request.expectedRevision) ||
    Number(request.expectedRevision) < 0
  )
    throw Error('invalid_outbox');
  if (raw.event !== 'game:start' && raw.event !== 'game:command' && raw.event !== 'game:abort')
    throw Error('invalid_outbox');
  if (
    raw.event !== 'game:start' &&
    (!('matchId' in request) || typeof request.matchId !== 'string')
  )
    throw Error('invalid_outbox');
  if (
    raw.event === 'game:command' &&
    (!('intent' in request) || typeof request.intent !== 'object' || request.intent === null)
  )
    throw Error('invalid_outbox');
  // Server performs complete intent validation. Preserve the exact envelope, never repair it.
  return raw as SubmittedCommand;
}

export function acceptsGame(
  current: GameView | null,
  next: GameView,
  roomCode: string,
  seatId: string,
  attachment = false,
) {
  if (next.roomCode !== roomCode || next.ownSeatId !== seatId) return false;
  if (!current) return true;
  if (next.matchId !== current.matchId) return attachment;
  return (
    next.revision > current.revision ||
    (next.revision === current.revision &&
      (attachment || next.deliverySequence > current.deliverySequence))
  );
}

export function selectedIntent(
  action: GameActionOption,
  cardIds: readonly string[],
): GameIntent | null {
  if (!action.selection) return action.intent;
  if (
    cardIds.length < action.selection.min ||
    cardIds.length > action.selection.max ||
    new Set(cardIds).size !== cardIds.length ||
    cardIds.some((id) => !action.selection?.cards.some((card) => card.id === id))
  )
    return null;
  if (action.intent.type === 'choose') return { ...action.intent, cardIds: [...cardIds] };
  if (action.intent.type === 'sid_heal' && cardIds.length === 2)
    return { type: 'sid_heal', cardIds: [cardIds[0]!, cardIds[1]!] };
  return null;
}

function samePreparedIntent(a: GameIntent, b: GameIntent) {
  if (a.type !== 'respond' || b.type !== 'respond') return false;
  return (
    a.method === b.method && (a.method !== 'card' || (b.method === 'card' && a.cardId === b.cardId))
  );
}

export function commitPreparation(
  draft: PreparedResponse,
  preparation: MassResponsePreparation | null,
  decisionId: string | undefined,
): GameIntent | null {
  if (
    !preparation?.isCurrent ||
    !decisionId ||
    preparation.massEffectId !== draft.massEffectId ||
    preparation.guard !== draft.guard
  )
    return null;
  const action = preparation.actions.find((candidate) =>
    samePreparedIntent(candidate.intent, draft.intent),
  );
  if (action?.intent.type !== 'respond') return null;
  return { ...action.intent, decisionId };
}
