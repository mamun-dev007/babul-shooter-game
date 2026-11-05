import { describe, expect, it } from 'vitest';
import {
    emptyFireChargeProgress,
    requiredShotsForFireCharge,
    resolveFireChargeProgress,
} from './fireChargeProgress';

const totalOf = (value: number): number => value;

describe('requiredShotsForFireCharge', () => {
    it('targets exactly one third of the level shots, rounded down (floor, never ceil)', () => {
        expect(requiredShotsForFireCharge(36)).toBe(12);
        // Spec example: 19 shots → floor(19 / 3) = 6 (ceil would say 7).
        expect(requiredShotsForFireCharge(totalOf(19))).toBe(6);
        expect(requiredShotsForFireCharge(totalOf(10))).toBe(3);
        expect(requiredShotsForFireCharge(totalOf(1))).toBe(1);
        expect(requiredShotsForFireCharge(totalOf(0))).toBe(1);
    });

    it('uses floor, not ceil, for every non-divisible shot budget', () => {
        for (const total of [7, 8, 11, 16, 19, 22, 25, 28, 31]) {
            expect(requiredShotsForFireCharge(total)).toBe(Math.floor(total / 3));
            expect(requiredShotsForFireCharge(total)).toBeLessThan(Math.ceil(total / 3));
        }
    });
});

describe('resolveFireChargeProgress', () => {
    it('charges (streak / requiredShots) * 100 per successful shot (36 shots → 12 required)', () => {
        let state = emptyFireChargeProgress(36);

        for (let shot = 0; shot < 5; shot++) {
            state = resolveFireChargeProgress(state, true, 36).progress;
        }

        // 5 successful shots ≈ 41.67%, never 100%.
        expect(state.requiredShots).toBe(12);
        expect(state.streak).toBe(5);
        expect(state.percent).toBeCloseTo(100 / 12 * 5, 6);
        expect(state.percent).toBeLessThan(100);
    });

    it('becomes exactly 100% on the completing shot and flags the transition once', () => {
        let state = emptyFireChargeProgress(6); // required = 2

        const first = resolveFireChargeProgress(state, true, 6);
        state = first.progress;
        expect(state.percent).toBeCloseTo(50, 6);
        expect(first.reachedFull).toBe(false);

        const second = resolveFireChargeProgress(state, true, 6);
        state = second.progress;
        expect(second.reachedFull).toBe(true);
        expect(state.percent).toBe(100);
        expect(state.streak).toBe(2);

        // Further successes while unspent hold 100% without re-flagging.
        const third = resolveFireChargeProgress(state, true, 6);
        expect(third.reachedFull).toBe(false);
        expect(third.progress.percent).toBe(100);
    });

    it('resets the whole streak to 0% when a shot destroys nothing (spec example: 5 shots = 83.33% on a 19-shot level)', () => {
        // 19 shots → required = 6; 5 successes = (5 / 6) * 100 ≈ 83.33%.
        let state = emptyFireChargeProgress(19);

        for (let shot = 0; shot < 5; shot++) {
            state = resolveFireChargeProgress(state, true, 19).progress;
        }

        expect(state.requiredShots).toBe(6);
        expect(state.percent).toBeCloseTo(83.3333, 3);

        const step = resolveFireChargeProgress(state, false, 19);

        expect(step.reset).toBe(true);
        expect(step.progress.streak).toBe(0);
        expect(step.progress.percent).toBe(0);
        expect(step.reachedFull).toBe(false);
    });

    it('grows the requirements when bonus shots extend the attempt', () => {
        // Budget 33 → required 11; +3 rewarded-ad bonus shots → 36 → 12.
        let state = emptyFireChargeProgress(33);
        state = resolveFireChargeProgress(state, true, 36).progress;

        expect(state.requiredShots).toBe(12);
    });

    it('needs a single success on the smallest possible attempt', () => {
        let state = emptyFireChargeProgress(1);

        const step = resolveFireChargeProgress(state, true, 1);

        expect(step.reachedFull).toBe(true);
        expect(step.progress.percent).toBe(100);
    });
});
