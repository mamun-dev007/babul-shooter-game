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
