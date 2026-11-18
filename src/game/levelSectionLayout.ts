/**
 * Pure geometry for the Level Section HUD.
 *
 * Tablet (600-1023px) and desktop (1024px+) keep the same baseline multiplier;
 * phone bands supply a larger `uiScale`. Every function here receives the
 * already-combined scale, so the 1.5x HUD enlargement and the responsive phone
 * ladder compose in one place without touching level-map or gameplay code.
 */

/** Enlargement applied to every Level Section button/icon. */
export const LEVEL_HUD_SCALE = 1.5;
/** Extra top padding above the top button row, in design pixels. */
export const LEVEL_HUD_TOP_PADDING = 20;

/** Vertical centre shared by the Settings and Info buttons. */
const TOP_BUTTON_Y = 48 + LEVEL_HUD_TOP_PADDING;
/** Original top edge of the Collect Items panel. */
const COLLECT_TOP = 69;
/** Original centre of the first side-button row. */
const SIDE_BUTTON_Y1 = 146 + LEVEL_HUD_TOP_PADDING;

export interface MobileTopBarLayout {
    readonly gearX: number;
    readonly infoX: number;
    readonly y: number;
    readonly radius: number;
    /** Vertical offset applied to the collect panel so it clears the buttons. */
    readonly collectShift: number;
}

/**
 * Places the two top buttons in a row with a clear gap, and pushes the
 * Collect Items panel down just enough that the bigger Info disc never sits
 * on top of it.
 */
export const mobileTopBarLayout = (uiScale: number): MobileTopBarLayout => {
    const radius = Math.round(22 * uiScale);
    const gearX = 8 + radius;
    const infoX = gearX + radius * 2 + 6;
    // Keep an 8px gap below the Info disc: panel top = 69 + shift.
    const collectShift = Math.max(0, TOP_BUTTON_Y + radius + 8 - COLLECT_TOP);

    return { gearX, infoX, y: TOP_BUTTON_Y, radius, collectShift };
};

export interface MobileSideButtonLayout {
    readonly leftX: number;
    readonly rightX: number;
    readonly y1: number;
    readonly y2: number;
    readonly y3: number;
    readonly radius: number;
}

/**
 * Spreads the five side buttons so the scaled discs and their two label
 * rows never overlap, and insets both columns far enough that the widest
 * unlock label ("UNLOCK LV. 100") stays inside the world.
 */
export const mobileSideButtonLayout = (
    uiScale: number,
    width: number
): MobileSideButtonLayout => {
    const radius = Math.round(22 * uiScale);
    const basePadding = Math.max(34, Math.min(68, width * 0.063));
    const padding = Math.max(basePadding + 4, radius + 18);
    // Disc diameter (44 * scale) + label rows (26 * scale) + 6px breathing gap.
    const step = Math.round(70 * uiScale + 10);
    const y1 = SIDE_BUTTON_Y1;

    return {
        leftX: padding,
        rightX: width - padding,
        y1,
        y2: y1 + step,
        y3: y1 + step * 2,
        radius,
    };
};
