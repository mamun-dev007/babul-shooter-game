/**
 * Consecutive-successful-shot charging for the Fire Power button (pure,
 * unit-testable).
 *
 * The button starts disabled at 0% every level and may only be used at
 * exactly 100%. The charge target is one third of the level's available
 * shots:
 *
 *     requiredShots = Math.max(1, Math.floor(totalAvailableShots / 3))
 *     chargePercentage = (consecutiveSuccessfulShots / requiredShots) * 100
 *
 * A shot counts as successful only when it actually destroyed at least one
 * bubble; before 100%, any shot that destroys nothing — even one that hit
 * the board — resets the entire streak and the charge to 0%. Once 100% is
 * reached, the charge is locked (later misses hold 100% until launch).
 */

export interface FireChargeProgress {
    /** Consecutive successful shots in the current charge cycle. */
    readonly streak: number;
    /** Charge percentage 0–100; exactly 100 once the target is reached. */
    readonly percent: number;
    /** Successful shots needed to reach 100% for the current attempt. */
    readonly requiredShots: number;
}

export interface FireChargeStep {
    progress: FireChargeProgress;
    /** True exactly on the transition into 100%, never while it sits there. */
    reachedFull: boolean;
    /** True when the cycle was reset (a shot that destroyed nothing). */
    reset: boolean;
}

/** Successful shots demanded for a full charge: floor, never ceil. */
export const requiredShotsForFireCharge = (totalAvailableShots: number): number =>
    Math.max(1, Math.floor(Math.max(0, Math.floor(totalAvailableShots)) / 3));

export const emptyFireChargeProgress = (totalAvailableShots = 0): FireChargeProgress => ({
    streak: 0,
    percent: 0,
    requiredShots: requiredShotsForFireCharge(totalAvailableShots),
});

/**
 * Advances one shot outcome through the charge cycle. `totalAvailableShots`
 * is re-derived on every shot so rewarded-ad bonus bubbles (which grow the
 * attempt budget mid-level) keep the 1/3 target accurate.
 *
 * Normal shots only are passed to this resolver by the scene. Once the
 * cycle has reached 100%, later normal misses hold 100% (the charge is
 * locked); only an actual Fire Projectile launch resets it.
 */
export const resolveFireChargeProgress = (
    progress: FireChargeProgress,
    shotDestroyedAny: boolean,
    totalAvailableShots: number
): FireChargeStep => {
    const requiredShots = requiredShotsForFireCharge(totalAvailableShots);

    if (progress.percent >= 100) {
        // Fully charged and held: later normal misses must not reduce it.
        return { progress: { ...progress, requiredShots }, reachedFull: false, reset: false };
    }

    if (!shotDestroyedAny) {
        // A miss ends the cycle instantly: 0 consecutive shots, 0%.
        return {
            progress: { streak: 0, percent: 0, requiredShots },
            reachedFull: false,
            reset: true,
        };
    }

    const streak = Math.min(progress.streak + 1, requiredShots);
    const reachedFull = streak >= requiredShots;
    // Spec formula: (streak / requiredShots) * 100 — exact 100 on the
    // completing shot, the ramp never rounds up to it.
    const percent = reachedFull ? 100 : (streak / requiredShots) * 100;

    return {
        progress: { streak, percent, requiredShots },
        reachedFull,
        reset: false,
    };
};
