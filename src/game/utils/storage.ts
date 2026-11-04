import {
    resolveLevelProgressState,
    resolveLevelStars,
    type LevelProgressState,
} from '../data/levels/progress';

export type Progress = {
    version: number;
    /** Highest unlocked level index (0-based). Index 0 is always unlocked. */
    highestLevel: number;
    bestScore: number;
    sound: boolean;
    music: boolean;
    coins: number;
    completedLevels: number[];
    stars: Record<number, number>; // level index -> stars (0-3)
    vibration?: boolean;
    language?: string;
    graphics?: 'low' | 'medium' | 'high';
    aimGuide?: boolean;
    controlHandedness?: 'right' | 'left';
};

/** Bumped whenever the persisted shape or index semantics change. */
export const PROGRESS_VERSION = 2;

const STORAGE_KEY = 'bubble-shooter-progress';
const PREFS_KEY = 'bubble-shooter-prefs.v1';

const DEFAULT_PROGRESS: Progress = {
    version: PROGRESS_VERSION,
    highestLevel: 0,
    bestScore: 0,
    sound: true,
    music: true,
    coins: 1000,
    completedLevels: [],
    stars: {},
    vibration: true,
    language: 'en',
    graphics: 'medium',
    aimGuide: true,
    controlHandedness: 'right',
};

let cached: Progress | null = null;

const clampInt = (value: unknown, min: number, max: number, fallback: number): number => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return fallback;
    }

    return Math.max(min, Math.min(max, Math.floor(value)));
};

const normalizeCompleted = (value: unknown): number[] => {
    if (!Array.isArray(value)) {
        return [];
    }

    const indices = new Set<number>();

    value.forEach((entry) => {
        if (typeof entry === 'number' && Number.isFinite(entry) && entry >= 0) {
            indices.add(Math.floor(entry));
        }
    });

    return [...indices].sort((a, b) => a - b);
};

const normalizeStars = (value: unknown): Record<number, number> => {
    if (!value || typeof value !== 'object') {
        return {};
    }

    const stars: Record<number, number> = {};

    Object.entries(value as Record<string, unknown>).forEach(([key, entry]) => {
        const index = Number(key);
        const amount = Number(entry);

        if (!Number.isFinite(index) || index < 0 || !Number.isFinite(amount)) {
            return;
        }

        const earned = Math.max(0, Math.min(3, Math.floor(amount)));

        if (earned > 0) {
            stars[Math.floor(index)] = earned;
        }
    });

    return stars;
};

/**
 * Normalizes persisted data from any previous build. Older saves used
 * `highestLevel` as the furthest unlocked index already, so the value can be
 * kept, but completed levels are folded into the unlock frontier so a repair
 * of partially written saves cannot lock an already-cleared level.
 */
const normalizeProgress = (parsed: Partial<Progress>): Progress => {
    const completedLevels = normalizeCompleted(parsed.completedLevels);
    const stars = normalizeStars(parsed.stars);
    const starCompleted = Object.keys(stars).map((key) => Number(key));
    const completed = [...new Set([...completedLevels, ...starCompleted])].sort((a, b) => a - b);
    const repairedFrontier = completed.length > 0 ? completed[completed.length - 1] + 1 : 0;

    return {
        version: PROGRESS_VERSION,
        highestLevel: Math.max(
            0,
            clampInt(parsed.highestLevel, 0, 10000, DEFAULT_PROGRESS.highestLevel),
            repairedFrontier
        ),
        bestScore: clampInt(parsed.bestScore, 0, Number.MAX_SAFE_INTEGER, DEFAULT_PROGRESS.bestScore),
        sound: typeof parsed.sound === 'boolean' ? parsed.sound : DEFAULT_PROGRESS.sound,
        music: typeof parsed.music === 'boolean' ? parsed.music : DEFAULT_PROGRESS.music,
        coins: clampInt(parsed.coins, 0, Number.MAX_SAFE_INTEGER, DEFAULT_PROGRESS.coins),
        completedLevels: completed,
        stars,
        vibration: typeof parsed.vibration === 'boolean' ? parsed.vibration : DEFAULT_PROGRESS.vibration,
        language: typeof parsed.language === 'string' ? parsed.language : DEFAULT_PROGRESS.language,
        graphics:
            parsed.graphics === 'low' || parsed.graphics === 'medium' || parsed.graphics === 'high'
                ? parsed.graphics
                : DEFAULT_PROGRESS.graphics,
        aimGuide: typeof parsed.aimGuide === 'boolean' ? parsed.aimGuide : DEFAULT_PROGRESS.aimGuide,
        controlHandedness:
            parsed.controlHandedness === 'left' || parsed.controlHandedness === 'right'
                ? parsed.controlHandedness
                : DEFAULT_PROGRESS.controlHandedness,
    };
};

const storage = (): Storage | null => {
    try {
        return typeof window !== 'undefined' ? window.localStorage : null;
    } catch {
        return null;
    }
};

const persist = (progress: Progress): void => {
    cached = progress;

    try {
        const target = storage();

        if (!target) {
            return;
        }

        target.setItem(STORAGE_KEY, JSON.stringify(progress));
        target.setItem(PREFS_KEY, JSON.stringify(progress));
    } catch {
        // Storage can be unavailable in private mode; the in-memory cache still works.
    }
};

export function loadProgress(): Progress {
    if (cached) {
        return cached;
    }

    try {
        const data = storage()?.getItem(STORAGE_KEY);

        if (!data) {
            cached = normalizeProgress({});
            persist(cached);
            return cached;
        }

        cached = normalizeProgress(JSON.parse(data) as Partial<Progress>);
        // Write the normalized/migrated shape immediately.
        persist(cached);
        return cached;
    } catch {
        cached = normalizeProgress({});
        persist(cached);
        return cached;
    }
}

export function saveProgress(progress: Progress): void {
    persist(normalizeProgress(progress));
}

export const recordScore = (score: number): boolean => {
    const progress = loadProgress();
    const normalized = Math.max(0, Math.floor(Number(score) || 0));

    if (normalized <= progress.bestScore) {
        return false;
    }

    progress.bestScore = normalized;
    saveProgress(progress);
    return true;
};

/**
 * Ensures a level index is unlocked. Completing a level unlocks the next index
 * through `markLevelCompleted`; this helper is for explicit unlocks.
 */
export const unlockLevel = (levelIndex: number): void => {
    const index = Math.max(0, Math.floor(Number(levelIndex) || 0));
    const progress = loadProgress();

    if (progress.highestLevel < index) {
        progress.highestLevel = index;
        saveProgress(progress);
    }
};

/** Marks a level completed, keeps the best star result and unlocks the next. */
export function markLevelCompleted(levelIndex: number, stars = 3): boolean {
    const index = Math.max(0, Math.floor(Number(levelIndex) || 0));
    const earned = Math.max(0, Math.min(3, Math.floor(Number(stars) || 0)));
    const progress = loadProgress();
    const newlyCompleted = !progress.completedLevels.includes(index);

    if (newlyCompleted) {
        progress.completedLevels.push(index);
        progress.completedLevels.sort((a, b) => a - b);
    }

    if ((progress.stars[index] ?? 0) < earned) {
        progress.stars[index] = earned;
    }

    if (progress.highestLevel < index + 1) {
        progress.highestLevel = Math.min(999, index + 1);
    }

    saveProgress(progress);
    return newlyCompleted;
}

export function getLevelStars(levelIndex: number): number {
    return resolveLevelStars(levelIndex, loadProgress());
}

export function getLevelProgressState(levelIndex: number): LevelProgressState {
    return resolveLevelProgressState(levelIndex, loadProgress());
}

export function isLevelUnlocked(levelIndex: number): boolean {
    return getLevelProgressState(levelIndex) !== 'locked';
}

export function isLevelCompleted(levelIndex: number): boolean {
    return getLevelProgressState(levelIndex) === 'completed';
}

const notifySettingsChanged = (): void => {
    if (
        typeof window === 'undefined' ||
        typeof window.dispatchEvent !== 'function' ||
        typeof CustomEvent === 'undefined'
    ) {
        return;
    }

    window.dispatchEvent(new CustomEvent('bubble:settings-changed'));
};

export function toggleSound(): boolean {
    const progress = loadProgress();
    progress.sound = !progress.sound;
    saveProgress(progress);
    notifySettingsChanged();
    return progress.sound;
}

export function toggleMusic(): boolean {
    const progress = loadProgress();
    progress.music = !progress.music;
    saveProgress(progress);
    notifySettingsChanged();
    return progress.music;
}

export function addCoins(amount: number): number {
    const progress = loadProgress();
    progress.coins = Math.max(0, Math.floor(progress.coins + amount));
    saveProgress(progress);
    return progress.coins;
}

export const resetProgress = (onlyGameProgress = true): void => {
    const current = loadProgress();
    const next: Progress = onlyGameProgress
        ? {
              ...current,
              highestLevel: 0,
              bestScore: 0,
              coins: 1000,
              completedLevels: [],
              stars: {},
          }
        : { ...DEFAULT_PROGRESS, completedLevels: [], stars: {} };

    persist(normalizeProgress(next));
};
