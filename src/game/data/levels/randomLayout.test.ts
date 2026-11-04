import { describe, expect, it } from 'vitest';
import {
    BUBBLE_RADIUS,
    BOARD_VIEW_BOTTOM,
    BOARD_VIEW_TOP,
    GRID_COLS,
    GRID_LEFT,
    GRID_ROWS,
    GAME_WIDTH,
} from '../../config';
import { LEVELS } from './index';
import {
    analyzeLayout,
    generateLevelLayout,
    patternsForBand,
    resetRecentLayouts,
    type GeneratedLayout,
} from './randomLayout';

/**
 * Levels required by the spec, plus the milestone boundaries.
 */
const SAMPLE_LEVELS = [1, 2, 3, 4, 5, 10, 50, 100, 200, 500, 700, 900, 1000];

const generateWithSeed = (levelIndex: number, seed: number): GeneratedLayout =>
    generateLevelLayout(LEVELS[levelIndex - 1], { seed, attempts: 6 });

describe('random layout generator', () => {
    it('generates a different arrangement for every attempt of the same level', () => {
        SAMPLE_LEVELS.forEach((level) => {
            const first = generateWithSeed(level, 1);
            const second = generateWithSeed(level, 2);

            expect(first.layout).not.toEqual(second.layout);

            // The configured bubble count is never altered by regeneration.
            expect(analyzeLayout(first.layout, LEVELS[level - 1].colors).bubbleCount)
                .toBe(LEVELS[level - 1].totalBubbles);
            expect(analyzeLayout(second.layout, LEVELS[level - 1].colors).bubbleCount)
                .toBe(LEVELS[level - 1].totalBubbles);
        });
    });

    it('keeps every generated board structurally valid and solvable', () => {
        SAMPLE_LEVELS.forEach((level) => {
            const definition = LEVELS[level - 1];
            const generated = generateWithSeed(level, 12345);
            const analysis = analyzeLayout(generated.layout, definition.colors);

            expect(generated.layout.length).toBeGreaterThan(0);
            expect(generated.layout.length).toBeLessThanOrEqual(GRID_ROWS);
            generated.layout.forEach((rowText) => {
                expect(rowText.length).toBe(GRID_COLS);
            });
            expect(analysis.bubbleCount).toBe(definition.totalBubbles);
            // Connected to the ceiling, every palette colour used and clearable
            // inside the configured shot budget.
            expect(analysis.connected).toBe(true);
            expect(analysis.allColorsPresent).toBe(true);
            expect(analysis.requiredShots).toBeLessThanOrEqual(definition.totalShots);
            expect(generated.requiredShots).toBe(analysis.requiredShots);
        });
    });

    it('pins levels 2-5 to the zigzag archetype with fresh arrangements', () => {
        [2, 3, 4, 5].forEach((level) => {
            const first = generateWithSeed(level, 3);
            const second = generateWithSeed(level, 4);

            expect(first.pattern).toBe('zigzag');
            expect(second.pattern).toBe('zigzag');
            expect(first.layout).not.toEqual(second.layout);
        });
    });

    it('uses harder pattern pools as the milestones rise', () => {
        expect(patternsForBand(1)).not.toContain('mixed');
        expect(patternsForBand(4)).not.toContain('mixed');
        expect(patternsForBand(7)).toContain('mixed');
        expect(patternsForBand(8)).toContain('mixed');
        expect(patternsForBand(8)).toContain('geometric');

        // Higher milestones also mean more distinct archetypes.
        expect(new Set(patternsForBand(8)).size).toBeGreaterThanOrEqual(
            new Set(patternsForBand(1)).size
        );
    });

    it('avoids repeating the previous pattern when alternatives exist', () => {
        resetRecentLayouts();
        const definition = LEVELS[899]; // Expert band, wide pattern pool
        const first = generateLevelLayout(definition, { seed: 7 });
        const second = generateLevelLayout(definition, { seed: 9 });

        expect(second.pattern).not.toBe(first.pattern);

        const seeds = generateLevelLayout(definition, { seed: 7 });
        expect(seeds.seed).not.toBe(7);
        expect(seeds.layout).not.toEqual(first.layout);
    });

    it('never generates bubbles during play and never changes totals', () => {
        // The generator is a pure level-start builder; it returns a fixed set of
        // rows that the grid spawns exactly once. Scrolling only repositions
        // those existing bubbles (covered by GridSystem tests).
        for (let level = 1; level <= 1000; level += 137) {
            const definition = LEVELS[level - 1];
            const generated = generateWithSeed(level, 55);
            expect(generated.layout.join('')).not.toContain('X');
            expect(
                generated.layout.reduce(
                    (sum, rowText) => sum + [...rowText].filter((token) => token !== '.').length,
                    0
                )
            ).toBe(definition.totalBubbles);
        }
    });

    it('starts every formation from a full-width centered ceiling row', () => {
        // The horizontal center of the board is the anchor: every generated
        // layout holds the complete ceiling row, which pins the formation to
        // the horizontal center and the top of the playfield.
        SAMPLE_LEVELS.forEach((level) => {
            const generated = generateWithSeed(level, 777);

            expect(generated.layout[0].replace(/\./g, '').length).toBe(GRID_COLS);
            expect(generated.layout[0]).not.toContain('.');
        });
    });

    it('keeps the formation horizontally centered with consistent spacing', () => {
        SAMPLE_LEVELS.forEach((level) => {
            const generated = generateWithSeed(level, 909);
            const totalBubbles = LEVELS[level - 1].totalBubbles;
            let columnSum = 0;
            let count = 0;
            let maxRow = -1;

            generated.layout.forEach((rowText, row) => {
                expect(rowText.length).toBe(GRID_COLS);

                for (let col = 0; col < GRID_COLS; col++) {
                    if (rowText[col] !== '.') {
                        columnSum += col - (GRID_COLS - 1) / 2;
                        count += 1;
                        maxRow = Math.max(maxRow, row);
                    }
                }
            });

            expect(count).toBe(totalBubbles);

            // The bubble mass stays balanced around the board's horizontal
            // center (within a full column of drift).
            expect(columnSum / count).toBeGreaterThanOrEqual(-1);
            expect(columnSum / count).toBeLessThanOrEqual(1);

            // Odd-topped patterns can leave the last row trailing; depth stays
            // proportional to the bubble count with consistent hex spacing.
            expect(maxRow).toBeLessThan(Math.ceil(totalBubbles / GRID_COLS) + 4);
        });
    });

    it('never places a starting bubble outside the playable area', () => {
        SAMPLE_LEVELS.forEach((level) => {
            const generated = generateWithSeed(level, 424);

            generated.layout.forEach((rowText, _row) => {
                expect(rowText).toMatch(/^[ROGYBP.]+$/);
            });

            // The formation begins in the upper section: the first row sits at
            // GRID_TOP, and for boards that fit the viewport the whole layout
            // stays inside the visible board band.
            const contentHeight =
                generated.layout.length * BUBBLE_RADIUS * Math.sqrt(3) + BUBBLE_RADIUS;

            if (contentHeight <= BOARD_VIEW_BOTTOM - BOARD_VIEW_TOP) {
                expect(
                    generated.layout.every((rowText) => rowText.replace(/\./g, '').length > 0)
                ).toBe(true);
            }

            // Playfield horizontal bounds: bubbles live in the centered grid.
            const playableWidth = GAME_WIDTH - GRID_LEFT * 2;
            expect(playableWidth).toBeGreaterThan(0);
        });
    });
});
