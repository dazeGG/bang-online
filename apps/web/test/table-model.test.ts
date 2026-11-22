import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { GameActionOption, GameView, PublicPlayerView } from '@bang/contracts';
import { GameResult } from '../src/game/GameResult.js';
import { handFan, seatPlacements, tableLayout } from '../src/game/table-layout.js';
import {
  displayedRole,
  primaryActionId,
  seatDistance,
  seatRibbon,
  seatsAroundViewer,
  tablePrompt,
  weaponRange,
} from '../src/game/table-model.js';

function player(seatIndex: number, patch: Partial<PublicPlayerView> = {}): PublicPlayerView {
  return {
    seatId: `s${seatIndex}`,
    name: `P${seatIndex}`,
    seatIndex,
    characterId: 'bart_cassidy',
    hp: 4,
    maxHp: 4,
    alive: true,
    role: null,
    handCount: 3,
    equipment: [],
    ...patch,
  };
}

function view(players: PublicPlayerView[], patch: Partial<GameView> = {}): GameView {
  return {
    matchId: 'm',
    rulesetVersion: 'classic-v1',
    revision: 3,
    status: 'active',
    hostSeatId: 's0',
    ownSeatId: 's2',
    ownRole: 'outlaw',
    ownHand: [],
    players,
    turn: { seatId: 's0', phase: 'play', number: 5 },
    pending: { id: 'd', kind: 'turn', ownerSeatId: 's0' },
    massEffect: null,
    preparation: null,
    actions: [],
    drawPileCount: 40,
    discardTop: null,
    revealedCards: [],
    publicResolutions: [],
    timeoutPolicy: 'wait-for-required-actor',
    outcome: null,
    roomCode: 'ABCDEF',
    presence: players.map(({ seatId }) => ({ seatId, connected: true })),
    waitingFor: [],
    deliverySequence: 1,
    ...patch,
  };
}

const card = (id: string, kind: 'mustang' | 'scope' | 'schofield' | 'winchester') =>
  ({ id, kind, rank: '8', suit: 'hearts' }) as const;

describe('display-only table geometry', () => {
  it('orders opponents clockwise starting after the viewer', () => {
    const game = view([player(3), player(0), player(2), player(1), player(4)]);
    const { me, opponents } = seatsAroundViewer(game);
    expect(me.seatId).toBe('s2');
    expect(opponents.map((entry) => entry.seatId)).toEqual(['s3', 's4', 's0', 's1']);
  });

  it('mirrors the core distance rule over living seats with Mustang, Scope and characters', () => {
    const players = [player(0), player(1), player(2), player(3), player(4), player(5)];
    const game = view(players);
    expect(seatDistance(game, 's2', 's5')).toBe(3);
    expect(seatDistance(game, 's2', 's0')).toBe(2);
    players[0] = player(0, { equipment: [card('m', 'mustang')] });
    expect(seatDistance(view(players), 's2', 's0')).toBe(3);
    players[2] = player(2, { equipment: [card('s', 'scope')], characterId: 'rose_doolan' });
    expect(seatDistance(view(players), 's2', 's1')).toBe(1);
    players[1] = player(1, { characterId: 'paul_regret' });
    expect(seatDistance(view(players), 's2', 's1')).toBe(1);
    // Eliminated seats are skipped.
    players[4] = player(4, { alive: false });
    expect(seatDistance(view(players), 's2', 's5')).toBe(1);
    expect(seatDistance(view(players), 's2', 's4')).toBeNull();
  });

  it('uses the equipped weapon range or the default range of one', () => {
    expect(weaponRange(player(0))).toBe(1);
    expect(weaponRange(player(0, { equipment: [card('w', 'winchester')] }))).toBe(5);
  });

  it.each([
    [1440, 900, 6],
    [1180, 820, 6],
    [844, 390, 6],
    [667, 375, 4],
  ])('keeps %ix%i seats inside the play area', (w, h, count) => {
    const layout = tableLayout(w, h);
    const { seatW, seats } = seatPlacements(layout, count);
    for (const seat of seats) {
      expect(seat.x - seatW / 2).toBeGreaterThanOrEqual(0);
      expect(seat.x + seatW / 2).toBeLessThanOrEqual(layout.playW);
      expect(seat.y).toBeGreaterThan(layout.topH);
      expect(seat.y).toBeLessThan(h - layout.bottomH);
    }
    expect(layout.portrait).toBe(false);
  });

  it('detects an upright phone and overlaps a large hand more', () => {
    expect(tableLayout(390, 844).portrait).toBe(true);
    const layout = tableLayout(844, 390);
    const small = handFan(layout, 3).cards[1]!.marginLeft;
    const large = handFan(layout, 12).cards[1]!.marginLeft;
    expect(large).toBeLessThan(small);
  });
});

describe('table prompts and highlights', () => {
  const attacker = player(0);
  const me = player(2);
  const players = [attacker, player(1), me];

  it('marks the attacking seat and describes the required defense', () => {
    const game = view(players, {
      pending: {
        id: 'x',
        kind: 'defend',
        ownerSeatId: 's2',
        sourceSeatId: 's0',
        requiredResponses: 2,
      },
    });
    expect(seatRibbon(game, attacker)).toEqual({ text: 'Стреляет в вас', tone: 'danger' });
    const prompt = tablePrompt(game);
    expect(prompt.mine).toBe(true);
    expect(prompt.title).toBe('Защититесь от выстрела');
    expect(prompt.sub).toContain('«Мимо!»: 2');
  });

  it('waits without a deadline for another actor', () => {
    const game = view(players);
    expect(tablePrompt(game)).toMatchObject({ mine: false, title: 'Ходит P0' });
    expect(tablePrompt(game).sub).toContain('Время не ограничено');
    expect(seatRibbon(game, attacker)).toEqual({ text: 'Ходит', tone: 'turn' });
  });

  it('announces the automatic discard only for an eliminated owner', () => {
    const discard = (alive: boolean) =>
      view([player(0), player(1, { alive }), me], {
        pending: { id: 'e', kind: 'elimination_discard', ownerSeatId: 's1' },
      });
    expect(tablePrompt(discard(false)).sub).toContain('Через минуту');
    expect(tablePrompt(discard(true)).sub).toContain('Время не ограничено');
  });

  it('prefers free checks, keeps decline and Sid secondary', () => {
    const option = (id: string, intent: GameActionOption['intent']): GameActionOption => ({
      id,
      label: id,
      intent,
    });
    const decline = option('decline', { type: 'respond', decisionId: 'd', method: 'decline' });
    const missed = option('card', {
      type: 'respond',
      decisionId: 'd',
      method: 'card',
      cardId: 'c',
    });
    const barrel = option('barrel', { type: 'respond', decisionId: 'd', method: 'barrel' });
    const sid = option('sid', { type: 'sid_heal', cardIds: ['', ''] });
    expect(primaryActionId([missed, barrel, decline, sid])).toBe('barrel');
    expect(primaryActionId([missed, decline])).toBe('card');
    expect(primaryActionId([decline, sid])).toBe('decline');
    expect(primaryActionId([sid])).toBeNull();
  });
});

describe('terminal result privacy', () => {
  it('shows only public or outcome-implied roles', () => {
    const players = [
      player(0, { role: 'sheriff' }),
      player(1, { name: 'Living deputy?' }),
      player(2, { name: 'Viewer' }),
      player(3, { role: 'outlaw', alive: false }),
    ];
    const outlawsWon = view(players, {
      status: 'finished',
      pending: null,
      outcome: { status: 'finished', winner: 'outlaws', winnerSeatIds: ['s2', 's3'] },
    });
    expect(displayedRole(outlawsWon, players[1]!)).toBeNull();
    expect(displayedRole(outlawsWon, players[2]!)).toBe('outlaw');
    const html = renderToStaticMarkup(createElement(GameResult, { game: outlawsWon }));
    expect(html).toContain('Победа бандитов');
    expect(html).toContain('Роль скрыта');
    expect(html).toContain('5 ходов');
    expect(html).not.toContain('Завершить без победителя');
  });
});
