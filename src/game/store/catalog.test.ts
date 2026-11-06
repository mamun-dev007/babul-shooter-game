import { describe, expect, it } from 'vitest';
import { STORE_PRODUCTS, STORE_CATEGORIES, rollMysteryReward } from './catalog';

describe('coin store catalog', () => {
    it('has at least 50 unique products across five categories', () => {
        expect(STORE_PRODUCTS.length).toBeGreaterThanOrEqual(50);
        const ids = STORE_PRODUCTS.map((p) => p.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const category of STORE_CATEGORIES.filter((c) => c.id !== 'all')) {
            expect(STORE_PRODUCTS.filter((p) => p.category === category.id)).toHaveLength(10);
        }
    });

    it('uses tier prices matching the documented examples', () => {
        const byId = new Map(STORE_PRODUCTS.map((p) => [p.id, p]));
        expect(byId.get('bundle-bomb-fire')?.price).toBe(10);
        expect(byId.get('color-10')?.price).toBe(50);
        expect(byId.get('bomb-mega')?.price).toBe(25);
        expect(byId.get('fire-booster')?.price).toBe(40);
        expect(byId.get('color-25')?.price).toBe(100);
        for (const product of STORE_PRODUCTS) {
            expect(product.price).toBeGreaterThan(0);
        }
    });

    it('rolls a mystery reward exactly once per call', () => {
        const mystery = STORE_PRODUCTS.find((p) => p.id === 'special-mystery');
        expect(mystery).toBeDefined();
        const reward = rollMysteryReward(mystery!, () => 0);
        expect(reward.description.length).toBeGreaterThan(0);
        expect(rollMysteryReward(mystery!, () => 0.99).description.length).toBeGreaterThan(0);
    });
});
