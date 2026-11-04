import { describe, expect, it } from 'vitest';
import { LEVELS } from './index';
import {
    isLevelObjectiveComplete,
    levelOutcomeFor,
    levelTargetScore,
    objectiveLabel,
    starsForScore,
    starsForShots,
} from './scoring';
import type { LevelDefinition } from './types';

const scoreLevel: LevelDefinition = {
    ...LEVELS[0],
    objective: { type: 'score', targetScore: 300 },
    starThresholds: [100, 200, 300],
};

const clearBoardLevel: LevelDefinition = {
    ...LEVELS[0],
    objective: { type: 'clear-board' },
};

describe('level scoring helpers', () => {
    it('reads score targets and objective labels', () => {
        expect(levelTargetScore(scoreLevel)).toBe(300);
        expect(objectiveLabel(scoreLevel)).toBe('SCORE 300');
        expect(levelTargetScore(clearBoardLevel)).toBe(0);
        expect(objectiveLabel(clearBoardLevel)).toBe('CLEAR THE BOARD');
    });

    it('completes score objectives at the target or when the board is empty', () => {
        expect(isLevelObjectiveComplete(scoreLevel, 299, false)).toBe(false);
        expect(isLevelObjectiveComplete(scoreLevel, 300, false)).toBe(true);
        expect(isLevelObjectiveComplete(scoreLevel, 800, false)).toBe(true);
        expect(isLevelObjectiveComplete(scoreLevel, 0, true)).toBe(true);
        expect(isLevelObjectiveComplete(clearBoardLevel, 0, false)).toBe(false);
        expect(isLevelObjectiveComplete(clearBoardLevel, 99999, false)).toBe(false);
        expect(isLevelObjectiveComplete(clearBoardLevel, 0, true)).toBe(true);
    });

    it('keeps the legacy score-threshold helper intact for compatibility', () => {
        expect(starsForScore(scoreLevel, 0)).toBe(0);
        expect(starsForScore(scoreLevel, 99)).toBe(0);
        expect(starsForScore(scoreLevel, 100)).toBe(1);
        expect(starsForScore(scoreLevel, 200)).toBe(2);
        expect(starsForScore(scoreLevel, 300)).toBe(3);
        expect(starsForScore(scoreLevel, 9999)).toBe(3);
    });

    it('rates progression stars by shots used at the exact limits', () => {
        const level = {
            threeStarLimit: 5,
            twoStarLimit: 8,
            oneStarLimit: 10,
        };

        expect(starsForShots(level, 0)).toBe(3);
        expect(starsForShots(level, 5)).toBe(3);
        expect(starsForShots(level, 6)).toBe(2);
        expect(starsForShots(level, 8)).toBe(2);
        expect(starsForShots(level, 9)).toBe(1);
        expect(starsForShots(level, 10)).toBe(1);
        expect(starsForShots(level, 11)).toBe(0);
    });

    it('never awards stars or unlocks the next level for a loss', () => {
        const level = LEVELS[0];
        const won = levelOutcomeFor(level, true, level.threeStarLimit);
        const lost = levelOutcomeFor(level, false, 0);

        expect(won).toEqual({ won: true, stars: 3, unlocksNext: true });
        expect(lost).toEqual({ won: false, stars: 0, unlocksNext: false });
    });
});
