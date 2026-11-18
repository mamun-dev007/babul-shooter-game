/**
 * Geometry for the enlarged Gift Item cards.
 *
 * The canonical card is 420×210 design pixels. It is enlarged by 80% to
 * 756×378 with an 80% larger gap. On smaller worlds the width is clamped to
 * the available space (and the column count drops) so cards never clip or
 * overlap; height and spacing stay at the enlarged size.
 */

export const GIFT_CARD_SCALE = 1.8;
const BASE_CARD_WIDTH = 420;
const BASE_CARD_HEIGHT = 210;
const BASE_GAP = 16;
/** Minimum usable card width before another column is dropped. */
const MIN_CARD_WIDTH = 480;
/** Side margin kept on every screen width. */
const SIDE_MARGINS = 40;

export interface GiftCardLayout {
    readonly cols: number;
    readonly cardW: number;
    readonly cardH: number;
    readonly gap: number;
    readonly listW: number;
    /** Factor applied to every internal card control (icons, text, buttons). */
    readonly scale: number;
}

/** Existing device bands: 1 phone, 2 tablet/small desktop, 3/4 large desktop. */
export const giftPreferredColumns = (deviceWidth: number): number => {
    const width = Number.isFinite(deviceWidth) && deviceWidth > 0 ? deviceWidth : 0;
    if (width < 560) return 1;
    if (width < 900) return 2;
    if (width < 1300) return 3;
    return 4;
};

export const giftCardLayout = (worldWidth: number, deviceWidth: number): GiftCardLayout => {
    const safeWorld = Number.isFinite(worldWidth) && worldWidth > 0 ? worldWidth : 700;
    const available = Math.max(120, safeWorld - SIDE_MARGINS);
    const cardH = Math.round(BASE_CARD_HEIGHT * GIFT_CARD_SCALE);
    const gap = Math.round(BASE_GAP * GIFT_CARD_SCALE);
    const fullWidth = Math.round(BASE_CARD_WIDTH * GIFT_CARD_SCALE);
    const fits = Math.max(1, Math.floor((available + gap) / (MIN_CARD_WIDTH + gap)));
    const cols = Math.max(1, Math.min(giftPreferredColumns(deviceWidth), fits));
    const cardW = Math.min(fullWidth, Math.floor((available - (cols - 1) * gap) / cols));

    return {
        cols,
        cardW,
        cardH,
        gap,
        listW: cols * cardW + (cols - 1) * gap,
        scale: cardW / BASE_CARD_WIDTH,
    };
};

/** Total height of the scrollable, multi-row gift card grid. */
export const giftListContentHeight = (
    itemCount: number,
    layout: GiftCardLayout
): number => {
    const rows = Math.ceil(itemCount / layout.cols);
    return rows * layout.cardH + Math.max(0, rows - 1) * layout.gap;
};
