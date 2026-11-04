/**
 * Pure scroll math for the playfield viewport.
 *
 * The board is taller than the visible band on late levels. Offsets are always
 * in the range `[minOffset, 0]`: `0` shows the board's ceiling, while
 * `minOffset` raises the board until its frontier (bottom edge) sits at the
 * vertical middle of the viewport — the lower half of the playfield stays open
 * for the shooter and its trajectory. Nothing in this module creates, removes
 * or moves bubbles by itself; it only describes how far the existing board may
 * be shifted.
 */
export interface BoardScrollMetrics {
    readonly contentTop: number;
    readonly contentBottom: number;
    readonly viewTop: number;
    readonly viewBottom: number;
    readonly contentHeight: number;
    readonly viewHeight: number;
    /**
     * Most negative legal offset: frontier aligned with the viewport's
     * vertical middle (or 0 when the whole formation already ends above it).
     * Never positive.
     */
    readonly minOffset: number;
    /** Sliding the board down past its ceiling is never allowed. */
    readonly maxOffset: 0;
}

export const boardScrollMetrics = (
    contentTop: number,
    contentBottom: number,
    viewTop: number,
    viewBottom: number
): BoardScrollMetrics => {
    const viewHeight = Math.max(0, viewBottom - viewTop);
    const contentHeight = Math.max(0, contentBottom - contentTop);
    // The frontier may rise up to the viewport's vertical middle, so the
    // formation always sits in the upper-middle band with an open area below
    // (shooter, trajectory). It may never sink below the board's ceiling.
    const frontierMidY = (viewTop + viewBottom) / 2;
    const minOffset = Math.min(0, frontierMidY - contentBottom);

    return {
        contentTop,
        contentBottom,
        viewTop,
        viewBottom,
        contentHeight,
        viewHeight,
        minOffset,
        maxOffset: 0,
    };
};

export const clampScrollOffset = (offset: number, metrics: BoardScrollMetrics): number => {
    const safe = Number.isFinite(offset) ? offset : 0;
    return Math.min(metrics.maxOffset, Math.max(metrics.minOffset, safe));
};

/** 0 = top of the board, 1 = bottom-aligned. */
export const scrollRatio = (offset: number, metrics: BoardScrollMetrics): number => {
    if (metrics.minOffset >= 0) {
        return 0;
    }

    return Math.min(1, Math.max(0, offset / metrics.minOffset));
};

/** Inverse of `scrollRatio`, used by the scrollbar thumb. */
export const offsetForRatio = (ratio: number, metrics: BoardScrollMetrics): number => {
    const safeRatio = Math.min(1, Math.max(0, Number.isFinite(ratio) ? ratio : 0));
    const offset = clampScrollOffset(metrics.minOffset * safeRatio, metrics);

    // `-offset * 0` produces -0; normalise it so callers can compare with 0.
    return offset === 0 ? 0 : offset;
};
