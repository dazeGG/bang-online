import type { CoreGameView, MassResponsePreparation, PublicDecision } from './api.js';
import type { DefenseDecision, MatchState } from './model.js';
import { defenseActions, legalActions } from './legal-actions.js';
import { player } from './mechanics.js';
import { assertMatch } from './invariants.js';

function preparation(state: MatchState, viewer: string): MassResponsePreparation | null {
  const mass = state.massEffect;
  if (!mass || !mass.order.includes(viewer) || mass.resolvedSeatIds.includes(viewer)) return null;
  const actor = player(state, viewer);
  if (!actor.alive) return null;
  const current =
    state.pending?.kind === 'mass_response' && state.pending.ownerSeatId === viewer
      ? state.pending
      : null;
  if (mass.currentSeatId === viewer && current === null) return null;
  // Preparation is not authority. The current real decision ID is substituted at submission.
  const defense: DefenseDecision = current ?? {
    id: 'prepared',
    kind: 'mass_response',
    ownerSeatId: viewer,
    sourceSeatId: mass.sourceSeatId,
    requirement: mass.kind === 'indians' ? 'bang' : 'missed',
    remaining: 1,
    barrelUsed: false,
    innateUsed: false,
    duelOtherSeatId: null,
  };
  const guard = JSON.stringify({
    hand: actor.hand.map((card) => card.id).sort(),
    equipment: actor.equipment.map((card) => card.id).sort(),
    character: actor.characterId,
    requirement: defense.requirement,
    remaining: defense.remaining,
    barrelUsed: defense.barrelUsed,
    innateUsed: defense.innateUsed,
  });
  return {
    massEffectId: mass.massEffectId,
    seatId: viewer,
    isCurrent: current !== null,
    guard,
    actions: defenseActions(actor, defense),
  };
}

export function projectMatch(state: MatchState, viewerSeatId: string): CoreGameView {
  assertMatch(state);
  const viewer = player(state, viewerSeatId);
  const current = state.pending;
  const pending: PublicDecision | null =
    current === null
      ? null
      : {
          id: current.id,
          kind: current.kind,
          ownerSeatId: current.ownerSeatId,
          ...(current.sourceSeatId === undefined ? {} : { sourceSeatId: current.sourceSeatId }),
          ...(current.sourceCard === undefined ? {} : { sourceCard: current.sourceCard }),
          ...('remaining' in current ? { requiredResponses: current.remaining } : {}),
        };
  const view: CoreGameView = {
    matchId: state.matchId,
    rulesetVersion: state.rulesetVersion,
    revision: state.revision,
    status: state.status,
    hostSeatId: state.hostSeatId,
    ownSeatId: viewerSeatId,
    ownRole: viewer.role,
    ownHand: viewer.hand,
    players: state.players.map((actor) => ({
      seatId: actor.seatId,
      name: actor.name,
      seatIndex: actor.seatIndex,
      characterId: actor.characterId,
      hp: actor.hp,
      maxHp: actor.maxHp,
      alive: actor.alive,
      role: actor.role === 'sheriff' || !actor.alive ? actor.role : null,
      handCount: actor.hand.length,
      equipment: actor.equipment,
    })),
    turn: { seatId: state.turn.seatId, phase: state.turn.phase, number: state.turn.number },
    pending,
    massEffect: state.massEffect,
    preparation: preparation(state, viewerSeatId),
    actions: legalActions(state, viewerSeatId),
    drawPileCount: state.deck.length,
    discardTop: state.discard.at(-1) ?? null,
    revealedCards:
      current?.kind === 'general_store' || current?.kind === 'lucky_duke' ? current.cards : [],
    publicResolutions: state.publicResolutions,
    timeoutPolicy: state.timeoutPolicy,
    outcome: state.outcome,
  };
  return JSON.parse(JSON.stringify(view)) as CoreGameView;
}
