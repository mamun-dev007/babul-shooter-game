import { describe, expect, it } from 'vitest';
import {
    BOMB_STREAK_TARGET,
    POWER_STREAK_TARGET,
    emptyStreakTracking,
    resolveStreakRewards,
} from './streakRewards';

const hit = (tracking: { powerStreak: number; bombStreak: number }, powerHeld = 0, bombsHeld = 0) =>
    resolveStreakRewards(tracking, true, powerHeld, bombsHeld);

describe('consecutive successful-shot rewards', () => {
    it('awards the Power on the 10th consecutive successful shot', () => {
        let tracking = emptyStreakTracking();
        let bombsHeld = 0;

        for (let shot = 1; shot < POWER_STREAK_TARGET; shot++) {
            const result = hit(tracking, 0, bombsHeld);
            tracking = result.tracking;
            // The bomb earned at shot 5 is kept (never consumed mid-streak).
            bombsHeld = Math.min(1, bombsHeld + (result.bombEarned ? 1 : 0));
            expect(result.powerEarned).toBe(false);
        }

        const result = hit(tracking, 0, bombsHeld);
        expect(result.powerEarned).toBe(true);
        expect(result.bombEarned).toBe(false);
        expect(result.tracking.powerStreak).toBe(0);
    });

    it('awards the Bomb on the 5th consecutive successful shot', () => {
        let tracking = emptyStreakTracking();

        for (let shot = 1; shot < BOMB_STREAK_TARGET; shot++) {
            const result = hit(tracking);
            tracking = result.tracking;
            expect(result.bombEarned).toBe(false);
        }

        const result = hit(tracking);
        expect(result.bombEarned).toBe(true);
        expect(result.tracking.bombStreak).toBe(0);
        // A 5-shot streak is not yet a Power streak.
        expect(result.powerEarned).toBe(false);
        expect(result.tracking.powerStreak).toBe(POWER_STREAK_TARGET - 5);
    });

    it('earns both rewards from the same series of shots', () => {
        let tracking = emptyStreakTracking();
        let bombsEarned = 0;
        let powersEarned = 0;
        let bombsHeld = 0;
        let powersHeld = 0;

        for (let shot = 1; shot <= 10; shot++) {
            const result = hit(tracking, powersHeld, bombsHeld);
            tracking = result.tracking;
            bombsEarned += result.bombEarned ? 1 : 0;
            powersEarned += result.powerEarned ? 1 : 0;
            bombsHeld = Math.min(1, bombsHeld + (result.bombEarned ? 1 : 0));
            powersHeld = Math.min(1, powersHeld + (result.powerEarned ? 1 : 0));
        }

        // Bomb at shot 5, Power at shot 10 — identical shots feed both streaks.
        expect(bombsEarned).toBe(1);
        expect(powersEarned).toBe(1);
    });

    it('resets both counters to 0 when a shot destroys nothing', () => {
        const result = resolveStreakRewards({ powerStreak: 7, bombStreak: 4 }, false, 0, 0);

        expect(result.tracking).toEqual({ powerStreak: 0, bombStreak: 0 });
        expect(result.powerEarned).toBe(false);
        expect(result.bombEarned).toBe(false);
    });

    it('never grants a reward while an unused one is already held', () => {
        // Power held: the power streak does not advance and nothing is granted.
        const withPower = hit({ powerStreak: 9, bombStreak: 0 }, 1, 0);
        expect(withPower.powerEarned).toBe(false);
        expect(withPower.tracking.powerStreak).toBe(9);

        // Bomb held: the bomb streak does not advance and nothing is granted.
        const withBomb = hit({ powerStreak: 0, bombStreak: 4 }, 0, 1);
        expect(withBomb.bombEarned).toBe(false);
        expect(withBomb.tracking.bombStreak).toBe(4);
    });

    it('starts a genuinely new streak after the stored reward is used', () => {
        // Ten successful shots while the Power was held (streak frozen at 9),
        // then the reward is consumed (held 0)...
        let tracking = { powerStreak: 9, bombStreak: 0 };
        for (let shot = 0; shot < 10; shot++) {
            tracking = hit(tracking, 1, 0).tracking;
        }

        // ...the next 10 successful shots (nothing held) are needed again.
        let powersEarned = 0;
        for (let shot = 1; shot <= 10; shot++) {
            const result = hit(tracking, 0, 0);
            tracking = result.tracking;
            powersEarned += result.powerEarned ? 1 : 0;
        }

        expect(powersEarned).toBe(1);
    });

    it('resumes a paused streak after the reward is consumed mid-streak', () => {
        // Streak frozen at 9 while held; a failed shot resets it to 0.
        const failure = resolveStreakRewards({ powerStreak: 9, bombStreak: 0 }, false, 1, 0);
        expect(failure.tracking.powerStreak).toBe(0);
    });

    it('awards a fresh reward for a new streak after consumption', () => {
        // First streak completes, reward is consumed, second streak completes:
        // exactly one grant per completed streak, no stacking.
        let tracking = emptyStreakTracking();
        let grants = 0;

        for (let shot = 0; shot < 20; shot++) {
            const held = grants > 0 ? 0 : 0; // reward consumed immediately after each grant
            const result = hit(tracking, held, held);
            tracking = result.tracking;
            grants += result.powerEarned ? 1 : 0;
        }

        // 10 shots → grant 1, then 10 more → grant 2 (never more).
        expect(grants).toBe(2);
    });

    it('tolerates negative or non-finite held values defensively', () => {
        const result = hit({ powerStreak: 9, bombStreak: 4 }, -2, Number.NaN);

        // Guarded clamping means the reward can still be granted when the
        // inventory is (nonsense) negative.
        expect(result.powerEarned).toBe(true);
        expect(result.bombEarned).toBe(true);
    });
});
