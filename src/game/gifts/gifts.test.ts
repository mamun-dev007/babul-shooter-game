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

describe('gift items', () => {
    it('has exactly 12 gifts with exact rewards, cooldowns and unlocks', async () => {
        install();
        const gifts = await import('./gifts');
        expect(gifts.GIFT_ITEMS).toHaveLength(12);
        const byId = new Map(gifts.GIFT_ITEMS.map((g) => [g.id, g]));
        expect(byId.get('starter')).toMatchObject({ artwork: 'gift-blue', type: 'ad', adCooldownMs: 0, reward: { coins: 10, grants: { bomb: 1 } } });
        expect(byId.get('booster')).toMatchObject({ artwork: 'gift-green', type: 'ad', adCooldownMs: 10 * 60 * 1000, reward: { coins: 25, grants: { fireball: 2, colorChanger: 1 } } });
        expect(byId.get('power-bundle')).toMatchObject({ artwork: 'gift-purple', type: 'ad', adCooldownMs: 20 * 60 * 1000, reward: { coins: 75, grants: { bomb: 3, fireball: 1, colorChanger: 1 } } });
        expect(byId.get('fortune')).toMatchObject({ artwork: 'gift-golden', type: 'ad', adCooldownMs: 30 * 60 * 1000, reward: { coins: 100, grants: { bomb: 5, fireball: 5, colorChanger: 3 } } });
        expect(byId.get('event')).toMatchObject({ artwork: 'gift-pink', unlockLevel: 50, reward: { coins: 50, grants: { bomb: 2, fireball: 1, colorChanger: 2 } } });
        expect([
            byId.get('event')?.unlockLevel, byId.get('small')?.unlockLevel, byId.get('golden')?.unlockLevel,
            byId.get('diamond')?.unlockLevel, byId.get('bomb')?.unlockLevel, byId.get('fire')?.unlockLevel,
            byId.get('bubble')?.unlockLevel, byId.get('power')?.unlockLevel,
        ]).toEqual([50, 186, 321, 457, 593, 729, 864, 1000]);
        expect(byId.get('small')).toMatchObject({ reward: { coins: 100, grants: { bomb: 4, fireball: 2, colorChanger: 4 } } });
        expect(byId.get('golden')).toMatchObject({ type: 'special', reward: { coins: 150, grants: { bomb: 6, fireball: 3, colorChanger: 6 } } });
        expect(byId.get('diamond')?.reward).toMatchObject({ coins: 200, grants: { bomb: 8, fireball: 4, colorChanger: 8 } });
        expect(byId.get('bomb')?.reward).toMatchObject({ coins: 250, grants: { bomb: 10, fireball: 5, colorChanger: 10 } });
        expect(byId.get('fire')).toMatchObject({ type: 'special', reward: { coins: 300, grants: { bomb: 12, fireball: 6, colorChanger: 12 } } });
        expect(byId.get('bubble')?.reward).toMatchObject({ coins: 350, grants: { bomb: 14, fireball: 7, colorChanger: 14 } });
        expect(byId.get('power')?.reward).toMatchObject({ coins: 500, grants: { bomb: 20, fireball: 10, colorChanger: 20 } });
        expect(byId.get('small')?.daily).toBeFalsy();
        expect(byId.get('bomb')?.daily).toBeFalsy();
        expect(byId.get('bubble')?.daily).toBeFalsy();
    });

    it('grants once and never replays level rewards on a new day', async () => {
        install();
        const gifts = await import('./gifts');
        const storageModule = await import('../utils/storage');
        const dayOne = new Date('2026-11-06T06:00:00Z');
        const dayTwo = new Date('2026-11-07T06:00:00Z');
        const small = gifts.GIFT_ITEMS.find((g) => g.id === 'small')!;
        const power = gifts.GIFT_ITEMS.find((g) => g.id === 'power')!;

        expect(gifts.isGiftUnlocked(power, 50)).toBe(false);
        expect(gifts.isGiftUnlocked(power, 1000)).toBe(true);

        const before = storageModule.loadProgress().coins;
        expect(gifts.grantGiftReward(small, small.reward, dayOne)).toBe(true);
        expect(gifts.grantGiftReward(small, small.reward, dayOne)).toBe(false);
        expect(storageModule.loadProgress().coins).toBe(before + 100);

        // Level-based rewards are once-only; a new day must not replay them.
        const state = gifts.loadGiftState(dayTwo);
        expect(gifts.isGiftClaimed(small, state)).toBe(true);
        expect(gifts.grantGiftReward(small, small.reward, dayTwo)).toBe(false);
        expect(storageModule.loadProgress().coins).toBe(before + 100);
    });

    it('auto-grants unlocked level rewards progressively, exactly once', async () => {
        install();
        const gifts = await import('./gifts');
        const storageModule = await import('../utils/storage');
        const before = storageModule.loadProgress().coins;

        expect(gifts.grantUnlockedLevelRewards(0)).toBe(0);
        expect(storageModule.loadProgress().coins).toBe(before);

        // Completing Level 50 unlocks only Card 5 (+50 Coins).
        expect(gifts.grantUnlockedLevelRewards(50)).toBe(1);
        expect(storageModule.loadProgress().coins).toBe(before + 50);
        // Restart/reopen must not pay the same card again.
        expect(gifts.grantUnlockedLevelRewards(50)).toBe(0);
        expect(storageModule.loadProgress().coins).toBe(before + 50);

        // Completing Level 1000 unlocks the remaining 7 cards (1850 Coins).
        expect(gifts.grantUnlockedLevelRewards(1000)).toBe(7);
        expect(storageModule.loadProgress().coins).toBe(before + 50 + 1850);
        expect(gifts.grantUnlockedLevelRewards(1000)).toBe(0);
    });

    it('rolls lucky rewards from the predefined table', async () => {
        install();
        const gifts = await import('./gifts');
        expect(gifts.rollLuckyReward(() => 0).description).toBe('10 Coins');
        expect(gifts.rollLuckyReward(() => 0.99).description).toBe('5 Bubble Color Changes');
    });

    it('persists ad cooldowns across restarts and expires by time', async () => {
        install();
        const gifts = await import('./gifts');
        const booster = gifts.GIFT_ITEMS.find((g) => g.id === 'booster')!;
        const now = new Date('2026-11-08T10:00:00Z');

        expect(gifts.adCooldownRemainingMs(booster, now)).toBe(0);
        gifts.startAdCooldown(booster, now);
        // 10 minutes remain immediately after a successful grant.
        expect(gifts.adCooldownRemainingMs(booster, now)).toBe(10 * 60 * 1000);
        // Reloading state (restart) keeps the cooldown.
        expect(gifts.adCooldownRemainingMs(booster, new Date(now.getTime() + 60 * 1000))).toBe(9 * 60 * 1000);
        // Expires after the full cooldown with no new grant.
        expect(gifts.adCooldownRemainingMs(booster, new Date(now.getTime() + 10 * 60 * 1000))).toBe(0);
        // Card 1 has no cooldown, so startAdCooldown is a no-op.
        const starter = gifts.GIFT_ITEMS.find((g) => g.id === 'starter')!;
        gifts.startAdCooldown(starter, now);
        expect(gifts.adCooldownRemainingMs(starter, now)).toBe(0);
    });
});
