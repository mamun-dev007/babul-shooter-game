import { afterEach, describe, expect, it, vi } from 'vitest';
import { configurePayments, missingProductReason, requestPurchase, type PaymentProvider } from './payments';
import { REAL_MONEY_PRODUCTS } from '../store/realMoneyCatalog';
import { STARTER_PACK_OFFERS, starterPackProduct } from '../offers/starterPack';

const inactiveProvider: PaymentProvider = {
    id: 'test-inactive',
    isConfigured: () => false,
    queryProducts: async () => new Map(),
    purchase: async () => ({ status: 'unavailable', reason: 'Not configured.' }),
};

afterEach(() => {
    configurePayments(inactiveProvider);
});

describe('payment provider routing', () => {
    it('routes every real-money product purchase through the configured billing provider', async () => {
        const purchase = vi.fn().mockResolvedValue({
            status: 'granted',
            transactionId: 'test-transaction',
            platform: 'google-play',
            receipt: 'test-token',
        });
        configurePayments({
            id: 'test-google-play-billing',
            isConfigured: () => true,
            queryProducts: async (productIds) =>
                new Map(productIds.map((productId) => [productId, { productId, displayPrice: '$1.00', currency: 'USD' }])),
            purchase,
        });

        for (const product of REAL_MONEY_PRODUCTS) {
            const outcome = await requestPurchase(product);
            expect(outcome.status).toBe('granted');
            expect(purchase).toHaveBeenCalledWith(product.sku);
        }

        const starterProduct = starterPackProduct(STARTER_PACK_OFFERS[0]);
        const starterOutcome = await requestPurchase(starterProduct);
        expect(starterOutcome.status).toBe('granted');
        expect(purchase).toHaveBeenCalledWith(starterProduct.sku);
    });

    it('blocks purchase when the configured provider cannot find the exact SKU', async () => {
        const purchase = vi.fn();
        configurePayments({
            id: 'test-google-play-billing',
            isConfigured: () => true,
            queryProducts: async () => new Map(),
            purchase,
        });

        const product = REAL_MONEY_PRODUCTS[0];
        const outcome = await requestPurchase(product);
        expect(outcome.status).toBe('failed');
        expect(outcome.status === 'failed' && outcome.reason).toBe(missingProductReason(product.sku));
        expect(outcome.status === 'failed' && outcome.reason).toContain(product.sku);
        expect(purchase).not.toHaveBeenCalled();
    });

    it('uses the provider platform message when payments are unavailable', async () => {
        const purchase = vi.fn();
        configurePayments({
            id: 'test-web-provider',
            unavailableReason: () => 'Google Play payments are only available in the Android app.',
            isConfigured: () => false,
            queryProducts: async () => new Map(),
            purchase,
        });

        const outcome = await requestPurchase(REAL_MONEY_PRODUCTS[0]);
        expect(outcome).toEqual({
            status: 'unavailable',
            reason: 'Google Play payments are only available in the Android app.',
        });
        expect(purchase).not.toHaveBeenCalled();
    });
});
