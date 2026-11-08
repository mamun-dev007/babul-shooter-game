import { addCoins } from '../utils/storage';

/**
 * Daily Collected Items tracker shared by Gift Items and Daily Cards.
 * Each successfully confirmed gift/mission collection counts exactly once
 * per local calendar day; at 15 the player may claim 20 Coins, once.
 */

export const COLLECTED_TARGET = 15;
export const COLLECTED_REWARD_COINS = 20;

const STORAGE_KEY = 'bubble-shooter-collected.v1';

export interface CollectedState {
    /** Local calendar day, YYYY-MM-DD. */
    day: string;
    /** Unique `source:id` keys collected today. */
    ids: string[];
    /** Whether today's 20-Coin reward was claimed. */
    claimed: boolean;
}

export function localDayString(now: Date = new Date()): string {
    const pad = (n: number): string => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function freshState(day: string): CollectedState {
    return { day, ids: [], claimed: false };
}

export function loadCollectedState(now: Date = new Date()): CollectedState {
    const today = localDayString(now);
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            const fresh = freshState(today);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
            return fresh;
        }
        const parsed = JSON.parse(raw) as Partial<CollectedState>;
        if (parsed.day !== today) {
            const fresh = freshState(today);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
            return fresh;
        }
        return {
            day: today,
            ids: Array.isArray(parsed.ids) ? [...parsed.ids] : [],
            claimed: parsed.claimed === true,
        };
    } catch {
        return freshState(today);
    }
}

function persist(state: CollectedState): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
        // Keep session progress in memory only if storage is unavailable.
    }
}

export function getCollectedCount(now: Date = new Date()): number {
    return Math.min(loadCollectedState(now).ids.length, COLLECTED_TARGET);
}

export function isCollectedRewardAvailable(now: Date = new Date()): boolean {
    const state = loadCollectedState(now);
    return state.ids.length >= COLLECTED_TARGET && !state.claimed;
}

/**
 * Records one successfully confirmed card. Each key counts exactly once
 * per day; returns the current (capped) progress count.
 */
export function recordCollectedCard(source: string, id: string, now: Date = new Date()): number {
    const state = loadCollectedState(now);
    const key = `${source}:${id}`;
    if (!state.ids.includes(key)) {
        state.ids.push(key);
        persist(state);
    }
    return Math.min(state.ids.length, COLLECTED_TARGET);
}

/** Claims the 20-Coin reward once per day; returns true if paid. */
export function claimCollectedReward(now: Date = new Date()): boolean {
    const state = loadCollectedState(now);
    if (state.ids.length < COLLECTED_TARGET || state.claimed) {
        return false;
    }
    addCoins(COLLECTED_REWARD_COINS);
    state.claimed = true;
    persist(state);
    return true;
}
