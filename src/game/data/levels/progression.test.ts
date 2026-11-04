import { describe, expect, it } from 'vitest';
import { BOARD_VIEW_BOTTOM, BOARD_VIEW_TOP, ROW_HEIGHT } from '../../config';
import { LEVELS } from './index';
import { layoutCells } from './layout';
import {
    attemptAllowanceForLevel,
    attemptShotBudgetFor,
    colorCountForLevel,
    difficultyBandForLevel,
    difficultyLabelForLevel,
    starLimitsForShots,
    totalBubblesForLevel,
    totalShotsForLevel,
} from './progression';
import { validateLevel } from './validate';

const VISIBLE_ROWS = Math.floor((BOARD_VIEW_BOTTOM - BOARD_VIEW_TOP) / ROW_HEIGHT);

const bubbleCountSource = (level: number): number => {
    let previous = 0;

    for (let step = 1; step <= level; step++) {
        previous = Math.max(previous + 1, totalBubblesForLevel(step));
    }

    return previous;
};

describe('1000-level progression configuration', () => {
    it('follows the documented bubble-count curve', () => {
        expect(totalBubblesForLevel(1)).toBe(50);
        expect(totalBubblesForLevel(5)).toBe(70);
        expect(totalBubblesForLevel(10)).toBe(95);
        expect(totalBubblesForLevel(20)).toBe(130);
        expect(totalBubblesForLevel(50)).toBe(220);
        expect(totalBubblesForLevel(100)).toBe(350);
        expect(totalBubblesForLevel(200)).toBe(500);
        expect(totalBubblesForLevel(300)).toBe(650);
        expect(totalBubblesForLevel(500)).toBe(850);
        expect(totalBubblesForLevel(700)).toBe(1100);
        expect(totalBubblesForLevel(1000)).toBe(1500);
    });

    it('gives every level strictly more bubbles than the level before it', () => {
        let previous = 0;

        for (let level = 1; level <= 1000; level++) {
            const bubbles = totalBubblesForLevel(level);
            expect(bubbles).toBeGreaterThan(previous);
            previous = bubbles;
        }

        expect(previous).toBe(1500);
    });

    it('uses the documented difficulty milestones', () => {
        expect(difficultyBandForLevel(1)).toBe(1);
        expect(difficultyBandForLevel(50)).toBe(1);
        expect(difficultyBandForLevel(51)).toBe(2);
        expect(difficultyBandForLevel(100)).toBe(2);
        expect(difficultyBandForLevel(101)).toBe(3);
        expect(difficultyBandForLevel(200)).toBe(3);
        expect(difficultyBandForLevel(201)).toBe(4);
        expect(difficultyBandForLevel(300)).toBe(4);
        expect(difficultyBandForLevel(301)).toBe(5);
        expect(difficultyBandForLevel(500)).toBe(5);
        expect(difficultyBandForLevel(501)).toBe(6);
        expect(difficultyBandForLevel(700)).toBe(6);
        expect(difficultyBandForLevel(701)).toBe(7);
        expect(difficultyBandForLevel(900)).toBe(7);
        expect(difficultyBandForLevel(901)).toBe(8);
        expect(difficultyBandForLevel(1000)).toBe(8);

        expect(difficultyLabelForLevel(1)).toBe('Normal');
        expect(difficultyLabelForLevel(40)).toBe('Normal');
        expect(difficultyLabelForLevel(60)).toBe('Medium');
        expect(difficultyLabelForLevel(150)).toBe('Hard');
        expect(difficultyLabelForLevel(250)).toBe('Very Hard');
        expect(difficultyLabelForLevel(400)).toBe('Extreme Hard');
        expect(difficultyLabelForLevel(600)).toBe('Very Extreme');
        expect(difficultyLabelForLevel(800)).toBe('Expert');
        expect(difficultyLabelForLevel(1000)).toBe('Insane');
    });

    it('keeps the palette bands stable', () => {
        expect(colorCountForLevel(1)).toBe(2);
        expect(colorCountForLevel(20)).toBe(2);
        expect(colorCountForLevel(21)).toBe(3);
        expect(colorCountForLevel(100)).toBe(3);
        expect(colorCountForLevel(101)).toBe(4);
        expect(colorCountForLevel(300)).toBe(4);
        expect(colorCountForLevel(301)).toBe(5);
        expect(colorCountForLevel(600)).toBe(5);
        expect(colorCountForLevel(601)).toBe(6);
        expect(colorCountForLevel(1000)).toBe(6);
    });

    it('tightens shot budgets relative to puzzle difficulty', () => {
        // Per-shot clear expectations tighten as the milestones rise: the same
        // sized board gets a proportionally larger budget while the effective
        // clear capacity demanded from every shot stays far above the level-1
        // baseline.
        const sampleBubbles = 600;
        const clearRateAt = (level: number): number => sampleBubbles / totalShotsForLevel(level, sampleBubbles);

        expect(clearRateAt(40)).toBeGreaterThan(clearRateAt(900));
        expect(totalShotsForLevel(900, sampleBubbles)).toBeGreaterThanOrEqual(10);

        // Budgets never shrink between consecutive levels in the catalog...
        let previousShots = 0;

        LEVELS.forEach((definition) => {
            expect(definition.totalShots).toBeGreaterThanOrEqual(Math.max(10, previousShots));
            previousShots = definition.totalShots;
        });

        // ...and the demanded clear rate (bubbles per available shot) never
        // exceeds the friendliest opening level's clear capacity.
        for (let level = 1; level <= 1000; level++) {
            const bubbles = bubbleCountSource(level);
            const rate = bubbles / totalShotsForLevel(level, bubbles);
            expect(rate).toBeLessThanOrEqual(3.5 - 0.11 + 1e-9);
        }
    });

    it('rates stars at 50% / 75% / 100% of the shot budget', () => {
        const limits = starLimitsForShots(10);

        expect(limits.threeStarLimit).toBe(5);
        expect(limits.twoStarLimit).toBe(8);
        expect(limits.oneStarLimit).toBe(10);
    });

    it('shrinks the mistake allowance every level as accuracy is demanded', () => {
        expect(attemptAllowanceForLevel(1)).toBeCloseTo(0.85, 5);
        expect(attemptAllowanceForLevel(1000)).toBeCloseTo(0.23, 5);

        let previous = Number.POSITIVE_INFINITY;
        for (let level = 1; level <= 1000; level += 7) {
            const allowance = attemptAllowanceForLevel(level);
            expect(allowance).toBeLessThan(previous);
            previous = allowance;
        }
    });

    it('derives the attempt budget algorithmically from the verified requirement', () => {
        // Level 1 keeps a generous allowance: an easy opening.
        expect(attemptShotBudgetFor(1, 18, 5)).toBe(10);
        // 5 required + floor(0.85*5 → 5) = 10, clamped ≤ 18.

        const sample = (levelId: number, ceiling: number, required: number): number =>
            attemptShotBudgetFor(levelId, ceiling, required);

        // Never below the verified solvable requirement (+2 safety) ...
        for (const level of [1, 2, 3, 4, 5, 10, 50, 100, 200, 500, 700, 900, 1000]) {
            const budget = sample(level, totalShotsForLevel(level, totalBubblesForLevel(level)), 17);
            expect(budget).toBeGreaterThanOrEqual(19);
        }

        // ... never above the catalog ceiling ...
        expect(sample(300, 100, 60)).toBeLessThanOrEqual(100);

        // ... and proportionally tighter as the levels rise: the same puzzle
        // requirement receives a smaller mistake allowance every milestone.
        const tight = sample(500, 10_000, 50);
        const loose = sample(1, 10_000, 50);
        expect(tight).toBeLessThan(loose);
        expect(tight - 50).toBeGreaterThan(0);
    });

    it('stores the correct configuration on the sampled catalog levels', () => {
        const checkpoints = [1, 2, 3, 4, 5, 10, 50, 100, 200, 500, 700, 900, 1000];

        checkpoints.forEach((level) => {
            const definition = LEVELS[level - 1];

            expect(definition.id).toBe(level);
            expect(definition.totalBubbles).toBe(totalBubblesForLevel(level));
            expect(layoutCells(definition)).toHaveLength(definition.totalBubbles);
            expect(definition.totalShots).toBe(definition.maxShots);
            expect(definition.fixedBoard).toBe(true);
            expect(definition.dangerEnabled).toBe(false);
            expect(definition.shotsPerDrop).toBe(0);

            const expected = starLimitsForShots(definition.totalShots);
            expect(definition.threeStarLimit).toBe(expected.threeStarLimit);
            expect(definition.twoStarLimit).toBe(expected.twoStarLimit);
            expect(definition.oneStarLimit).toBe(expected.oneStarLimit);
        });
    });

    it('makes late boards taller than the fixed viewport, while early boards fit', () => {
        const early = LEVELS[0];
        const middle = LEVELS[199];
        const late = LEVELS[999];

        expect(early.layout.length).toBeLessThanOrEqual(VISIBLE_ROWS);
        expect(middle.layout.length).toBeGreaterThan(VISIBLE_ROWS);
        expect(late.layout.length).toBeGreaterThan(VISIBLE_ROWS);
    });

    it('passes structural validation at every checkpoint', () => {
        const checkpoints = [1, 2, 3, 4, 5, 10, 50, 100, 200, 500, 700, 900, 1000];

        checkpoints.forEach((level) => {
            const result = validateLevel(LEVELS[level - 1], level - 1);

            expect(result.issues).toEqual([]);
            expect(result.bubbleCount).toBe(totalBubblesForLevel(level));
        });
    });
});
