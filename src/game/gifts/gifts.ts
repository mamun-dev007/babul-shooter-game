import { addCoins } from '../utils/storage';
import { grantPowerUp } from '../powerups/inventory';
import type { PowerUpInventory } from '../powerups/inventory';
import { recordCollectedCard } from '../collected/collected';

/**
 * Gift Items catalogue. Free gifts reset daily; rewarded-ad gifts pay per
 * completed ad impression; special/legendary gifts are one-time claims gated
 * by level milestones; the Lucky gift rolls once from LUCKY_TABLE.
 * One shared localStorage record persists claimed states so refreshing the
 * browser can never replay a reward.
 */

export type GiftRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'special';
export type GiftType = 'free' | 'ad' | 'special' | 'legendary';

export interface GiftReward {
    coins?: number;
    grants: Partial<PowerUpInventory>;
    description: string;
}

export interface GiftItem {
    id: string;
    name: string;
    rarity: GiftRarity;
    type: GiftType;
    reward: GiftReward;
    unlockLevel?: number;
    daily?: boolean;
    /** Rewarded-ad cooldown (ms) after a successful grant; 0 = none. */
    adCooldownMs?: number;
    artwork: 'gift-blue' | 'gift-green' | 'gift-purple' | 'gift-golden' | 'gift-pink' | 'gift-silver' | 'gift-shell' | 'gift-heart' | 'gift-knot' | 'gift-pod' | 'gift-ice';
}

export const GIFT_ITEMS: readonly GiftItem[] = [
    // Reference detail cards (individual PNG artwork each).
    { id: 'starter', name: 'Starter Pack', rarity: 'common', type: 'ad', adCooldownMs: 0, artwork: 'gift-blue', reward: { coins: 10, grants: { bomb: 1 }, description: '10 Coins + 1 Bomb' } },
    { id: 'booster', name: 'Booster Box', rarity: 'rare', type: 'ad', adCooldownMs: 10 * 60 * 1000, artwork: 'gift-green', reward: { coins: 25, grants: { fireball: 2, colorChanger: 1 }, description: '25 Coins + 2 Fire + 1 Color Change' } },
    { id: 'power-bundle', name: 'Power Bundle', rarity: 'epic', type: 'ad', adCooldownMs: 20 * 60 * 1000, artwork: 'gift-purple', reward: { coins: 75, grants: { bomb: 3, fireball: 1, colorChanger: 1 }, description: '75 Coins + 3 Bombs + 1 Fire + 1 Bubble Color' } },
    { id: 'fortune', name: 'Fortune Chest', rarity: 'legendary', type: 'ad', adCooldownMs: 30 * 60 * 1000, artwork: 'gift-golden', reward: { coins: 100, grants: { bomb: 5, fireball: 5, colorChanger: 3 }, description: '100 Coins + 5 Bombs + 5 Fire + 3 Bubble Colors' } },
    { id: 'event', name: 'Event Delight', rarity: 'special', type: 'free', unlockLevel: 50, artwork: 'gift-pink', reward: { coins: 50, grants: { bomb: 2, fireball: 1, colorChanger: 2 }, description: '50 Coins + 2 Bombs + 1 Fire + 2 Bubble Color Changes' } },
    // Level-based progressive rewards (once per card, amounts per table).
    { id: 'small', name: 'Small Gift Box', rarity: 'common', type: 'free', unlockLevel: 186, artwork: 'gift-blue', reward: { coins: 100, grants: { bomb: 4, fireball: 2, colorChanger: 4 }, description: '100 Coins + 4 Bombs + 2 Fire + 4 Bubble Color Changes' } },
    { id: 'golden', name: 'Golden Gift Box', rarity: 'rare', type: 'special', unlockLevel: 321, artwork: 'gift-golden', reward: { coins: 150, grants: { bomb: 6, fireball: 3, colorChanger: 6 }, description: '150 Coins + 6 Bombs + 3 Fire + 6 Bubble Color Changes' } },
    { id: 'diamond', name: 'Diamond Gift Box', rarity: 'epic', type: 'special', unlockLevel: 457, artwork: 'gift-silver', reward: { coins: 200, grants: { bomb: 8, fireball: 4, colorChanger: 8 }, description: '200 Coins + 8 Bombs + 4 Fire + 8 Bubble Color Changes' } },
    { id: 'bomb', name: 'Bomb Gift', rarity: 'common', type: 'free', unlockLevel: 593, artwork: 'gift-pod', reward: { coins: 250, grants: { bomb: 10, fireball: 5, colorChanger: 10 }, description: '250 Coins + 10 Bombs + 5 Fire + 10 Bubble Color Changes' } },
    { id: 'fire', name: 'Fire Gift', rarity: 'rare', type: 'special', unlockLevel: 729, artwork: 'gift-knot', reward: { coins: 300, grants: { bomb: 12, fireball: 6, colorChanger: 12 }, description: '300 Coins + 12 Bombs + 6 Fire + 12 Bubble Color Changes' } },
    { id: 'bubble', name: 'Bubble Gift', rarity: 'common', type: 'free', unlockLevel: 864, artwork: 'gift-ice', reward: { coins: 350, grants: { bomb: 14, fireball: 7, colorChanger: 14 }, description: '350 Coins + 14 Bombs + 7 Fire + 14 Bubble Color Changes' } },
    { id: 'power', name: 'Power Gift', rarity: 'epic', type: 'special', unlockLevel: 1000, artwork: 'gift-purple', reward: { coins: 500, grants: { bomb: 20, fireball: 10, colorChanger: 20 }, description: '500 Coins + 20 Bombs + 10 Fire + 20 Bubble Color Changes' } },
] as const;

export const LUCKY_TABLE: readonly GiftReward[] = [
    { coins: 10, grants: {}, description: '10 Coins' },
    { coins: 20, grants: {}, description: '20 Coins' },
    { grants: { bomb: 2 }, description: '2 Bombs' },
    { grants: { fireball: 1 }, description: '1 Fire Power' },
    { grants: { colorChanger: 5 }, description: '5 Bubble Color Changes' },
] as const;

export function rollLuckyReward(random: () => number = Math.random): GiftReward {
    const index = Math.min(LUCKY_TABLE.length - 1, Math.max(0, Math.floor(random() * LUCKY_TABLE.length)));
    return LUCKY_TABLE[index];
}

export interface GiftState {
    day: string;
    dailyClaimed: string[];
    onceClaimed: string[];
    /** Ad cooldown expiry (ms epoch) per gift id. */
    adCooldowns: Record<string, number>;
}

const STORAGE_KEY = 'bubble-shooter-gifts.v1';

const utcDay = (now: Date = new Date()): string => now.toISOString().slice(0, 10);

export const giftDayString = utcDay;

export function loadGiftState(now: Date = new Date()): GiftState {
    const today = utcDay(now);
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            const fresh = { day: today, dailyClaimed: [] as string[], onceClaimed: [] as string[], adCooldowns: {} as Record<string, number> };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
            return fresh;
        }

        const parsed = JSON.parse(raw) as Partial<GiftState>;
        const adCooldowns = parsed.adCooldowns && typeof parsed.adCooldowns === 'object' ? { ...parsed.adCooldowns } : {};
        if (parsed.day !== today) {
            const fresh = { day: today, dailyClaimed: [] as string[], onceClaimed: Array.isArray(parsed.onceClaimed) ? [...parsed.onceClaimed] : [], adCooldowns };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
            return fresh;
        }

        return {
            day: today,
            dailyClaimed: Array.isArray(parsed.dailyClaimed) ? [...parsed.dailyClaimed] : [],
            onceClaimed: Array.isArray(parsed.onceClaimed) ? [...parsed.onceClaimed] : [],
            adCooldowns,
        };
    } catch {
        return { day: today, dailyClaimed: [], onceClaimed: [], adCooldowns: {} };
    }
}

function persist(state: GiftState): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
        // Keep session progress in memory only if storage is unavailable.
    }
}

export function isGiftUnlocked(gift: GiftItem, highestLevel: number): boolean {
    if (!gift.unlockLevel) {
        return true;
    }

    return highestLevel + 1 >= gift.unlockLevel;
}

export function isGiftClaimed(gift: GiftItem, state: GiftState): boolean {
    if (gift.type === 'ad') {
        return false;
    }

    return gift.daily ? state.dailyClaimed.includes(gift.id) : state.onceClaimed.includes(gift.id);
}

export function adCooldownRemainingMs(gift: GiftItem, now: Date = new Date()): number {
    const until = loadGiftState(now).adCooldowns[gift.id] ?? 0;
    return Math.max(0, until - now.getTime());
}

export function startAdCooldown(gift: GiftItem, now: Date = new Date()): void {
    const cooldown = gift.adCooldownMs ?? 0;
    if (cooldown <= 0) {
        return;
    }

    const state = loadGiftState(now);
    state.adCooldowns[gift.id] = now.getTime() + cooldown;
    persist(state);
}

/** Applies a reward exactly once per claim state; returns true if paid. */
export function grantGiftReward(gift: GiftItem, reward: GiftReward, now: Date = new Date()): boolean {
    const state = loadGiftState(now);
    if (isGiftClaimed(gift, state)) {
        return false;
    }

    if (reward.coins && reward.coins > 0) {
        addCoins(reward.coins);
    }

    Object.entries(reward.grants).forEach(([type, amount]) => {
        if (amount && amount > 0) {
            grantPowerUp(type as keyof PowerUpInventory, amount);
        }
    });

    if (gift.type === 'ad') {
        startAdCooldown(gift, now);
        // Successful confirmed collection for the daily Collected Items.
        recordCollectedCard('gift', gift.id, now);
        return true;
    }

    if (gift.daily) {
        state.dailyClaimed.push(gift.id);
    } else {
        state.onceClaimed.push(gift.id);
    }

    persist(state);
    recordCollectedCard('gift', gift.id, now);
    return true;
}

/**
 * Auto-grants every Level-based gift (Cards 5–12) whose required level is
 * completed and whose reward has not been paid yet. Each card pays exactly
 * once via the existing coin/inventory systems; returns how many were paid.
 */
export function grantUnlockedLevelRewards(highestLevel: number, now: Date = new Date()): number {
    let granted = 0;
    const state = loadGiftState(now);
    GIFT_ITEMS.forEach((gift, index) => {
        if (index < 4 || !gift.unlockLevel) {
            return;
        }
        if (!isGiftUnlocked(gift, highestLevel) || isGiftClaimed(gift, state)) {
            return;
        }
        if (grantGiftReward(gift, gift.reward, now)) {
            granted += 1;
        }
    });
    return granted;
}

export const giftCountdownMs = (now: Date = new Date()): number => {
    const dayStartUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    return Math.max(0, dayStartUtc + 24 * 60 * 60 * 1000 - now.getTime());
};

export const formatGiftCountdown = (remainingMs: number): string => {
    const totalSeconds = Math.ceil(remainingMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};
