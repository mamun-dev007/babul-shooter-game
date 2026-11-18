/**
 * Geometry for the enlarged Daily Task cards.
 *
 * The cards are ~80% larger than the original 420×116 design; every internal
 * control is scaled by the same factor so the card's colours, gradients,
 * borders and visual hierarchy stay identical. Width is clamped to the live
 * world so no card can spill off a phone, tablet or desktop screen.
 */

export const DAILY_CARD_SCALE = 1.8;
const BASE_CARD_WIDTH = 420;
const BASE_CARD_HEIGHT = 116;
const BASE_CARD_GAP = 16;
/** Side margin kept on every screen width. */
const CARD_SIDE_MARGIN = 40;

export interface DailyCardLayout {
    readonly width: number;
    readonly height: number;
    readonly gap: number;
    readonly scale: number;
}

export const dailyCardLayout = (worldWidth: number): DailyCardLayout => {
    const safeWidth = Number.isFinite(worldWidth) && worldWidth > 0
        ? worldWidth
        : BASE_CARD_WIDTH;
    return {
        width: Math.min(Math.round(BASE_CARD_WIDTH * DAILY_CARD_SCALE), safeWidth - CARD_SIDE_MARGIN),
        height: Math.round(BASE_CARD_HEIGHT * DAILY_CARD_SCALE),
        gap: Math.round(BASE_CARD_GAP * DAILY_CARD_SCALE),
        scale: DAILY_CARD_SCALE,
    };
};

/** Total height of the stacked, vertically scrollable card list. */
export const dailyCardContentHeight = (
    count: number,
    layout: DailyCardLayout
): number => count * layout.height + Math.max(0, count - 1) * layout.gap;
