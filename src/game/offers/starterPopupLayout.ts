/**
 * Geometry for the enlarged Starter Pack popup.
 *
 * The original design is 340×470 design pixels (plus a small TIME LEFT pill
 * below it). It is enlarged by 80% to 612×846. On short screens — notably
 * phones in landscape — the card is clamped to the available height and the
 * content scrolls inside it, so the enlarged design stays intact instead of
 * being shrunk or clipped.
 */

export const STARTER_POPUP_SCALE = 1.8;
const DESIGN_WIDTH = 340;
const DESIGN_HEIGHT = 470;
/** Margin on each side of the card. */
const SIDE_MARGIN = 16;
/**
 * Vertical room needed for the ribbon above and the TIME LEFT pill below the
 * card, in design pixels. The card is centred as a group with a small upward
 * offset, so this reserve keeps both decorations on screen.
 */
export const STARTER_POPUP_VERTICAL_RESERVE = 60;

export interface StarterPopupGeometry {
    readonly scale: number;
    /** Actual card width in world pixels. */
    readonly width: number;
    /** Actual card height in world pixels (clamped on short screens). */
    readonly height: number;
    /** Full, unclamped card width at the 80% scale. */
    readonly designWidth: number;
    /** Full, unclamped card height at the 80% scale. */
    readonly designHeight: number;
    readonly scrollable: boolean;
}

export const starterPopupGeometry = (
    worldWidth: number,
    worldHeight: number
): StarterPopupGeometry => {
    const safeW = Number.isFinite(worldWidth) && worldWidth > 0 ? worldWidth : 700;
    const safeH = Number.isFinite(worldHeight) && worldHeight > 0 ? worldHeight : 960;
    const scale = Math.min(
        STARTER_POPUP_SCALE,
        Math.max(0.5, (safeW - SIDE_MARGIN * 2) / DESIGN_WIDTH)
    );
    const designWidth = Math.round(DESIGN_WIDTH * scale);
    const designHeight = Math.round(DESIGN_HEIGHT * scale);
    const width = Math.min(designWidth, Math.max(160, safeW - SIDE_MARGIN * 2));
    const height = Math.min(designHeight, Math.max(200, safeH - Math.round(STARTER_POPUP_VERTICAL_RESERVE * scale)));

    return {
        scale,
        width,
        height,
        designWidth,
        designHeight,
        scrollable: height < designHeight,
    };
};
