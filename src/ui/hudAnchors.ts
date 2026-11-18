import {
    CANVAS_TOP_ANCHOR,
    LAUNCHER_SIDE_CONTROL_RADIUS,
    PROGRESS_BAR_TOP_OFFSET,
    PROGRESS_HEIGHT,
    launcherSideControlOffsetX,
    launcherSideControlY,
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
export const CANVAS_BOTTOM_GAP = 104;
export const TOOLBAR_HEIGHT = 94;
export const PROGRESS_WIDTH = 316;

/**
 * Compact plus ("add") badge anchored to the upper-right edge of a power
 * button. It is a scaled duplicate of the Color Change button's card
 * (same purple gradient, rings, highlight — see HUD.drawColorChangerCard),
 * so only its radius differs. Sizes are increased for comfortable tap targets
 * while keeping the badge on the power-button corner (~half inside, ~half out).
 */
export const PLUS_BUTTON_RADIUS = 18;
export const PLUS_BUTTON_HIT_RADIUS = 20;
export const PLUS_BUTTON_OFFSET_X = 29;
export const PLUS_BUTTON_OFFSET_Y = 29;
/** Shared disc radius so every bottom toolbar button is exactly the same size. */
export const TOOLBAR_BUTTON_RADIUS = 46;
/** Power-button radius, also used by the plus-badge offset math. */
export const POWER_BUTTON_RADIUS = TOOLBAR_BUTTON_RADIUS;
/** Pause uses the same disc as the three power buttons. */
export const PAUSE_BUTTON_RADIUS = TOOLBAR_BUTTON_RADIUS;

/** Level label anchor (left, top). */
export const levelX = (): number => 20;
/** Score label anchor — pinned to the canvas' right edge. */
export const scoreX = (w = worldWidth()): number => w - 20;

/** Progress bar: horizontally centred, fixed width. */
export const progressX = (w = worldWidth()): number => w / 2 - PROGRESS_WIDTH / 2;
export const progressY = (): number => CANVAS_TOP_ANCHOR + PROGRESS_BAR_TOP_OFFSET;

/** Both controls beside the launcher use this exact disc radius. */
export const SIDE_CONTROL_RADIUS = LAUNCHER_SIDE_CONTROL_RADIUS;

/**
 * Bubble Counter button: the left-hand twin of the Bubble Change button.
 * Both share the launcher's vertical centre and an equal, width-aware offset,
 * so the launcher and its two controls stay balanced and unclipped.
 */
export const shotsX = (w = worldWidth()): number =>
    w / 2 - launcherSideControlOffsetX(w);
export const shotsY = (h = worldHeight()): number => launcherSideControlY(h);
/** Caption ("OF n · DROP n") sits centred near the disc's lower edge. */
export const shotsCaptionY = (h = worldHeight()): number => shotsY(h) + 20;

export const toolbarY = (h = worldHeight()): number => h - CANVAS_BOTTOM_GAP;
export const toolbarButtonY = (h = worldHeight()): number => h - 57;

/** Evenly spread buttons: one per inner fifth column — symmetric around centre. */
export const toolbarButtonXs = (w = worldWidth()): number[] =>
    [1, 2, 3, 4].map((slot) => (w / 5) * slot);

/**
 * Plus-badge anchors: upper-right edge of each power button, derived from
 * the toolbar anchors so they reflow with the bottom controls at every
 * viewport height. Horizontal position mirrors the power buttons plus
 * the offset (bomb = index 0, colorChanger = index 1, fireball = index 2),
 * so all three badges share the same relative placement and corner overlap.
 */
export const plusButtonY = (h = worldHeight()): number =>
    toolbarButtonY(h) + 1 - PLUS_BUTTON_OFFSET_Y;
export const plusButtonXs = (w = worldWidth()): number[] => {
    const xs = toolbarButtonXs(w);
    return [xs[0] + PLUS_BUTTON_OFFSET_X, xs[1] + PLUS_BUTTON_OFFSET_X, xs[2] + PLUS_BUTTON_OFFSET_X];
};

/** Transient ad-message toast, parked above the SHOTS card. */
export const noticeX = (w = worldWidth()): number => w / 2;
export const noticeY = (h = worldHeight()): number => h - 190;
export let NOTICE_X = noticeX();
export let NOTICE_Y = noticeY();

// Baseline compatibility aliases for older HUD consumers and layout tests.
// Live HUD construction calls the lowercase functions above so resizing can
// reflow the objects; these constants describe the 540x960 reference viewport.
export let PROGRESS_X = progressX();
export let PROGRESS_Y = progressY();
export let SHOTS_X = shotsX();
export let SHOTS_Y = shotsY();
export let SHOTS_CAPTION_Y = shotsCaptionY();
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
    SHOTS_CAPTION_Y = shotsCaptionY();
    TOOLBAR_BUTTON_XS = toolbarButtonXs();
    TOOLBAR_BUTTON_Y = toolbarButtonY();
    TOOLBAR_Y = toolbarY();
    PLUS_BUTTON_Y = plusButtonY();
    PLUS_BUTTON_XS = plusButtonXs();
};
