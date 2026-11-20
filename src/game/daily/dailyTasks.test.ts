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
        expect(daily.DAILY_REWARD_TOTAL).toBe(
            daily.DAILY_MISSIONS.reduce((sum, mission) => sum + mission.reward, 0)
        );
        const ids = daily.DAILY_MISSIONS.map((mission) => mission.id);
        expect(ids).not.toContain('play3');
        expect(ids).not.toContain('complete2');
        expect(ids).not.toContain('destroy100');
        expect(ids).not.toContain('champion');
        for (const mission of daily.DAILY_MISSIONS) {
            expect(mission.target).toBeGreaterThanOrEqual(4);
            expect(mission.reward).toBeGreaterThan(0);
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

        const streak = mission('forty-streak');
        state = daily.recordDailyEvent('streakBubbles', streak.target, { now });
        expect(daily.missionProgress(state, streak)).toBe(streak.target);

        const fire = mission('fire-bubbles');
        state = daily.recordDailyEvent('fireBubbles', fire.target, { now });
        expect(daily.missionProgress(state, fire)).toBe(fire.target);

        const bomb = mission('bomb-bubbles');
        state = daily.recordDailyEvent('bombBubbles', bomb.target, { now });
        expect(daily.missionProgress(state, bomb)).toBe(bomb.target);

        const chain = mission('chain-reactions');
        state = daily.recordDailyEvent('chainBubbles', chain.target, { now });
        expect(daily.missionProgress(state, chain)).toBe(chain.target);
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

        // Distinct levels only: the required number of different ids completes it.
        const levels = mission('five-different-levels').target;
        for (let level = 3; level < levels; level += 1) {
            daily.recordDailyEvent('completeLevel', 1, { now, levelId: level });
        }
        const cleanTarget = mission('three-no-power').target;
        for (let level = 3; level < cleanTarget; level += 1) {
            daily.recordDailyEvent('cleanLevel', 1, { now, levelId: level });
        }
        state = daily.loadDailyProgress(now);
        expect(daily.missionProgress(state, mission('five-different-levels'))).toBe(levels);
        expect(daily.isMissionComplete(state, mission('five-different-levels'))).toBe(true);
        expect(daily.isMissionComplete(state, mission('three-no-power'))).toBe(true);
    });

    it('awards efficient and star objectives only from qualifying level outcomes', async () => {
        install();
        const daily = await load();
        const now = new Date('2026-11-06T06:00:00Z');
        const mission = (id: string) => daily.DAILY_MISSIONS.find((candidate) => candidate.id === id)!;

        const efficientTarget = mission('two-efficient').target;
        for (let level = 0; level < efficientTarget; level += 1) {
            daily.recordDailyEvent('efficientLevel', 1, { now, levelId: level });
        }
        // A level must not be counted twice even if replayed better.
        daily.recordDailyEvent('efficientLevel', 1, { now, levelId: 0 });
        const starTarget = mission('three-two-stars').target;
        for (let level = 0; level < starTarget; level += 1) {
            daily.recordDailyEvent('starLevel', 1, { now, levelId: level });
        }

        const state = daily.loadDailyProgress(now);
        expect(daily.missionProgress(state, mission('two-efficient'))).toBe(efficientTarget);
        expect(daily.missionProgress(state, mission('three-two-stars'))).toBe(starTarget);
        expect(daily.completedCount(state)).toBeGreaterThan(0);
    });

    it('claims a completed task exactly once with its difficulty-based reward', async () => {
        install();
        const daily = await load();
        const storage = await loadStorage();
        storage.addCoins(0);
        const now = new Date('2026-11-06T06:00:00Z');
        const before = storage.loadProgress().coins;

        const bubbleMission = daily.DAILY_MISSIONS.find((mission) => mission.id === 'clear-150-bubbles')!;

        // Not complete yet: no payout.
        daily.recordDailyEvent('bubblesCleared', bubbleMission.target - 1, { now });
        expect(daily.claimDailyReward('clear-150-bubbles', now).claimed).toBe(false);
        daily.recordDailyEvent('bubblesCleared', 1, { now });

        expect(daily.claimDailyReward('clear-150-bubbles', now).claimed).toBe(true);
        expect(daily.claimDailyReward('clear-150-bubbles', now).claimed).toBe(false);
        expect(storage.loadProgress().coins).toBe(before + bubbleMission.reward);

        // A harder task pays more than an easier one.
        const easy = daily.DAILY_MISSIONS.find((mission) => mission.id === 'clear-150-bubbles')!;
        const hard = daily.DAILY_MISSIONS.find((mission) => mission.id === 'two-efficient')!;
        expect(hard.reward).toBeGreaterThan(easy.reward);
    });

    it('resets every 24 hours but not for a backwards clock', async () => {
        install();
        const daily = await load();
        const dayOne = new Date('2026-11-06T06:00:00Z');
        const dayTwo = new Date('2026-11-07T06:00:00Z');

        daily.recordDailyEvent('bubblesCleared', 30, { now: dayOne });
        expect(daily.loadDailyProgress(dayOne).progress['clear-150-bubbles']).toBe(30);
        expect(daily.loadDailyProgress(dayTwo).progress['clear-150-bubbles']).toBeUndefined();

        // Backwards clock keeps the later cycle (no replay).
        daily.recordDailyEvent('bubblesCleared', 30, { now: dayTwo });
        expect(daily.loadDailyProgress(dayOne).day).toBe('2026-11-07');
    });

    it('keeps progress until the full 24 hours have passed', async () => {
        install();
        const daily = await load();
        const start = new Date('2026-11-06T06:00:00Z');
        const almost = new Date(start.getTime() + daily.DAILY_RESET_MS - 1000);
        const due = new Date(start.getTime() + daily.DAILY_RESET_MS);

        daily.recordDailyEvent('bubblesCleared', 30, { now: start });
        expect(daily.loadDailyProgress(almost).progress['clear-150-bubbles']).toBe(30);
        expect(daily.dailyResetCountdownMs(almost)).toBe(1000);

        expect(daily.loadDailyProgress(due).progress['clear-150-bubbles']).toBeUndefined();
        expect(daily.dailyResetCountdownMs(due)).toBe(daily.DAILY_RESET_MS);
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
