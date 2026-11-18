import { addCoins } from '../utils/storage';
import { grantPowerUp } from '../powerups/inventory';
import type { PowerUpInventory } from '../powerups/inventory';
import { recordCollectedCard } from '../collected/collected';

/**
 * Hard Daily Tasks for the Bubble Shooter game.
 *
 * Every objective below is a new gameplay requirement; none of the previous
 * easy missions (play N levels, fire N power-ups, "champion" meta-goal) remain.
 * Progress is stored under an Asia/Dhaka (UTC+6) calendar day with a
 * high-water mark so a backwards device clock cannot replay an earlier day.
 *
 * Missions flagged `perLevel` count each level id at most once, so replaying
 * the same level can never satisfy them twice — this is what makes
 * "5 different levels" and the clean/efficient/star objectives meaningful.
 */

/** A level finished within this many shots counts as an efficient clear. */
export const EFFICIENT_SHOT_LIMIT = 12;
/** A normal shot destroying at least this many bubbles is a big chain. */
export const CHAIN_REACTION_MIN_BUBBLES = 8;

export type DailyEventType =
    | 'completeLevel'
    | 'bubblesCleared'
    | 'cleanLevel'
    | 'streakBubbles'
    | 'efficientLevel'
    | 'fireBubbles'
    | 'bombBubbles'
    | 'starLevel'
    | 'chainBubbles';

export interface DailyMission {
    id: string;
    title: string;
    description: string;
    target: number;
    reward: number;
    icon: 'play' | 'target' | 'bomb' | 'fire' | 'champion';
    /** Gameplay action that advances this mission. */
    event: DailyEventType;
    /** Count each level id once only (id supplied by the caller). */
    perLevel?: boolean;
    /** Extra power-up rewards paid into the shared inventory on claim. */
    grants?: Partial<PowerUpInventory>;
}

export const DAILY_MISSIONS: readonly DailyMission[] = [
    { id: 'five-different-levels', title: 'Trail Blazer', description: 'Complete 5 different levels', target: 5, reward: 30, icon: 'target', event: 'completeLevel', perLevel: true },
    { id: 'clear-150-bubbles', title: 'Bubble Storm', description: 'Clear 150 bubbles in total', target: 150, reward: 25, icon: 'bomb', event: 'bubblesCleared' },
    { id: 'three-no-power', title: 'Purist', description: 'Complete 3 levels without using power-ups', target: 3, reward: 35, icon: 'champion', event: 'cleanLevel', perLevel: true },
    { id: 'forty-streak', title: 'Steady Hand', description: 'Clear 40 bubbles with consecutive successful shots', target: 40, reward: 35, icon: 'play', event: 'streakBubbles' },
    { id: 'two-efficient', title: 'Sharp Shooter', description: `Complete 2 levels in ${EFFICIENT_SHOT_LIMIT} shots or fewer`, target: 2, reward: 40, icon: 'target', event: 'efficientLevel', perLevel: true },
    { id: 'fire-bubbles', title: 'Flame Master', description: 'Clear 25 bubbles with Fire power', target: 25, reward: 30, icon: 'fire', event: 'fireBubbles' },
    { id: 'bomb-bubbles', title: 'Demolition', description: 'Destroy 20 bubbles with Bomb power', target: 20, reward: 30, icon: 'bomb', event: 'bombBubbles' },
    { id: 'three-two-stars', title: 'High Flyer', description: 'Complete 3 levels with at least 2 stars', target: 3, reward: 40, icon: 'champion', event: 'starLevel', perLevel: true },
    { id: 'chain-reactions', title: 'Chain Reactor', description: 'Clear 20 bubbles from big chain reactions', target: 20, reward: 35, icon: 'bomb', event: 'chainBubbles' },
] as const;

export const DAILY_REWARD_TOTAL = DAILY_MISSIONS.reduce((sum, mission) => sum + mission.reward, 0);

export interface DailyProgress {
    day: string;
    progress: Record<string, number>;
    claimed: string[];
    /** Distinct level ids already counted toward `perLevel` missions. */
    levels: Record<string, number[]>;
}

const STORAGE_KEY = 'bubble-shooter-daily.v2';

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

const emptyProgress = (day: string): DailyProgress => ({ day, progress: {}, claimed: [], levels: {} });

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

        const levels: Record<string, number[]> = {};
        if (parsed.levels && typeof parsed.levels === 'object') {
            for (const [id, ids] of Object.entries(parsed.levels)) {
                if (Array.isArray(ids)) {
                    levels[id] = ids.filter((value): value is number => Number.isFinite(value));
                }
            }
        }

        return {
            day: parsed.day,
            progress: { ...parsed.progress },
            claimed: Array.isArray(parsed.claimed) ? [...parsed.claimed] : [],
            levels,
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
    return Math.min(mission.target, Math.max(0, Math.floor(state.progress[mission.id] ?? 0)));
}

export function isMissionComplete(state: DailyProgress, mission: DailyMission): boolean {
    return missionProgress(state, mission) >= mission.target;
}

export function completedCount(state: DailyProgress): number {
    return DAILY_MISSIONS.filter((mission) => isMissionComplete(state, mission)).length;
}

export interface DailyEventOptions {
    now?: Date;
    /** Level id for `perLevel` missions; ignored by the others. */
    levelId?: number;
}

export function recordDailyEvent(
    type: DailyEventType,
    amount = 1,
    options: DailyEventOptions = {}
): DailyProgress {
    const state = loadDailyProgress(options.now ?? new Date());
    const increment = Math.max(0, Math.floor(amount));

    for (const mission of DAILY_MISSIONS) {
        if (mission.event !== type) {
            continue;
        }

        if (mission.perLevel) {
            if (!Number.isFinite(options.levelId)) {
                continue;
            }
            const levelId = Math.floor(options.levelId as number);
            const seen = state.levels[mission.id] ?? [];
            if (seen.includes(levelId)) {
                continue;
            }
            seen.push(levelId);
            state.levels[mission.id] = seen;
            state.progress[mission.id] = Math.min(mission.target, seen.length);
            continue;
        }

        const previous = Math.max(0, Math.floor(state.progress[mission.id] ?? 0));
        state.progress[mission.id] = Math.min(mission.target, previous + increment);
    }

    persist(state);
    return state;
}

export function claimDailyReward(missionId: string, now: Date = new Date()): { claimed: boolean; coins: number } {
    const mission = DAILY_MISSIONS.find((candidate) => candidate.id === missionId);
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
        Object.entries(mission.grants).forEach(([type, grantAmount]) => {
            if (grantAmount && grantAmount > 0) {
                grantPowerUp(type as keyof PowerUpInventory, grantAmount);
            }
        });
    }
    // Successful confirmed collection for the daily Collected Items.
    recordCollectedCard('daily', missionId, now);
    return { claimed: true, coins: mission.reward };
}
