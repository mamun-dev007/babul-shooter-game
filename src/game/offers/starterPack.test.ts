import { afterEach, describe, expect, it, vi } from 'vitest';

class MemoryStorage {
    private readonly values = new Map<string, string>();
    getItem(key: string): string | null {
        return this.values.get(key) ?? null;
    }
    setItem(key: string, value: string): void {
        this.values.set(key, String(value));
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
    it('starts at 71:59:18 and persists the deadline (no reset on reopen)', async () => {
        install();
        const offer = await import('./starterPack');
        const now = new Date('2026-11-08T10:00:00Z');

        const deadline = offer.getStarterPackDeadline(now);
        expect(deadline).toBe(now.getTime() + (71 * 3600 + 59 * 60 + 18) * 1000);
        expect(offer.formatOfferCountdown(offer.starterPackRemainingMs(now))).toBe('71:59:18');
        // Reopening later continues the same countdown, never resets to 71:59:18.
        const later = new Date(now.getTime() + 60 * 60 * 1000);
        expect(offer.getStarterPackDeadline(later)).toBe(deadline);
        expect(offer.formatOfferCountdown(offer.starterPackRemainingMs(later))).toBe('70:59:18');
        // Expiry sticks (does not restart).
        const after = new Date(deadline + 1000);
        expect(offer.starterPackRemainingMs(after)).toBe(0);
        expect(offer.isStarterPackExpired(after)).toBe(true);
        expect(offer.getStarterPackDeadline(after)).toBe(deadline);
    });

    it('formats durations as HH:MM:SS', async () => {
        install();
        const offer = await import('./starterPack');
        expect(offer.formatOfferCountdown(0)).toBe('00:00:00');
        expect(offer.formatOfferCountdown(61 * 1000)).toBe('00:01:01');
    });
});
