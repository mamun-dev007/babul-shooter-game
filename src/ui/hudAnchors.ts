import {
    CANVAS_TOP_ANCHOR,
    PROGRESS_BAR_TOP_OFFSET,
    PROGRESS_HEIGHT,
    worldHeight,
    worldWidth,
} from '../game/layout';

/** Re-exported for HUD consumers; the shared source of truth is game/layout. */
export { CANVAS_TOP_ANCHOR, PROGRESS_HEIGHT };

/**
 * Shared geometric anchors of the gameplay chrome (top HUD row + bottom
 * controls bar). Everything derives from the live world size so the whole
 * chrome reflows from one place — top HUD hugs the top, bottom controls hug
 * the bottom, toolbar spreads symmetrically around the world centre. Values
 * equal the design-viewport constants at 540x960.
 */

/** Gap from the canvas bottom edge to the toolbar's top. */
export const CANVAS_BOTTOM_GAP = 82;
export const TOOLBAR_HEIGHT = 72;
export const PROGRESS_WIDTH = 316;

/**
 * Compact plus ("add") badge anchored to the upper-right edge of a power
 * button. It is a scaled duplicate of the Color Change button's card
 * (same purple gradient, rings, highlight — see HUD.drawColorChangerCard),
 * so only its radius differs. The 22px hit radius keeps a 44px touch
 * target. The (18.5, -18.5) offset puts the centre 26.2px from the power
 * centre (at 45°): about 50% of the plus disc lies inside the 27px power
 * circle and ~50% stays outside.
 */
export const PLUS_BUTTON_RADIUS = 12;
export const PLUS_BUTTON_HIT_RADIUS = 12;
export const PLUS_BUTTON_OFFSET_X = 18.5;
export const PLUS_BUTTON_OFFSET_Y = 18.5;
/** Power-button radius (mirrors HUD POWER_BUTTON_RADIUS) for plus offset math. */
export const POWER_BUTTON_RADIUS = 27;

/** Level label anchor (left, top). */
export const levelX = (): number => 20;
/** Score label anchor — pinned to the canvas' right edge. */
export const scoreX = (w = worldWidth()): number => w - 20;

/** Progress bar: horizontally centred, fixed width. */
export const progressX = (w = worldWidth()): number => w / 2 - PROGRESS_WIDTH / 2;
export const progressY = (): number => CANVAS_TOP_ANCHOR + PROGRESS_BAR_TOP_OFFSET;

/** SHOTS card sits just under the shooter, centred on the playfield. */
export const shotsX = (w = worldWidth()): number => w / 2 - 85;
export const shotsY = (h = worldHeight()): number => h - 136;

export const toolbarY = (h = worldHeight()): number => h - CANVAS_BOTTOM_GAP;
export const toolbarButtonY = (h = worldHeight()): number => h - 46;

/** Evenly spread buttons: one per inner fifth column — symmetric around centre. */
export const toolbarButtonXs = (w = worldWidth()): number[] =>
    [1, 2, 3, 4].map((slot) => (w / 5) * slot);

/**
 * Plus-badge anchors: upper-right edge of each power button, derived from
 * the toolbar anchors so they reflow with the bottom controls at every
 * viewport height. Horizontal position mirrors the power buttons plus
 * the (18.5, -18.5) offset (bomb = index 0, colorChanger = index 1,
 * fireball = index 2), so all three badges share the same relative
 * placement and 50%/50% overlap.
 */
export const plusButtonY = (h = worldHeight()): number =>
    toolbarButtonY(h) + 1 - PLUS_BUTTON_OFFSET_Y;
export const plusButtonXs = (w = worldWidth()): number[] => {
    const xs = toolbarButtonXs(w);
    return [xs[0] + PLUS_BUTTON_OFFSET_X, xs[1] + PLUS_BUTTON_OFFSET_X, xs[2] + PLUS_BUTTON_OFFSET_X];
};

/** Transient ad-message toast, parked above the SHOTS card. */
export const noticeX = (w = worldWidth()): number => w / 2;
export const noticeY = (h = worldHeight()): number => h - 154;
export let NOTICE_X = noticeX();
export let NOTICE_Y = noticeY();

// Baseline compatibility aliases for older HUD consumers and layout tests.
// Live HUD construction calls the lowercase functions above so resizing can
// reflow the objects; these constants describe the 540x960 reference viewport.
export let PROGRESS_X = progressX();
export let PROGRESS_Y = progressY();
export let SHOTS_X = shotsX();
export let SHOTS_Y = shotsY();
export let TOOLBAR_BUTTON_XS = toolbarButtonXs();
export let TOOLBAR_BUTTON_Y = toolbarButtonY();
export let TOOLBAR_Y = toolbarY();
export let PLUS_BUTTON_Y = plusButtonY();
export let PLUS_BUTTON_XS = plusButtonXs();

/** Refresh compatibility exports after a world-size change. */
export const syncHudAnchors = (): void => {
    NOTICE_X = noticeX();
    NOTICE_Y = noticeY();
    PROGRESS_X = progressX();
    PROGRESS_Y = progressY();
    SHOTS_X = shotsX();
    SHOTS_Y = shotsY();
    TOOLBAR_BUTTON_XS = toolbarButtonXs();
    TOOLBAR_BUTTON_Y = toolbarButtonY();
    TOOLBAR_Y = toolbarY();
    PLUS_BUTTON_Y = plusButtonY();
    PLUS_BUTTON_XS = plusButtonXs();
};
