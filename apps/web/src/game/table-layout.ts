/**
 * Pure geometry for the full-screen table. The whole table must fit the viewport, so
 * seat positions and the hand fan are computed from the measured size; typography and
 * the remaining sizes use container-query units in game.css.
 */
const clamp = (min: number, value: number, max: number) => Math.max(min, Math.min(max, value));

export interface TableLayout {
  w: number;
  h: number;
  compact: boolean;
  wide: boolean;
  portrait: boolean;
  sideW: number;
  topH: number;
  bottomH: number;
  playW: number;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  seatW: number;
  seatH: number;
  padX: number;
  plaqueW: number;
  actionsW: number;
  cardW: number;
  cardH: number;
  pileW: number;
  oval: { left: number; top: number; width: number; height: number };
}

export function tableLayout(w: number, h: number): TableLayout {
  const compact = h < 560 || w < 900;
  const wide = w >= 1200 && h >= 640;
  const sideW = wide ? Math.min(330, Math.round(w * 0.22)) : 0;
  const topH = compact ? 44 : 58;
  const bottomH = Math.round(compact ? h * 0.36 : Math.min(h * 0.31, 300));
  const playW = w - sideW;
  const playBottom = h - bottomH * 0.5;
  const cx = playW / 2;
  const compactHand = Math.round(Math.min(bottomH * 0.74, 112));
  const cy = compact
    ? (topH + 84 + 14 + (h - 14 - compactHand * 1.07)) / 2
    : topH + (playBottom - topH) * 0.52;
  const rx = playW * 0.41;
  const ry = (playBottom - topH) * 0.43;
  const cardH = compact ? compactHand : Math.round(Math.min(bottomH * 0.8, 210));
  return {
    w,
    h,
    compact,
    wide,
    portrait: h > w && w < 700,
    sideW,
    topH,
    bottomH,
    playW,
    cx,
    cy,
    rx,
    ry,
    seatW: Math.round(compact ? clamp(112, w * 0.135, 150) : clamp(150, w * 0.125, 200)),
    seatH: compact ? 84 : 120,
    padX: Math.round(clamp(8, w * 0.012, 18)),
    plaqueW: Math.round(clamp(190, w * 0.21, 310)),
    actionsW: Math.round(clamp(150, w * 0.16, 240)),
    cardW: Math.round(cardH * 0.7),
    cardH,
    pileW: Math.round(compact ? 40 : clamp(46, h * 0.1, 96)),
    oval: {
      left: Math.round(cx - rx * 0.84),
      top: Math.round(cy - ry * 0.8),
      width: Math.round(rx * 1.68),
      height: Math.round(ry * 1.6),
    },
  };
}

export interface SeatPlacement {
  x: number;
  y: number;
}

/** Opponents clockwise: from the viewer's left, over the top, to the viewer's right. */
export function seatPlacements(
  layout: TableLayout,
  count: number,
): { seatW: number; seats: SeatPlacement[] } {
  const slot = (layout.playW - 16) / Math.max(1, count);
  // Compact seats share the top row; use the whole slot so equipment fits on one line.
  const seatW = layout.compact ? Math.min(150, Math.floor(slot - 8)) : layout.seatW;
  const seatDrop = layout.compact ? 26 : 0;
  const seats = Array.from({ length: count }, (_, index) => {
    if (layout.compact) {
      const x = 8 + slot * (index + 0.5);
      const t = (x - layout.cx) / (layout.playW / 2);
      return {
        x: Math.round(x),
        y: Math.round(layout.topH + layout.seatH / 2 + 12 + t * t * seatDrop),
      };
    }
    const start = 168;
    const end = 372;
    const angle =
      ((start + (count === 1 ? 0.5 : index / (count - 1)) * (end - start)) * Math.PI) / 180;
    return {
      x: Math.round(
        clamp(
          seatW / 2 + 12,
          layout.cx + layout.rx * Math.cos(angle),
          layout.playW - seatW / 2 - 12,
        ),
      ),
      y: Math.round(
        clamp(
          layout.topH + layout.seatH / 2 + 14,
          layout.cy + layout.ry * Math.sin(angle),
          layout.cy + layout.ry,
        ),
      ),
    };
  });
  return { seatW, seats };
}

export interface FanCard {
  marginLeft: number;
  rotate: number;
  drop: number;
}

/** A fanned hand that overlaps more as it grows, staying inside the free width. */
export function handFan(
  layout: TableLayout,
  count: number,
): { cards: FanCard[]; paddingBottom: number } {
  const spread = Math.min(layout.compact ? 3.5 : 4, 24 / Math.max(1, count));
  const mid = (count - 1) / 2;
  const swingAngle = (mid * spread * Math.PI) / 180;
  const swing = 2 * layout.cardH * 1.15 * Math.sin(swingAngle);
  const handW =
    layout.w - layout.sideW - layout.plaqueW - layout.actionsW - layout.padX * 2 - 40 - swing;
  let overlap = 0.12;
  if (count > 1 && layout.cardW * count > handW)
    overlap = clamp(0.12, 1 - (handW - layout.cardW) / ((count - 1) * layout.cardW), 0.66);
  return {
    cards: Array.from({ length: count }, (_, index) => ({
      marginLeft: index === 0 ? 0 : -Math.round(layout.cardW * overlap),
      rotate: Number(((index - mid) * spread).toFixed(2)),
      drop: Math.round((index - mid) ** 2 * layout.cardH * 0.012),
    })),
    paddingBottom: Math.round(
      mid * mid * layout.cardH * 0.012 + layout.cardW * 0.5 * Math.sin(swingAngle) + 4,
    ),
  };
}
