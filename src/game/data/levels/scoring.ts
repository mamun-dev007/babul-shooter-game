import type { LevelDefinition, ProgressionLevelDefinition } from './types';

/** Score needed to satisfy a score objective. */
export const levelTargetScore = (level: LevelDefinition): number =>
    level.objective.type === 'score' ? level.objective.targetScore : 0;

/**
 * A cleared board always completes a level, even when the score objective has
 * not been reached yet. Danger/failure is handled by LevelSystem.
 */
export const isLevelObjectiveComplete = (
    level: LevelDefinition,
    score: number,
    boardEmpty: boolean
): boolean => {
    if (boardEmpty) {
        return true;
    }

    return level.objective.type === 'score' && score >= level.objective.targetScore;
};

/** 0-3 stars. A completed level is awarded at least one star. */
export const starsForScore = (level: LevelDefinition, score: number): number => {
    const [one, two, three] = level.starThresholds;

    if (score >= three) return 3;
    if (score >= two) return 2;
    if (score >= one) return 1;
    return 0;
};

export type ShotStarLimits = Pick<
    ProgressionLevelDefinition,
    'threeStarLimit' | 'twoStarLimit' | 'oneStarLimit'
>;

/**
 * Stars are earned by finishing within the level's percentage-based shot
 * limits, not by score:
 *
 * - `shotsUsed <= threeStarLimit` -> 3 stars
 * - `shotsUsed <= twoStarLimit`   -> 2 stars
 * - `shotsUsed <= oneStarLimit`   -> 1 star
 * - anything above the budget     -> 0 stars (the shot budget already failed)
 */
export const starsForShots = (level: ShotStarLimits, shotsUsed: number): number => {
    const used = Math.max(0, Math.floor(Number(shotsUsed) || 0));

    if (used <= level.threeStarLimit) return 3;
    if (used <= level.twoStarLimit) return 2;
    if (used <= level.oneStarLimit) return 1;
    return 0;
};

export interface LevelOutcome {
    readonly won: boolean;
    readonly stars: number;
    /** Only a win with at least one star may unlock the next level. */
    readonly unlocksNext: boolean;
}

/**
 * Single source of truth for how a finished level is recorded. A loss never
 * awards stars and never unlocks anything.
 */
export const levelOutcomeFor = (
    level: ShotStarLimits,
    won: boolean,
    shotsUsed: number
): LevelOutcome => {
    const stars = won ? starsForShots(level, shotsUsed) : 0;

    return {
        won,
        stars,
        unlocksNext: won && stars > 0,
    };
};

export const objectiveLabel = (level: LevelDefinition): string =>
    level.objective.type === 'score'
        ? `SCORE ${level.objective.targetScore.toLocaleString('en-US')}`
        : 'CLEAR THE BOARD';
