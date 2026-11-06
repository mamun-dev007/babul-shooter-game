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

const load = async () => import('./dailyTasks');
const loadStorage = async () => import('../utils/storage');

afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
});

describe('daily tasks', () => {
    it('tracks progress, completes and claims exactly once', async () => {
        install();
        const daily = await load();
        const storage = await loadStorage();
        storage.addCoins(0);
        const now = new Date('2026-11-06T06:00:00Z');

        let state = daily.loadDailyProgress(now);
        expect(daily.DAILY_MISSIONS).toHaveLength(6);
        expect(daily.DAILY_REWARD_TOTAL).toBe(55);

        state = daily.recordDailyEvent('play', 3, now);
        expect(daily.missionProgress(state, daily.DAILY_MISSIONS[0])).toBe(3);
        expect(daily.isMissionComplete(state, daily.DAILY_MISSIONS[0])).toBe(true);

        state = daily.recordDailyEvent('destroy', 150, now);
        expect(daily.missionProgress(state, daily.DAILY_MISSIONS[2])).toBe(100);

        const before = storage.loadProgress().coins;
        expect(daily.claimDailyReward('play3', now).claimed).toBe(true);
        expect(daily.claimDailyReward('play3', now).claimed).toBe(false);
        expect(storage.loadProgress().coins).toBe(before + 5);
    });

    it('unlocks champion only after all five regular missions complete', async () => {
        install();
        const daily = await load();
        const now = new Date('2026-11-06T06:00:00Z');
        daily.recordDailyEvent('play', 3, now);
        daily.recordDailyEvent('complete', 2, now);
        daily.recordDailyEvent('destroy', 100, now);
        daily.recordDailyEvent('fire', 2, now);
        daily.recordDailyEvent('bomb', 2, now);
        const state = daily.loadDailyProgress(now);
        const champion = daily.DAILY_MISSIONS[5];
        expect(daily.missionProgress(state, champion)).toBe(5);
        expect(daily.completedCount(state)).toBe(6);
    });

    it('resets for a new Dhaka day but not for a backwards clock', async () => {
        install();
        const daily = await load();
        const dayOne = new Date('2026-11-06T06:00:00Z');
        const dayTwo = new Date('2026-11-07T06:00:00Z');
        daily.recordDailyEvent('play', 3, dayOne);
        expect(daily.loadDailyProgress(dayOne).progress.play3).toBe(3);
        expect(daily.loadDailyProgress(dayTwo).progress.play3).toBeUndefined();
        // Backwards clock keeps the later day (no replay).
        daily.recordDailyEvent('play', 3, dayTwo);
        expect(daily.loadDailyProgress(dayOne).day).toBe('2026-11-07');
    });
});
