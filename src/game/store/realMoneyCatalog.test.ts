import { describe, expect, it } from 'vitest';
import { REAL_MONEY_PRODUCTS } from './realMoneyCatalog';
import { isPaymentAvailable, requestPurchase } from '../payments/payments';

describe('real money catalog', () => {
    it('has the 10 specified packs with coin + bonus rewards', () => {
        expect(REAL_MONEY_PRODUCTS).toHaveLength(10);
        const byId = new Map(REAL_MONEY_PRODUCTS.map((p) => [p.id, p]));
        expect(byId.get('real-starter')).toMatchObject({ coins: 100, grants: { bomb: 2, fireball: 1, colorChanger: 5 }, usdPrice: '$0.99' });
        expect(byId.get('real-basic')?.usdPrice).toBe('$1.49');
        expect(byId.get('real-bronze')?.usdPrice).toBe('$1.99');
        expect(byId.get('real-silver')?.usdPrice).toBe('$2.59');
        expect(byId.get('real-gold')?.usdPrice).toBe('$2.99');
        expect(byId.get('real-platinum')?.usdPrice).toBe('$3.99');
        expect(byId.get('real-diamond')?.usdPrice).toBe('$4.99');
        expect(byId.get('real-master')?.usdPrice).toBe('$6.99');
        expect(byId.get('real-ultimate')?.usdPrice).toBe('$9.99');
        expect(byId.get('real-legendary')?.usdPrice).toBe('$19.99');
        expect(byId.get('real-legendary')?.coins).toBe(20000);
        expect(byId.get('real-legendary')?.grants).toMatchObject({ bomb: 300, fireball: 200, colorChanger: 500 });
        const skus = REAL_MONEY_PRODUCTS.map((p) => p.sku);
        expect(new Set(skus).size).toBe(10);
    });

    it('never simulates a purchase when payments are unavailable', async () => {
        expect(isPaymentAvailable()).toBe(false);
        const outcome = await requestPurchase(REAL_MONEY_PRODUCTS[0]);
        expect(outcome.status).toBe('unavailable');
    });
});
