import { addCoins } from '../utils/storage';
import { grantPowerUp } from '../powerups/inventory';
import type { PowerUpInventory } from '../powerups/inventory';
import { recordCollectedCard } from '../collected/collected';

/**
 * Daily Tasks (Daily Missions) for the Bubble Shooter game.
 *
 * A fixed six-mission set is shown every day so the published titles,
 * objectives and rewards never drift; the template pool below documents
 * additional rotating templates for future cycles. Progress is persisted
 * under a Dhaka (Asia/Dhaka, UTC+6) calendar-day identifier — no backend
 * is available in this build, so day rollover is client-side, guarded by
 * a high-water mark so moving the device clock backwards cannot replay a
 * previous day.
 */

export interface DailyMission {
    id: string;
    title: string;
    description: string;
    target: number;
    reward: number;
    icon: 'play' | 'target' | 'bomb' | 'fire' | 'champion';
    /** Extra power-up rewards paid into the shared inventory on claim. */
    grants?: Partial<PowerUpInventory>;
}

export const DAILY_MISSIONS: readonly DailyMission[] = [
    { id: 'play3', title: 'Bubble Shooter', description: 'Play 3 levels', target: 3, reward: 5, icon: 'play' },
    { id: 'complete2', title: 'Level Master', description: 'Successfully complete 2 levels', target: 2, reward: 10, icon: 'target' },
    { id: 'destroy100', title: 'Bubble Popper', description: 'Destroy 100 bubbles', target: 100, reward: 10, icon: 'bomb' },
    { id: 'fire2', title: 'Fire Expert', description: 'Successfully use Fire Power 2 times', target: 2, reward: 5, icon: 'fire', grants: { fireball: 2 } },
    { id: 'bomb2', title: 'Bomb Master', description: 'Successfully use Bomb Power 2 times', target: 2, reward: 5, icon: 'bomb', grants: { bomb: 2 } },
    { id: 'champion', title: 'Daily Champion', description: 'Complete any 5 of the other 5 daily missions', target: 5, reward: 20, icon: 'champion' },
] as const;

export const DAILY_REWARD_TOTAL = DAILY_MISSIONS.reduce((sum, mission) => sum + mission.reward, 0);

/** Extra rotating templates kept for future daily cycles (same mechanics). */
export const DAILY_TEMPLATE_POOL: readonly DailyMission[] = [
    { id: 'destroy150', title: 'Bubble Storm', description: 'Destroy 150 bubbles', target: 150, reward: 15, icon: 'bomb' },
    { id: 'fire3', title: 'Flame Master', description: 'Successfully use Fire Power 3 times', target: 3, reward: 8, icon: 'fire' },
    { id: 'play5', title: 'Marathon', description: 'Play 5 levels', target: 5, reward: 8, icon: 'play' },
] as const;

export type DailyEventType = 'play' | 'complete' | 'destroy' | 'fire' | 'bomb';

export interface DailyProgress {
    day: string;
    progress: Record<string, number>;
    claimed: string[];
}

const STORAGE_KEY = 'bubble-shooter-daily.v1';

/** Asia/Dhaka is UTC+6 with no daylight-saving changes. */
export const dhakaDayString = (now: Date = new Date()): string => {
    const dhaka = new Date(now.getTime() + 6 * 60 * 60 * 1000);
    return dhaka.toISOString().slice(0, 10);
};

/** Milliseconds until the next Dhaka midnight. */
export const dhakaCountdownMs = (now: Date = new Date()): number => {
    const dayStartUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 6 * 60 * 60 * 1000;
    const nextMidnight = dayStartUtc + 24 * 60 * 60 * 1000;
    return Math.max(0, nextMidnight - now.getTime());
};

export const formatCountdown = (remainingMs: number): string => {
    const totalSeconds = Math.ceil(remainingMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const emptyProgress = (day: string): DailyProgress => ({ day, progress: {}, claimed: [] });

function readStored(): DailyProgress | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return null;
        }

        const parsed = JSON.parse(raw) as Partial<DailyProgress>;
        if (!parsed || typeof parsed.day !== 'string' || !parsed.progress) {
            return null;
        }

        return {
            day: parsed.day,
            progress: { ...parsed.progress },
            claimed: Array.isArray(parsed.claimed) ? [...parsed.claimed] : [],
        };
    } catch {
        return null;
    }
}

function persist(state: DailyProgress): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
        // In-memory progress still works for this session.
    }
}

function highWaterDay(): string {
    try {
        return localStorage.getItem(`${STORAGE_KEY}.high-water`) ?? '';
    } catch {
        return '';
    }
}

function setHighWaterDay(day: string): void {
    try {
        localStorage.setItem(`${STORAGE_KEY}.high-water`, day);
    } catch {
        // Ignore.
    }
}

export function loadDailyProgress(now: Date = new Date()): DailyProgress {
    const today = dhakaDayString(now);
    const stored = readStored();
    if (!stored) {
        const fresh = emptyProgress(today);
        persist(fresh);
        setHighWaterDay(today);
        return fresh;
    }

    const highWater = highWaterDay();
    if (stored.day > today) {
        // Clock moved backwards: keep the stored (later) day so a previous
        // day's rewards cannot be replayed.
        setHighWaterDay(stored.day > highWater ? stored.day : highWater);
        return stored;
    }

    if (stored.day !== today) {
        const fresh = emptyProgress(today);
        persist(fresh);
        setHighWaterDay(today > highWater ? today : highWater);
        return fresh;
    }

    setHighWaterDay(today);
    return stored;
}

export function missionProgress(state: DailyProgress, mission: DailyMission): number {
    if (mission.id === 'champion') {
        return DAILY_MISSIONS.filter((m) => m.id !== 'champion').filter((m) => (state.progress[m.id] ?? 0) >= m.target).length;
    }

    return Math.min(mission.target, Math.max(0, Math.floor(state.progress[mission.id] ?? 0)));
}

export function isMissionComplete(state: DailyProgress, mission: DailyMission): boolean {
    return missionProgress(state, mission) >= mission.target;
}

export function completedCount(state: DailyProgress): number {
    return DAILY_MISSIONS.filter((m) => isMissionComplete(state, m)).length;
}

export function recordDailyEvent(type: DailyEventType, amount = 1, now: Date = new Date()): DailyProgress {
    const state = loadDailyProgress(now);
    const add = (id: string, value: number): void => {
        const mission = DAILY_MISSIONS.find((m) => m.id === id);
        if (!mission) {
            return;
        }

        state.progress[id] = Math.min(mission.target, Math.max(0, Math.floor(state.progress[id] ?? 0) + Math.max(0, Math.floor(value))));
    };

    switch (type) {
        case 'play':
            add('play3', amount);
            break;
        case 'complete':
            add('complete2', amount);
            break;
        case 'destroy':
            add('destroy100', amount);
            break;
        case 'fire':
            add('fire2', amount);
            break;
        case 'bomb':
            add('bomb2', amount);
            break;
    }

    persist(state);
    return state;
}

export function claimDailyReward(missionId: string, now: Date = new Date()): { claimed: boolean; coins: number } {
    const mission = DAILY_MISSIONS.find((m) => m.id === missionId);
    if (!mission) {
        return { claimed: false, coins: 0 };
    }

    const state = loadDailyProgress(now);
    if (!isMissionComplete(state, mission) || state.claimed.includes(missionId)) {
        return { claimed: false, coins: 0 };
    }

    state.claimed.push(missionId);
    persist(state);
    addCoins(mission.reward);
    if (mission.grants) {
        Object.entries(mission.grants).forEach(([type, amount]) => {
            if (amount && amount > 0) {
                grantPowerUp(type as keyof PowerUpInventory, amount);
            }
        });
    }
    // Successful confirmed collection for the daily Collected Items.
    recordCollectedCard('daily', missionId, now);
    return { claimed: true, coins: mission.reward };
}
