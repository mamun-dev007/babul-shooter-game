/**
 * Consecutive successful-shot reward logic (pure, unit-testable).
 *
 * A shot is "successful" only when it destroyed at least one bubble. Failed
 * shots reset both independent streak counters to 0. When a reward is already
 * held, its own streak pauses (so using the reward starts a genuinely new
 * streak instead of instantly re-earning it), while failures still reset it.
 */

/** Successful shots needed for the Power reward (1 fireball charge). */
export const POWER_STREAK_TARGET = 10;

/** Successful shots needed for the Bomb reward (1 bomb into the inventory). */
export const BOMB_STREAK_TARGET = 5;

/** A player can hold at most one of each reward at a time. */
export const MAX_STREAK_REWARDS = 1;

export interface StreakTracking {
    /** Consecutive successful shots counted toward the Power reward. */
    powerStreak: number;
    /** Consecutive successful shots counted toward the Bomb reward. */
    bombStreak: number;
}

export interface StreakRewardResult {
    tracking: StreakTracking;
    /** True when this shot completed the Power streak and the Power was granted. */
    powerEarned: boolean;
    /** True when this shot completed the Bomb streak and the Bomb was granted. */
    bombEarned: boolean;
}

export const emptyStreakTracking = (): StreakTracking => ({
    powerStreak: 0,
    bombStreak: 0,
});

/**
 * Resolves one shot outcome against both streak counters.
 *
 * Rewards are never stacked: a reward is only granted when that reward type is
 * not already held, and both counters share the same successful-shot signal so
 * one shot can complete both streaks but never grants twice.
 */
export const resolveStreakRewards = (
    tracking: StreakTracking,
    shotDestroyedAny: boolean,
    powerHeld: number,
    bombsHeld: number
): StreakRewardResult => {
    if (!shotDestroyedAny) {
        // A failed shot always resets the consecutive-counters to 0.
        return { tracking: emptyStreakTracking(), powerEarned: false, bombEarned: false };
    }

    const heldPower = Math.max(0, Math.floor(Number(powerHeld) || 0));
    const heldBombs = Math.max(0, Math.floor(Number(bombsHeld) || 0));

    // While the reward is unused, its own streak does not advance: using the
    // stored reward must be followed by a genuinely new streak.
    const powerStreak = heldPower >= MAX_STREAK_REWARDS ? tracking.powerStreak : tracking.powerStreak + 1;
    const bombStreak = heldBombs >= MAX_STREAK_REWARDS ? tracking.bombStreak : tracking.bombStreak + 1;

    const powerEarned = heldPower < MAX_STREAK_REWARDS && powerStreak >= POWER_STREAK_TARGET;
    const bombEarned = heldBombs < MAX_STREAK_REWARDS && bombStreak >= BOMB_STREAK_TARGET;

    return {
        tracking: {
            powerStreak: powerEarned ? 0 : powerStreak,
            bombStreak: bombEarned ? 0 : bombStreak,
        },
        powerEarned,
        bombEarned,
    };
};
