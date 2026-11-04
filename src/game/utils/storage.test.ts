import { afterEach, describe, expect, it, vi } from 'vitest';

class MemoryStorage {
    private readonly values = new Map<string, string>();

    get length(): number {
        return this.values.size;
    }

    clear(): void {
        this.values.clear();
    }

    getItem(key: string): string | null {
        return this.values.get(key) ?? null;
    }

    key(index: number): string | null {
        return [...this.values.keys()][index] ?? null;
    }

    removeItem(key: string): void {
        this.values.delete(key);
    }

    setItem(key: string, value: string): void {
        this.values.set(key, String(value));
    }
}

const STORAGE_KEY = 'bubble-shooter-progress';

const installStorage = (): MemoryStorage => {
    const storage = new MemoryStorage();
    vi.stubGlobal('window', { localStorage: storage });
    return storage;
};

const loadStorageModule = async () => {
    vi.resetModules();
    return import('./storage');
};

afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
});

describe('progress storage', () => {
    it('creates a versioned fresh save with only the first level unlocked', async () => {
        const storage = installStorage();
        const module = await loadStorageModule();
        const progress = module.loadProgress();

        expect(progress.version).toBe(module.PROGRESS_VERSION);
        expect(progress.highestLevel).toBe(0);
        expect(progress.completedLevels).toEqual([]);
        expect(progress.stars).toEqual({});
        expect(module.getLevelProgressState(0)).toBe('unlocked');
        expect(module.getLevelProgressState(1)).toBe('locked');
        expect(storage.getItem(STORAGE_KEY)).toContain('"version":2');
    });

    it('unlocks the next level and keeps the best star result', async () => {
        installStorage();
        const module = await loadStorageModule();

        module.markLevelCompleted(0, 2);
        let progress = module.loadProgress();

        expect(progress.highestLevel).toBe(1);
        expect(progress.completedLevels).toEqual([0]);
        expect(module.getLevelProgressState(0)).toBe('completed');
        expect(module.getLevelProgressState(1)).toBe('unlocked');
        expect(module.getLevelStars(0)).toBe(2);

        module.markLevelCompleted(0, 1);
        expect(module.getLevelStars(0)).toBe(2);

        progress = module.loadProgress();
        expect(progress.stars[0]).toBe(2);
    });

    it('can explicitly unlock a level without completing it', async () => {
        installStorage();
        const module = await loadStorageModule();

        module.unlockLevel(5);

        expect(module.getLevelProgressState(5)).toBe('unlocked');
        expect(module.getLevelProgressState(6)).toBe('locked');
        expect(module.isLevelUnlocked(5)).toBe(true);
        expect(module.isLevelCompleted(5)).toBe(false);
    });

    it('migrates an older save and repairs the unlock frontier', async () => {
        const storage = installStorage();
        storage.setItem(
            STORAGE_KEY,
            JSON.stringify({
                highestLevel: 0,
                bestScore: 1234,
                sound: false,
                music: true,
                coins: 55,
                completedLevels: [0],
                stars: { 0: 2 },
            })
        );

        const module = await loadStorageModule();
        const progress = module.loadProgress();

        expect(progress.version).toBe(2);
        expect(progress.highestLevel).toBe(1);
        expect(progress.bestScore).toBe(1234);
        expect(progress.sound).toBe(false);
        expect(progress.coins).toBe(55);
        expect(progress.completedLevels).toEqual([0]);
        expect(progress.stars[0]).toBe(2);
        expect(module.getLevelProgressState(0)).toBe('completed');
        expect(module.getLevelProgressState(1)).toBe('unlocked');
    });

    it('treats positive stars as completed and repairs missing completed entries', async () => {
        const storage = installStorage();
        storage.setItem(
            STORAGE_KEY,
            JSON.stringify({
                highestLevel: 0,
                completedLevels: [],
                stars: { 3: 1 },
            })
        );

        const module = await loadStorageModule();
        const progress = module.loadProgress();

        expect(progress.completedLevels).toContain(3);
        expect(progress.highestLevel).toBe(4);
        expect(module.getLevelProgressState(3)).toBe('completed');
        expect(module.getLevelProgressState(4)).toBe('unlocked');
    });

    it('tracks best score without lowering it', async () => {
        installStorage();
        const module = await loadStorageModule();

        expect(module.recordScore(500)).toBe(true);
        expect(module.recordScore(500)).toBe(false);
        expect(module.recordScore(120)).toBe(false);
        expect(module.loadProgress().bestScore).toBe(500);
        expect(module.recordScore(900)).toBe(true);
        expect(module.loadProgress().bestScore).toBe(900);
    });

    it('resets game progress while preserving preferences', async () => {
        installStorage();
        const module = await loadStorageModule();

        module.markLevelCompleted(4, 3);
        module.recordScore(777);
        module.toggleSound();
        module.addCoins(-100);
        expect(module.loadProgress().highestLevel).toBe(5);

        module.resetProgress(true);
        const progress = module.loadProgress();

        expect(progress.highestLevel).toBe(0);
        expect(progress.bestScore).toBe(0);
        expect(progress.coins).toBe(1000);
        expect(progress.completedLevels).toEqual([]);
        expect(progress.stars).toEqual({});
        expect(progress.sound).toBe(false);
    });

    it('falls back to defaults when stored JSON is corrupt', async () => {
        const storage = installStorage();
        storage.setItem(STORAGE_KEY, '{not-json');

        const module = await loadStorageModule();
        const progress = module.loadProgress();

        expect(progress.version).toBe(2);
        expect(progress.highestLevel).toBe(0);
        expect(progress.bestScore).toBe(0);
    });
});
