/**
 * Exact responsive breakpoints for the Level Section.
 *
 * The game renders into a design-space canvas (usually 540px wide) that
 * Phaser Scale.FIT maps onto the real screen, so canvas coordinates alone
 * cannot tell a 320px phone from a 540px one. These bands therefore use the
 * CSS viewport width (device-independent pixels, not physical pixels) to
 * pick a button multiplier for every Level Section control.
 *
 * Tablet (600-1023px) and desktop (1024px+) intentionally keep the existing
 * baseline scale of 1 so those layouts do not change.
 */
export type LevelBreakpointId =
    | 'xs-mobile'
    | 'small-mobile'
    | 'standard-mobile'
    | 'large-mobile'
    | 'small-tablet'
    | 'tablet'
    | 'desktop';

export interface LevelBreakpoint {
    readonly id: LevelBreakpointId;
    /** Inclusive lower bound, in CSS viewport pixels. */
    readonly minWidth: number;
    /** Exclusive upper bound, in CSS viewport pixels (null = open-ended). */
    readonly maxWidth: number | null;
    /** Multiplier applied to Level Section buttons relative to the baseline. */
    readonly buttonScale: number;
    /** True only for the four phone bands. */
    readonly mobile: boolean;
}

export const LEVEL_BREAKPOINTS: readonly LevelBreakpoint[] = [
    // Widths below the 320px test floor still use the smallest phone band so
    // there is no uncovered range. Bounds are half-open so fractional CSS
    // widths between two whole-pixel bands never fall through a gap.
    { id: 'xs-mobile', minWidth: 0, maxWidth: 360, buttonScale: 1.3, mobile: true },
    { id: 'small-mobile', minWidth: 360, maxWidth: 390, buttonScale: 1.42, mobile: true },
    { id: 'standard-mobile', minWidth: 390, maxWidth: 430, buttonScale: 1.55, mobile: true },
    { id: 'large-mobile', minWidth: 430, maxWidth: 600, buttonScale: 1.58, mobile: true },
    // Existing tablet and desktop layouts (scale unchanged).
    { id: 'small-tablet', minWidth: 600, maxWidth: 768, buttonScale: 1, mobile: false },
    { id: 'tablet', minWidth: 768, maxWidth: 1024, buttonScale: 1, mobile: false },
    { id: 'desktop', minWidth: 1024, maxWidth: null, buttonScale: 1, mobile: false },
];

const DESKTOP_BAND = LEVEL_BREAKPOINTS[LEVEL_BREAKPOINTS.length - 1];
/** Safe fallback for headless/invalid viewport readings (desktop baseline). */
const DESKTOP_BASELINE_WIDTH = DESKTOP_BAND.minWidth;

/** Band containing `width` CSS pixels; non-finite widths use the desktop band. */
export function levelBreakpointForWidth(width: number): LevelBreakpoint {
    if (!Number.isFinite(width)) {
        return DESKTOP_BAND;
    }

    const cssWidth = Math.max(0, width);

    for (const band of LEVEL_BREAKPOINTS) {
        if (cssWidth >= band.minWidth && (band.maxWidth === null || cssWidth < band.maxWidth)) {
            return band;
        }
    }

    return DESKTOP_BAND;
}

/** Button multiplier for a CSS viewport width. */
export const levelButtonScale = (width: number): number =>
    levelBreakpointForWidth(width).buttonScale;

/** Whether the width uses the phone (mobile) Level Section layout. */
export const isMobileLevelWidth = (width: number): boolean =>
    levelBreakpointForWidth(width).mobile;

/**
 * Phone bands replace the drawn in-game Back buttons with the Android system
 * Back button. Tablet and desktop keep their existing Back buttons untouched.
 */
export const hidesInGameBackButton = (width: number): boolean =>
    isMobileLevelWidth(width);

/**
 * Uses the shorter viewport side so a phone in landscape (e.g. 844×390) is
 * still treated as a phone — its long edge would otherwise land in a tablet
 * band. Tablets and desktops keep their drawn Back buttons in both rotations.
 */
export const hidesInGameBackButtonForSize = (width: number, height: number): boolean => {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        return false;
    }
    return hidesInGameBackButton(Math.min(width, height));
};

/** Live-viewport version used by scenes while building their headers. */
export const hidesInGameBackButtonForViewport = (): boolean => {
    if (typeof window === 'undefined') {
        return false;
    }
    const viewport = window.visualViewport;
    return hidesInGameBackButtonForSize(
        viewport?.width ?? window.innerWidth,
        viewport?.height ?? window.innerHeight
    );
};

/**
 * Live CSS viewport width in device-independent pixels. `visualViewport`
 * tracks the visible area (e.g. after browser chrome or orientation
 * changes); `innerWidth` is the fallback. Never the physical pixel size,
 * so devicePixelRatio cannot shift a device into the wrong band.
 *
 * Headless/server contexts (no `window`) and invalid readings fall back to
 * the desktop baseline so nothing unexpectedly inflates in those cases.
 */
export const cssViewportWidth = (): number => {
    if (typeof window === 'undefined') {
        return DESKTOP_BASELINE_WIDTH;
    }

    const width = window.visualViewport?.width ?? window.innerWidth;
    return Number.isFinite(width) && width > 0 ? width : DESKTOP_BASELINE_WIDTH;
};
