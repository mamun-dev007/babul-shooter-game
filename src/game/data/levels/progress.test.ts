import { describe, expect, it } from 'vitest';
import {
    resolveLevelProgressState,
    resolveLevelStars,
    suggestedLevelIndex,
} from './progress';

describe('level progress resolver', () => {
    it('always unlocks the first level and locks the rest on a fresh save', () => {
        expect(resolveLevelProgressState(0, {})).toBe('unlocked');
        expect(resolveLevelProgressState(1, {})).toBe('locked');
        expect(resolveLevelProgressState(99, { highestLevel: 0 })).toBe('locked');
    });

    it('treats highestLevel as the highest unlocked index', () => {
        const progress = { highestLevel: 3 };

        expect(resolveLevelProgressState(0, progress)).toBe('unlocked');
        expect(resolveLevelProgressState(3, progress)).toBe('unlocked');
        expect(resolveLevelProgressState(4, progress)).toBe('locked');
    });

    it('reports completed levels before unlocked levels', () => {
        const progress = {
            highestLevel: 0,
            completedLevels: [2],
            stars: { 2: 2 },
        };

        expect(resolveLevelProgressState(2, progress)).toBe('completed');
        expect(resolveLevelStars(2, progress)).toBe(2);
        expect(resolveLevelProgressState(1, progress)).toBe('locked');
    });

    it('treats a positive star score as completed even without a completed entry', () => {
        const progress = { highestLevel: 1, stars: { 0: 3 } };

        expect(resolveLevelProgressState(0, progress)).toBe('completed');
        expect(resolveLevelStars(0, progress)).toBe(3);
    });

    it('clamps star values to the 0-3 range', () => {
        expect(resolveLevelStars(0, { stars: { 0: 9 } })).toBe(3);
        expect(resolveLevelStars(1, { completedLevels: [1], stars: { 1: -4 } })).toBe(0);
    });

    it('suggests the first unfinished unlocked level', () => {
        const progress = {
            highestLevel: 4,
            completedLevels: [0, 1, 2],
            stars: { 0: 3, 1: 2, 2: 1 },
        };

        expect(suggestedLevelIndex(100, progress)).toBe(3);
    });

    it('suggests the furthest unlocked level when everything is complete', () => {
        const progress = {
            highestLevel: 99,
            completedLevels: Array.from({ length: 100 }, (_, index) => index),
            stars: Object.fromEntries(
                Array.from({ length: 100 }, (_, index) => [index, 3])
            ),
        };

        expect(suggestedLevelIndex(100, progress)).toBe(99);
        expect(suggestedLevelIndex(0, progress)).toBe(0);
    });
});
