import { describe, expect, it } from 'vitest';
import { consumeFireCharge, resolveFireChargeReward } from './FireChargeSystem';

describe('FireChargeSystem', () => {
    it.each([
        [0, 9, 0, 0, false],
        [0, 10, 0, 1, true],
        [0, 20, 0, 1, true],
        [1, 15, 0, 1, false],
        [0, 6, 4, 1, true],
    ])('resolves direct=%i unsupported=%i reward', (charges, direct, unsupported, expected, earned) => {
        const result = resolveFireChargeReward(charges, direct, unsupported);
        expect(result.charges).toBe(expected);
        expect(result.earned).toBe(earned);
    });

    it('consumes one charge exactly once', () => {
        expect(consumeFireCharge(1)).toBe(0);
        expect(consumeFireCharge(0)).toBe(0);
    });

    it('allows a new charge after the previous one is consumed', () => {
        expect(resolveFireChargeReward(consumeFireCharge(1), 10, 0)).toEqual({ charges: 1, earned: true });
    });
});
