/**
 * Pure timing and placement math for the Gameplay level-intro sequence.
 *
 * The intro is two coordinated animations: the Level Intro banner slides in
 * from one side, holds centred, then slides off the other side, while the
 * whole bubble formation rises from below the visible board floor into its
 * exact predefined cells. Keeping the numbers here (instead of inside the
 * scene) lets the behaviour be tested without a Phaser runtime.
 */

/** Banner entrance duration (ms). */
export const INTRO_POPUP_ENTER_MS = 420;
/** Time the banner stays fully centred with the formation settled (ms). */
export const INTRO_POPUP_HOLD_MS = 2000;
/** Banner exit duration (ms). */
export const INTRO_POPUP_EXIT_MS = 300;
/** Formation rise duration (ms). Runs alongside the banner entrance/hold. */
export const INTRO_BUBBLE_RISE_MS = 2000;

export const INTRO_POPUP_ENTER_EASE = 'Cubic.easeOut';
export const INTRO_POPUP_EXIT_EASE = 'Cubic.easeIn';
export const INTRO_BUBBLE_RISE_EASE = 'Sine.easeInOut';

/** Extra gap so the banner is completely off-screen at both ends. */
const OFFSCREEN_GAP = 28;

/**
 * Container centre X that keeps the whole panel (width `panelWidth`, centred
 * origin) to the left of the visible screen.
 */
export const introPopupEnterX = (panelWidth: number): number =>
    -panelWidth / 2 - OFFSCREEN_GAP;

/**
 * Container centre X that keeps the whole panel (width `panelWidth`, centred
 * origin) to the right of the visible screen.
 */
export const introPopupExitX = (worldWidth: number, panelWidth: number): number =>
    worldWidth + panelWidth / 2 + OFFSCREEN_GAP;

/**
 * Shared vertical offset the formation must start below its final positions
 * so that its topmost bubble is fully hidden beneath the board's visible
 * floor. Every bubble is translated by this same offset, so the formation's
 * shape and relative spacing are preserved exactly; tweening the offset back
 * to zero lands every bubble on its exact final coordinate.
 */
export const introBubbleRiseOffset = (
    finalYs: readonly number[],
    viewBottom: number,
    radius: number,
    margin = radius
): number => {
    if (finalYs.length === 0) {
        return 0;
    }

    const top = Math.min(...finalYs);
    return Math.max(0, viewBottom + radius + margin - top);
};
