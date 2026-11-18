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

describe('hard daily tasks', () => {
    it('replaces the old conditions with a harder, fully tracked set', async () => {
        install();
        const daily = await load();

        expect(daily.DAILY_MISSIONS).toHaveLength(9);
        expect(daily.DAILY_REWARD_TOTAL).toBe(300);
        const ids = daily.DAILY_MISSIONS.map((mission) => mission.id);
        expect(ids).not.toContain('play3');
        expect(ids).not.toContain('complete2');
        expect(ids).not.toContain('destroy100');
        expect(ids).not.toContain('champion');
        for (const mission of daily.DAILY_MISSIONS) {
            expect(mission.target).toBeGreaterThan(1);
            expect(mission.reward).toBeGreaterThanOrEqual(25);
            expect(mission.description.length).toBeGreaterThan(10);
        }
    });

    it('tracks bubble totals, streaks, fire, bomb and big chains immediately', async () => {
        install();
        const daily = await load();
        const now = new Date('2026-11-06T06:00:00Z');
        const mission = (id: string) => daily.DAILY_MISSIONS.find((candidate) => candidate.id === id)!;

        let state = daily.recordDailyEvent('bubblesCleared', 40, { now });
        expect(daily.missionProgress(state, mission('clear-150-bubbles'))).toBe(40);

        state = daily.recordDailyEvent('streakBubbles', 24, { now });
        state = daily.recordDailyEvent('streakBubbles', 24, { now });
        expect(daily.missionProgress(state, mission('forty-streak'))).toBe(40);

        state = daily.recordDailyEvent('fireBubbles', 12, { now });
        state = daily.recordDailyEvent('fireBubbles', 20, { now });
        expect(daily.missionProgress(state, mission('fire-bubbles'))).toBe(25);

        state = daily.recordDailyEvent('bombBubbles', 10, { now });
        state = daily.recordDailyEvent('bombBubbles', 15, { now });
        expect(daily.missionProgress(state, mission('bomb-bubbles'))).toBe(20);

        state = daily.recordDailyEvent('chainBubbles', 8, { now });
        state = daily.recordDailyEvent('chainBubbles', 16, { now });
        expect(daily.missionProgress(state, mission('chain-reactions'))).toBe(20);
    });

    it('counts each level once for per-level objectives', async () => {
        install();
        const daily = await load();
        const now = new Date('2026-11-06T06:00:00Z');
        const mission = (id: string) => daily.DAILY_MISSIONS.find((candidate) => candidate.id === id)!;

        for (let level = 0; level < 3; level += 1) {
            daily.recordDailyEvent('completeLevel', 1, { now, levelId: level });
            daily.recordDailyEvent('cleanLevel', 1, { now, levelId: level });
        }
        // Replays of already-counted levels must not advance anything.
        daily.recordDailyEvent('completeLevel', 1, { now, levelId: 0 });
        daily.recordDailyEvent('cleanLevel', 1, { now, levelId: 0 });

        let state = daily.loadDailyProgress(now);
        expect(daily.missionProgress(state, mission('five-different-levels'))).toBe(3);
        expect(daily.missionProgress(state, mission('three-no-power'))).toBe(3);

        // Distinct levels only: five different ids complete that objective.
        daily.recordDailyEvent('completeLevel', 1, { now, levelId: 3 });
        daily.recordDailyEvent('completeLevel', 1, { now, levelId: 4 });
        state = daily.loadDailyProgress(now);
        expect(daily.missionProgress(state, mission('five-different-levels'))).toBe(5);
        expect(daily.isMissionComplete(state, mission('five-different-levels'))).toBe(true);
    });

    it('awards efficient and star objectives only from qualifying level outcomes', async () => {
        install();
        const daily = await load();
        const now = new Date('2026-11-06T06:00:00Z');
        const mission = (id: string) => daily.DAILY_MISSIONS.find((candidate) => candidate.id === id)!;

        daily.recordDailyEvent('efficientLevel', 1, { now, levelId: 0 });
        daily.recordDailyEvent('starLevel', 1, { now, levelId: 0 });
        // A level must not be counted twice even if replayed better.
        daily.recordDailyEvent('efficientLevel', 1, { now, levelId: 0 });
        daily.recordDailyEvent('starLevel', 1, { now, levelId: 0 });
        daily.recordDailyEvent('efficientLevel', 1, { now, levelId: 1 });
        daily.recordDailyEvent('starLevel', 1, { now, levelId: 1 });
        daily.recordDailyEvent('starLevel', 1, { now, levelId: 2 });

        const state = daily.loadDailyProgress(now);
        expect(daily.missionProgress(state, mission('two-efficient'))).toBe(2);
        expect(daily.missionProgress(state, mission('three-two-stars'))).toBe(3);
        expect(daily.completedCount(state)).toBeGreaterThan(0);
    });

    it('claims a completed task exactly once with its difficulty-based reward', async () => {
        install();
        const daily = await load();
        const storage = await loadStorage();
        storage.addCoins(0);
        const now = new Date('2026-11-06T06:00:00Z');
        const before = storage.loadProgress().coins;

        // Not complete yet: no payout.
        daily.recordDailyEvent('bubblesCleared', 149, { now });
        expect(daily.claimDailyReward('clear-150-bubbles', now).claimed).toBe(false);
        daily.recordDailyEvent('bubblesCleared', 1, { now });

        expect(daily.claimDailyReward('clear-150-bubbles', now).claimed).toBe(true);
        expect(daily.claimDailyReward('clear-150-bubbles', now).claimed).toBe(false);
        expect(storage.loadProgress().coins).toBe(before + 25);

        // A harder task pays more than an easier one.
        const easy = daily.DAILY_MISSIONS.find((mission) => mission.id === 'clear-150-bubbles')!;
        const hard = daily.DAILY_MISSIONS.find((mission) => mission.id === 'two-efficient')!;
        expect(hard.reward).toBeGreaterThan(easy.reward);
    });

    it('resets for a new Dhaka day but not for a backwards clock', async () => {
        install();
        const daily = await load();
        const dayOne = new Date('2026-11-06T06:00:00Z');
        const dayTwo = new Date('2026-11-07T06:00:00Z');

        daily.recordDailyEvent('bubblesCleared', 30, { now: dayOne });
        expect(daily.loadDailyProgress(dayOne).progress['clear-150-bubbles']).toBe(30);
        expect(daily.loadDailyProgress(dayTwo).progress['clear-150-bubbles']).toBeUndefined();

        // Backwards clock keeps the later day (no replay).
        daily.recordDailyEvent('bubblesCleared', 30, { now: dayTwo });
        expect(daily.loadDailyProgress(dayOne).day).toBe('2026-11-07');
    });

    it('does not reset progress when the screen is reopened', async () => {
        install();
        const daily = await load();
        const now = new Date('2026-11-06T06:00:00Z');
        daily.recordDailyEvent('bubblesCleared', 60, { now });
        expect(daily.loadDailyProgress(now).progress['clear-150-bubbles']).toBe(60);
        expect(daily.loadDailyProgress(now).progress['clear-150-bubbles']).toBe(60);
        expect(daily.loadDailyProgress(now).claimed).toEqual([]);
    });
});
