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

describe('collected items daily tracker', () => {
    it('counts each confirmed card once and shares gift + daily progress', async () => {
        install();
        const collected = await import('./collected');
        const now = new Date('2026-11-08T10:00:00Z');

        expect(collected.getCollectedCount(now)).toBe(0);
        expect(collected.recordCollectedCard('gift', 'starter', now)).toBe(1);
        // Same card never counts twice.
        expect(collected.recordCollectedCard('gift', 'starter', now)).toBe(1);
        expect(collected.recordCollectedCard('daily', 'play3', now)).toBe(2);
        expect(collected.getCollectedCount(now)).toBe(2);
    });

    it('unlocks a single 20-coin claim at 15/15, persisted for the day', async () => {
        install();
        const collected = await import('./collected');
        const storageModule = await import('../utils/storage');
        const now = new Date('2026-11-08T10:00:00Z');

        for (let i = 0; i < 5; i += 1) {
            collected.recordCollectedCard('gift', `g${i}`, now);
        }
        for (let i = 0; i < 10; i += 1) {
            collected.recordCollectedCard('daily', `d${i}`, now);
        }
        expect(collected.getCollectedCount(now)).toBe(15);
        expect(collected.isCollectedRewardAvailable(now)).toBe(true);

        const before = storageModule.loadProgress().coins;
        expect(collected.claimCollectedReward(now)).toBe(true);
        expect(storageModule.loadProgress().coins).toBe(before + 20);
        // Duplicate claim on the same day pays nothing.
        expect(collected.claimCollectedReward(now)).toBe(false);
        expect(storageModule.loadProgress().coins).toBe(before + 20);
        expect(collected.isCollectedRewardAvailable(now)).toBe(false);
    });

    it('resets on a new local day and cannot claim before 15', async () => {
        install();
        const collected = await import('./collected');
        const dayOne = new Date(2026, 10, 8, 10, 0, 0);
        const dayTwo = new Date(2026, 10, 9, 9, 0, 0);

        // Two different local days (independent of timezone).
        expect(collected.localDayString(dayOne)).not.toBe(collected.localDayString(dayTwo));
        for (let i = 0; i < 14; i += 1) {
            collected.recordCollectedCard('gift', `g${i}`, dayOne);
        }
        // Not enough yet.
        expect(collected.claimCollectedReward(dayOne)).toBe(false);
        collected.recordCollectedCard('gift', 'g14', dayOne);
        expect(collected.claimCollectedReward(dayOne)).toBe(true);
        // New day resets to 0 and cannot repay.
        expect(collected.getCollectedCount(dayTwo)).toBe(0);
        expect(collected.isCollectedRewardAvailable(dayTwo)).toBe(false);
    });
});
