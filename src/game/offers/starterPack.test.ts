import { afterEach, describe, expect, it, vi } from 'vitest';

class MemoryStorage {
    private readonly values = new Map<string, string>();
    getItem(key: string): string | null {
        return this.values.get(key) ?? null;
    }
    setItem(key: string, value: string): void {
        this.values.set(key, String(value));
    }
    removeItem(key: string): void {
        this.values.delete(key);
    }
}

const install = () => {
    const storage = new MemoryStorage();
    vi.stubGlobal('window', { localStorage: storage });
    vi.stubGlobal('localStorage', storage);
    vi.resetModules();
    return storage;
};

afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
});

describe('starter pack offer', () => {
    it('starts a fresh 24-hour cycle and never resets when reopened', async () => {
        install();
        const offer = await import('./starterPack');
        const start = new Date('2026-11-20T10:00:00Z');

        const state = offer.getStarterPackState(start);
        expect(state.cycleIndex).toBe(0);
        expect(state.startedAt).toBe(start.getTime());
        expect(state.remainingMs).toBe(offer.STARTER_OFFER_DURATION_MS);
        expect(offer.formatOfferCountdown(state.remainingMs)).toBe('24:00:00');

        const later = new Date(start.getTime() + 60 * 60 * 1000);
        const reopened = offer.getStarterPackState(later);
        expect(reopened.cycleIndex).toBe(0);
        expect(reopened.startedAt).toBe(start.getTime());
        expect(offer.formatOfferCountdown(reopened.remainingMs)).toBe('23:00:00');
    });

    it('rotates forward by whole 24-hour periods after offline time', async () => {
        install();
        const offer = await import('./starterPack');
        const start = new Date('2026-11-20T10:00:00Z');
        offer.getStarterPackState(start);

        const afterOneDay = new Date(start.getTime() + offer.STARTER_OFFER_DURATION_MS + 1000);
        const next = offer.getStarterPackState(afterOneDay);
        expect(next.cycleIndex).toBe(1);
        expect(next.offer.id).toBe(offer.STARTER_PACK_OFFERS[1].id);
        expect(next.startedAt).toBe(start.getTime() + offer.STARTER_OFFER_DURATION_MS);
        expect(offer.formatOfferCountdown(next.remainingMs)).toBe('23:59:59');

        const afterThreeDays = new Date(start.getTime() + offer.STARTER_OFFER_DURATION_MS * 3 + 5000);
        const later = offer.getStarterPackState(afterThreeDays);
        expect(later.cycleIndex).toBe(3);
        expect(later.startedAt).toBe(start.getTime() + offer.STARTER_OFFER_DURATION_MS * 3);
        expect(later.offer.id).toBe(offer.STARTER_PACK_OFFERS[3].id);
    });

    it('rotates values up and down using predefined purchasable offers', async () => {
        install();
        const offer = await import('./starterPack');
        const { REAL_MONEY_PRODUCTS } = await import('../store/realMoneyCatalog');

        expect(offer.STARTER_PACK_OFFERS.length).toBeGreaterThan(3);
        const ids = new Set(offer.STARTER_PACK_OFFERS.map((item) => item.id));
        expect(ids.size).toBe(offer.STARTER_PACK_OFFERS.length);

        const catalogSkus = new Set(REAL_MONEY_PRODUCTS.map((item) => item.sku));
        for (const item of offer.STARTER_PACK_OFFERS) {
            const product = REAL_MONEY_PRODUCTS.find((candidate) => candidate.sku === item.sku);
            expect(catalogSkus.has(item.sku)).toBe(true);
            expect(product?.coins).toBe(item.coins);
            expect(item.discountPercent).toBeGreaterThan(0);
            expect(item.discountPercent).toBeLessThanOrEqual(90);
            expect(item.price).toMatch(/^USD \$\d+(?:\.\d{2})?$/);
            expect(offer.starterPackProduct(item).sku).toBe(item.sku);
        }

        const coins = offer.STARTER_PACK_OFFERS.map((item) => item.coins);
        expect(Math.max(...coins)).toBeGreaterThan(Math.min(...coins) * 3);
        expect(coins[0]).not.toBe(coins[1]);
    });

    it('marks one purchase per offer cycle and unlocks again after reset', async () => {
        install();
        const offer = await import('./starterPack');
        const start = new Date('2026-11-20T10:00:00Z');
        const first = offer.getStarterPackState(start);

        expect(offer.isStarterPackPurchased(start)).toBe(false);
        expect(offer.markStarterPackPurchased(first.cycleIndex, start)).toBe(true);
        expect(offer.isStarterPackPurchased(start)).toBe(true);
        expect(offer.markStarterPackPurchased(first.cycleIndex, start)).toBe(false);

        const nextDay = new Date(start.getTime() + offer.STARTER_OFFER_DURATION_MS);
        const rotated = offer.getStarterPackState(nextDay);
        expect(rotated.cycleIndex).toBe(first.cycleIndex + 1);
        expect(offer.isStarterPackPurchased(nextDay)).toBe(false);
        expect(offer.markStarterPackPurchased(first.cycleIndex, nextDay)).toBe(false);
        expect(offer.markStarterPackPurchased(rotated.cycleIndex, nextDay)).toBe(true);
    });

    it('formats durations as HH:MM:SS', async () => {
        install();
        const offer = await import('./starterPack');
        expect(offer.formatOfferCountdown(0)).toBe('00:00:00');
        expect(offer.formatOfferCountdown(61 * 1000)).toBe('00:01:01');
        expect(offer.formatOfferCountdown(offer.STARTER_OFFER_DURATION_MS)).toBe('24:00:00');
    });
});
