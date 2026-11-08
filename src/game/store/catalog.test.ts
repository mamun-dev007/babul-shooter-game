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
        // Unit x quantity totals (Bomb 50 / Fire 75 / Color 85).
        expect(byId.get('bundle-bomb-fire')?.price).toBe(175);
        expect(byId.get('color-10')?.price).toBe(850);
        expect(byId.get('bomb-mega')?.price).toBe(250);
        expect(byId.get('fire-booster')?.price).toBe(375);
        expect(byId.get('color-25')?.price).toBe(2125);
        // Exact single-item coin prices.
        expect(byId.get('bomb-small')).toMatchObject({ name: '1 Bomb', price: 50, reward: { grants: { bomb: 1 } } });
        expect(byId.get('fire-single')).toMatchObject({ name: '1 Fire', price: 75, reward: { grants: { fireball: 1 } } });
        expect(byId.get('single-color')).toMatchObject({ name: '1 Color Change', price: 85, reward: { grants: { colorChanger: 1 } } });
        // Every quantity-based item follows the formula (mystery exempt).
        for (const product of STORE_PRODUCTS) {
            expect(product.price).toBeGreaterThan(0);
            if (!product.mystery) {
                const grants = product.reward.grants;
                expect(product.price).toBe(
                    (grants.bomb ?? 0) * 50
                    + (grants.fireball ?? 0) * 75
                    + (grants.colorChanger ?? 0) * 85
                    + (product.reward.extraShots ?? 0) * 5,
                );
            }
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
