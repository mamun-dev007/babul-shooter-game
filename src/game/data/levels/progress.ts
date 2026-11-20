export type LevelProgressState = 'locked' | 'unlocked' | 'completed';

export interface LevelProgressSnapshot {
    /** Highest unlocked level index. Index 0 is always unlocked. */
    highestLevel?: number;
    completedLevels?: readonly number[];
    stars?: Readonly<Record<number, number>>;
}

const completedInSnapshot = (index: number, progress: LevelProgressSnapshot): boolean =>
    (progress.completedLevels?.includes(index) ?? false) ||
    (progress.stars?.[index] ?? 0) > 0;

/**
 * Pure progress resolver shared by the level map, the in-game panel and tests.
 * Completed always wins over unlocked; a completed level can never be locked.
 */
export function resolveLevelProgressState(
    index: number,
    progress: LevelProgressSnapshot
): LevelProgressState {
    if (completedInSnapshot(index, progress)) {
        return 'completed';
    }

    if (index <= 0 || index <= (progress.highestLevel ?? 0)) {
        return 'unlocked';
    }

    return 'locked';
}

export function resolveLevelStars(
    index: number,
    progress: LevelProgressSnapshot
): number {
    if (!completedInSnapshot(index, progress)) {
        return 0;
    }

    return Math.max(0, Math.min(3, Math.floor(progress.stars?.[index] ?? 0)));
}

/** Unique levels actually completed - replays never increase this count. */
export function completedLevelCount(progress: LevelProgressSnapshot): number {
    const indices = new Set<number>(progress.completedLevels ?? []);

    Object.entries(progress.stars ?? {}).forEach(([key, stars]) => {
        const index = Number(key);
        if (Number.isFinite(index) && index >= 0 && stars > 0) {
            indices.add(Math.floor(index));
        }
    });

    return indices.size;
}

/** Number of unique completed levels required before the Starter button opens. */
export const STARTER_UNLOCK_LEVEL_COUNT = 20;
export const STARTER_UNLOCK_TEXT = 'Unlock 20 Levels';

/**
 * Starter is derived from persisted completion data, never from merely
 * unlocked/visited levels, so it stays locked until 20 levels are cleared and
 * stays unlocked across scene changes and app restarts.
 */
export const isStarterUnlocked = (progress: LevelProgressSnapshot): boolean =>
    completedLevelCount(progress) >= STARTER_UNLOCK_LEVEL_COUNT;

/** First unlocked, unfinished level, otherwise the furthest unlocked level. */
export function suggestedLevelIndex(totalLevels: number, progress: LevelProgressSnapshot): number {
    if (totalLevels <= 0) {
        return 0;
    }

    let furthestUnlocked = 0;

    for (let index = 0; index < totalLevels; index++) {
        const state = resolveLevelProgressState(index, progress);

        if (state === 'locked') {
            break;
        }

        furthestUnlocked = index;

        if (state === 'unlocked') {
            return index;
        }
    }

    return furthestUnlocked;
}
