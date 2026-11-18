/**
 * Pure loading-progress math shared by the loading scene (and covered by
 * unit tests). Kept free of Phaser/DOM so the smoothing contract is explicit:
 *
 * - the visible value is monotonic (never moves backwards),
 * - 100% is never shown while assets are still loading,
 * - an instant/cached load still ramps to 100% over a short, visible window
 *   instead of teleporting,
 * - a slow load simply follows the real loader progress, then completes
 *   smoothly when the batch finishes.
 */

/** Highest value shown while assets are still in flight. */
export const PRE_COMPLETE_CAP = 0.99;

/** Minimum duration (ms) of the final visible run to 100%. */
export const COMPLETION_RAMP_MS = 600;

/** How quickly the visible value chases the real progress (per second). */
export const PROGRESS_EASE_PER_SECOND = 14;

/**
 * Time (ms) the bar takes to reach its initial ramp cap. The first real
 * loader event only arrives once a file has finished, so without this the bar
 * would sit at 0% for a moment even though loading is already underway.
 */
export const START_RAMP_MS = 240;

/**
 * How far the bar may rise on its own before real loader progress leads.
 * Deliberately small: it gives immediate feedback without pretending that
 * much of the batch is done.
 */
export const START_RAMP_CAP = 0.08;

const COMPLETE_EPSILON = 0.001;

const clamp01 = (value: number): number =>
    Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

export interface ProgressInput {
    /** What the player currently sees (0..1). */
    readonly visible: number;
    /** Latest value reported by Phaser's loader (0..1). */
    readonly loader: number;
    /** True once every required asset has finished loading successfully. */
    readonly assetsReady: boolean;
    /**
     * Milliseconds since the bar started animating. Optional; defaults to 0
     * so loader-only callers/tests are unaffected. Drives the initial
     * time-based ramp before the first loader event arrives.
     */
    readonly elapsedMs?: number;
    /** Frame delta in milliseconds. */
    readonly deltaMs: number;
}

export const advanceProgress = (input: ProgressInput): number => {
    const visible = clamp01(input.visible);
    const loader = clamp01(input.loader);
    const startFloor = Math.min(
        START_RAMP_CAP,
        START_RAMP_CAP * clamp01((input.elapsedMs ?? 0) / START_RAMP_MS)
    );
    const target = input.assetsReady
        ? 1
        : Math.min(PRE_COMPLETE_CAP, Math.max(loader, startFloor));

    if (target <= visible) {
        return visible;
    }

    const dt = Math.max(0, Math.min(input.deltaMs, 100));
    let next: number;

    if (input.assetsReady) {
        // Constant maximum step: no single frame can jump more than
        // dt / COMPLETION_RAMP_MS, so even a load that finishes while the bar
        // sits at 90% finishes smoothly instead of snapping to 100%.
        next = Math.min(target, visible + dt / COMPLETION_RAMP_MS);
    } else {
        next = visible + (target - visible) * (1 - Math.exp(-PROGRESS_EASE_PER_SECOND * dt / 1000));
        next = Math.min(target, next);
    }

    if (target - next <= COMPLETE_EPSILON) {
        return target;
    }

    return Math.max(visible, next);
};

/** Display percent: 100 only once the bar is genuinely complete. */
export const loadingPercent = (value: number): number => {
    const clamped = clamp01(value);
    if (clamped >= 1) {
        return 100;
    }
    return Math.min(99, Math.floor(clamped * 100));
};
