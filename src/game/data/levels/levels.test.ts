import { describe, expect, it } from 'vitest';
import { COLOR_NAMES, GRID_ROWS } from '../../config';
import { CHAPTERS, LEVELS, LEVEL_COUNT, getLevel, getLevelById } from './index';
import { layoutCells } from './layout';
import { formatValidationReport, validateLevel, validateLevels } from './validate';
import type {
    LevelDefinition,
    ProgressionLevelDefinition,
} from './types';

const LAYOUT_PATTERN = /^[ROYGBP.]{13}$/;

describe('level catalog', () => {
    it('contains one hundred chapters of ten uniquely ordered levels (1000 total)', () => {
        expect(CHAPTERS).toHaveLength(100);
        expect(LEVELS).toHaveLength(1000);
        expect(LEVEL_COUNT).toBe(LEVELS.length);
        expect(new Set(LEVELS.map((level) => level.id)).size).toBe(LEVELS.length);

        CHAPTERS.forEach((chapterLevels, chapterIndex) => {
            expect(chapterLevels).toHaveLength(10);
            const chapterName = chapterLevels[0].chapterName;
            chapterLevels.forEach((level) => {
                expect(level.chapter).toBe(chapterIndex + 1);
                expect(level.chapterName).toBe(chapterName);
            });
        });

        LEVELS.forEach((level, index) => {
            expect(level.id).toBe(index + 1);
            expect(level.chapter).toBe(Math.floor(index / 10) + 1);
        });
    });

    it('has a valid fixed-board configuration for every level', () => {
        LEVELS.forEach((level) => {
            expect(level.layout.length).toBeGreaterThan(0);
            expect(level.layout.length).toBeLessThanOrEqual(GRID_ROWS);
            expect(level.colors.length).toBeGreaterThanOrEqual(2);
            expect(level.maxShots).toBeGreaterThan(0);
            expect(level.maxShots).toBe(level.totalShots);
            expect(level.shotsPerDrop).toBe(0);
            expect(level.fixedBoard).toBe(true);
            expect(level.dangerEnabled).toBe(false);
            expect(level.objective.type).toBe('clear-board');
            expect(level.threeStarLimit).toBeLessThan(level.twoStarLimit);
            expect(level.twoStarLimit).toBeLessThan(level.oneStarLimit);
            expect(level.oneStarLimit).toBe(level.totalShots);

            level.layout.forEach((row) => {
                expect(LAYOUT_PATTERN.test(row)).toBe(true);
            });

            const cells = layoutCells(level);
            expect(cells.length).toBe(level.totalBubbles);
            expect(cells.some((cell) => cell.row === 0)).toBe(true);

            const usedColors = new Set(cells.map((cell) => cell.color));
            expect([...usedColors].sort()).toEqual([...level.colors].sort());
            usedColors.forEach((color) => expect(COLOR_NAMES).toContain(color));
        });
    });

    it('is structurally valid with zero errors and warnings', () => {
        const report = validateLevels(LEVELS);

        expect(report.errors).toEqual([]);
        expect(report.warnings).toEqual([]);
        expect(report.levels).toHaveLength(1000);
    });

    it('does not claim unplayed levels are balanced', () => {
        expect(LEVELS.every((level) => level.playtested === false)).toBe(true);

        const report = validateLevels(LEVELS);
        expect(report.manualBalancePending).toEqual(
            Array.from({ length: LEVELS.length }, (_, index) => index + 1)
        );

        const formatted = formatValidationReport(report);
        expect(formatted).toContain('Manual balance still pending: 1-1000');
        expect(formatted).toContain('not playtests');
    });

    it('provides safe catalog lookups', () => {
        expect(getLevel(-5).id).toBe(1);
        expect(getLevel(999).id).toBe(1000);
        expect(getLevel(5000).id).toBe(1000);
        expect(getLevelById(42)?.id).toBe(42);
        expect(getLevelById(1000)?.id).toBe(1000);
        expect(getLevelById(1001)).toBeUndefined();
    });
});

describe('level validator diagnostics', () => {
    const makeLevel = (overrides: Partial<LevelDefinition>): LevelDefinition => ({
        ...LEVELS[0],
        ...overrides,
        layout: overrides.layout ?? LEVELS[0].layout,
        colors: overrides.colors ?? LEVELS[0].colors,
        objective: overrides.objective ?? LEVELS[0].objective,
        starThresholds: overrides.starThresholds ?? LEVELS[0].starThresholds,
    });

    const makeProgressionLevel = (
        overrides: Partial<ProgressionLevelDefinition>
    ): ProgressionLevelDefinition => ({
        ...LEVELS[0],
        ...overrides,
    });

    it('rejects malformed row widths and unused colours', () => {
        const level = makeLevel({
            id: 1,
            layout: ['RRR', 'RRRRRRRRRRR'],
            colors: ['red', 'yellow'],
            starThresholds: [240, 380, 520],
        });

        const result = validateLevel(level, 0);
        const codes = result.issues.map((entry) => entry.code);

        expect(codes).toContain('layout-row-width');
        expect(codes).toContain('color-unused');
    });

    it('rejects colours used in a layout but not declared', () => {
        const level = makeLevel({
            id: 1,
            layout: ['GGGGGGGGGGG', 'GGGGGGGGGGG'],
            colors: ['red', 'yellow'],
            starThresholds: [100, 200, 300],
        });

        const result = validateLevel(level, 0);
        const codes = result.issues.map((entry) => entry.code);

        expect(codes).toContain('color-undeclared');
    });

    it('rejects targets that cannot fit in the shot budget', () => {
        const level = makeLevel({
            id: 1,
            layout: LEVELS[0].layout,
            maxShots: 10,
            objective: { type: 'score', targetScore: 1000 },
            starThresholds: [1000, 1100, 1200],
        });

        const result = validateLevel(level, 0);
        const codes = result.issues.map((entry) => entry.code);

        expect(codes).toContain('objective-shot-budget');
        expect(codes).toContain('objective-over-capacity');
    });

    it('rejects disconnected starting bubbles', () => {
        const level = makeLevel({
            id: 1,
            layout: ['RRRRRRRRRRR', '...........', '..YYYYY....'],
            colors: ['red', 'yellow'],
            starThresholds: [100, 200, 300],
        });

        const result = validateLevel(level, 0);
        const codes = result.issues.map((entry) => entry.code);

        expect(codes).toContain('layout-floating');
    });

    it('rejects mismatched fixed-board counts, budgets and star limits', () => {
        const wrongBubbles = validateLevel(
            makeProgressionLevel({ totalBubbles: LEVELS[0].totalBubbles - 1 }),
            0
        );
        const wrongShots = validateLevel(
            makeProgressionLevel({ totalShots: LEVELS[0].totalShots + 1 }),
            0
        );
        const wrongDrop = validateLevel(
            makeProgressionLevel({ shotsPerDrop: 4 }),
            0
        );
        const wrongLimits = validateLevel(
            makeProgressionLevel({ threeStarLimit: LEVELS[0].threeStarLimit - 1 }),
            0
        );

        expect(wrongBubbles.issues.map((entry) => entry.code)).toContain('bubbles-mismatch');
        expect(wrongShots.issues.map((entry) => entry.code)).toContain('total-shots-mismatch');
        expect(wrongDrop.issues.map((entry) => entry.code)).toContain('fixed-drop-invalid');
        expect(wrongLimits.issues.map((entry) => entry.code)).toContain('star-limits-mismatch');
    });
});
