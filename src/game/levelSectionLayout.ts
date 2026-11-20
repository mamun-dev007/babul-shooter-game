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
/** Clearance between the scaled top bar and the first side-button row. */
export const SIDE_BUTTON_TOP_GAP = 8;

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
 * unlock label ("UNLOCK LV. 100") stays inside the world. The first row is
 * derived from the scaled top bar so the Starter/Sale discs always keep a
 * clear gap below the Settings/Info discs on every phone band.
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
    const top = mobileTopBarLayout(uiScale);
    const y1 = Math.max(SIDE_BUTTON_Y1, top.y + top.radius * 2 + SIDE_BUTTON_TOP_GAP);

    return {
        leftX: padding,
        rightX: width - padding,
        y1,
        y2: y1 + step,
        y3: y1 + step * 2,
        radius,
    };
};

export interface StarterDecorationLayout {
    /** Centre of the lock badge on the upper edge of the Starter disc. */
    readonly lockY: number;
    readonly lockRadius: number;
    /** Top of the "Complete 20 Levels to Unlock" label below the Starter disc. */
    readonly messageY: number;
    readonly messageWidth: number;
}

/**
 * Geometry for the Starter-only lock badge and requirement label. Every disc
 * keeps its original row (Starter stays aligned with SALE, Gift with LOCKED),
 * so only these two decorations need to adapt to the scaled top bar and the
 * space available before the Gift disc.
 */
export const starterDecorationLayout = (
    side: MobileSideButtonLayout,
    uiScale: number,
    width: number
): StarterDecorationLayout => {
    const top = mobileTopBarLayout(uiScale);
    const discTop = side.y1 - side.radius;
    const topBottom = top.y + top.radius;
    const room = (discTop - topBottom - 4) / 2;
    const lockRadius = Math.max(10, Math.min(Math.round(8 * uiScale), Math.floor(room)));
    // Centre the badge in the free band, or rest it on the disc's top edge
    // when the enlarged top bar leaves no band at all.
    const lockY = room >= lockRadius
        ? (topBottom + discTop) / 2
        : topBottom + lockRadius + 2;

    // Use the full space to the right edge so the label stays on one line
    // instead of wrapping into the Gift disc on phone bands.
    const messageWidth = Math.max(Math.round(104 * uiScale), width - side.leftX - 8);
    const messageY = side.y1 + Math.round(36 * uiScale);

    return { lockY, lockRadius, messageY, messageWidth };
};
