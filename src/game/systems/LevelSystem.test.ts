import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BubbleColorName } from '../config';
import { LEVELS } from '../data/levels';
import { resetRecentLayouts } from '../data/levels/randomLayout';
import { attemptShotBudgetFor, starLimitsForShots } from '../data/levels/progression';
import type { GridSystem } from './GridSystem';
import { LevelSystem } from './LevelSystem';

interface SpawnCall {
    row: number;
    col: number;
    color: BubbleColorName;
}

const recorder = (calls: SpawnCall[]): GridSystem =>
    ({
        get bubbleCount(): number { return calls.length; },
        spawnBubble: (row: number, col: number, color: BubbleColorName) => {
            calls.push({ row, col, color });
        },
    }) as unknown as GridSystem;

const boardWith = (count: number): GridSystem =>
    ({ get bubbleCount(): number { return count; } }) as unknown as GridSystem;

afterEach(() => {
    vi.restoreAllMocks();
    resetRecentLayouts();
});

describe('LevelSystem', () => {
    it('loads the full catalog and clamps indexes', () => {
        const system = new LevelSystem();
        expect(system.levelCount).toBe(1000);

        system.load(-1);
        expect(system.levelIndex).toBe(0);

        system.load(2000);
        expect(system.levelIndex).toBe(999);

        system.load(Number.NaN);
        expect(system.levelIndex).toBe(0);
    });

    it('builds exactly the configured bubble count on every attempt', () => {
        const first: SpawnCall[] = [];
        const second: SpawnCall[] = [];
        const system = new LevelSystem();
        system.load(0);

        system.buildBoard(recorder(first), { seed: 101 });
        system.buildBoard(recorder(second), { seed: 202 });

        expect(first).toHaveLength(LEVELS[0].totalBubbles);
        expect(second).toHaveLength(LEVELS[0].totalBubbles);
        expect(system.boardProgress).toBe(0);
        expect(system.remainingTargetCount).toBe(LEVELS[0].totalBubbles);
    });

    it("generates a different arrangement each time the level restarts", () => {
        const system = new LevelSystem();
        system.load(0);

        const first: SpawnCall[] = [];
        const second: SpawnCall[] = [];

        system.buildBoard(recorder(first), { seed: 11 });
        system.buildBoard(recorder(second), { seed: 22 });

        expect(first).not.toEqual(second);
        expect(system.layoutMeta).not.toBeNull();
    });

    it('spawns level 2 as a zigzag arrangement with the harder colour spread', () => {
        const system = new LevelSystem();
        system.load(1);

        const board: SpawnCall[] = [];
        system.buildBoard(recorder(board), { seed: 7 });

        expect(board).toHaveLength(LEVELS[1].totalBubbles);
        expect(system.layoutMeta?.pattern).toBe('zigzag');
    });

    it('falls back to the catalog budget before a board is built', () => {
        const system = new LevelSystem();
        system.load(0);
        const limits = starLimitsForShots(LEVELS[0].totalShots);

        expect(system.maxShots).toBe(LEVELS[0].totalShots);
        expect(system.shotStarLimits.threeStarLimit).toBe(limits.threeStarLimit);
        expect(system.shotStarLimits.twoStarLimit).toBe(limits.twoStarLimit);
        expect(system.shotStarLimits.oneStarLimit).toBe(limits.oneStarLimit);
    });

    it('computes the attempt budget algorithmically from the generated puzzle', () => {
        const system = new LevelSystem();
        system.load(0);

        const first: SpawnCall[] = [];
        system.buildBoard(recorder(first), { seed: 101 });

        const required = system.layoutMeta?.requiredShots ?? 0;
        const budget = attemptShotBudgetFor(LEVELS[0].id, LEVELS[0].totalShots, required);

        // The budget follows the generated board's verified requirement and is
        // never below what the puzzle needs.
        expect(system.maxShots).toBe(budget);
        expect(budget).toBeGreaterThanOrEqual(required + 2);
        expect(budget).toBeLessThanOrEqual(LEVELS[0].totalShots);
        expect(system.shotStarLimits).toEqual(starLimitsForShots(budget));

        // A harder-seeded attempt gets its own verified budget, never looser
        // than its own requirement.
        const harsher = attemptShotBudgetFor(LEVELS[0].id, LEVELS[0].totalShots, required + 3);
        expect(harsher).toBeGreaterThanOrEqual(budget);
    });

    it('budgets stay within the catalog ceiling at every sampled level', () => {
        [1, 10, 100, 500, 1000].forEach((level) => {
            const system = new LevelSystem();
            system.load(level - 1);

            const board: SpawnCall[] = [];
            system.buildBoard(recorder(board), { seed: 40 + level });

            expect(system.maxShots).toBeLessThanOrEqual(LEVELS[level - 1].totalShots);
            expect(system.maxShots).toBeGreaterThan((system.layoutMeta?.requiredShots ?? 0));
        });
    });

    it('counts each shot exactly once and refuses shots over budget', () => {
        const system = new LevelSystem();
        system.load(0);

        expect(system.untilNextDrop).toBe(0);
        expect(system.canShoot).toBe(true);

        for (let shot = 1; shot <= system.maxShots; shot++) {
            expect(system.registerShot()).toBe(false);
            expect(system.shotsUsedCount).toBe(shot);
            expect(system.shotsRemaining).toBe(system.maxShots - shot);
            expect(system.untilNextDrop).toBe(0);
            expect(system.canShoot).toBe(shot < system.maxShots);
        }

        expect(system.registerShot()).toBe(false);
        expect(system.shotsUsedCount).toBe(system.maxShots);
        expect(system.shotsRemaining).toBe(0);

        system.load(1);
        expect(system.shotsUsedCount).toBe(0);
        expect(system.shotsRemaining).toBe(system.maxShots);
        expect(system.canShoot).toBe(true);
    });

    it('ignores the danger line on fixed boards', () => {
        const system = new LevelSystem();
        system.load(0);

        expect(
            system.resolveStatus({ score: 0, boardEmpty: false, danger: true })
        ).toBe('playing');
    });

    it('wins only when the board is empty and loses when shots run out', () => {
        const system = new LevelSystem();
        system.load(0);

        system.syncBoard(boardWith(1));
        expect(
            system.resolveStatus({ score: 0, boardEmpty: false, danger: false })
        ).toBe('playing');

        system.syncBoard(boardWith(0));
        expect(
            system.resolveStatus({ score: 0, boardEmpty: true, danger: false })
        ).toBe('won');

        system.load(0);
        system.syncBoard(boardWith(1));
        for (let shot = 0; shot < system.maxShots; shot++) {
            system.registerShot();
        }

        expect(system.shotsRemaining).toBe(0);
        expect(
            system.resolveStatus({ score: 0, boardEmpty: false, danger: false })
        ).toBe('lost');
    });

    it('restores the original target count when a level is reloaded', () => {
        const system = new LevelSystem();
        system.load(0);
        system.syncBoard(boardWith(1));
        system.load(0);
        expect(system.remainingTargetCount).toBe(LEVELS[0].totalBubbles);
    });

    it('awards 3, 2, 1 or 0 stars from the shot count', () => {
        const system = new LevelSystem();
        system.load(0);
        const [three, two, one] = [
            LEVELS[0].threeStarLimit,
            LEVELS[0].twoStarLimit,
            LEVELS[0].oneStarLimit,
        ];

        expect(system.starsForShots(0)).toBe(3);
        expect(system.starsForShots(three)).toBe(3);
        expect(system.starsForShots(three + 1)).toBe(2);
        expect(system.starsForShots(two)).toBe(2);
        expect(system.starsForShots(two + 1)).toBe(1);
        expect(system.starsForShots(one)).toBe(1);
        expect(system.starsForShots(one + 1)).toBe(0);
    });

    it('draws ceiling colours only from the level palette', () => {
        const system = new LevelSystem();
        system.load(0);
        vi.spyOn(Math, 'random').mockReturnValue(0.999);

        expect(system.randomColor()).toBe(LEVELS[0].colors[LEVELS[0].colors.length - 1]);
    });

    it('advances through levels and wraps after the final level', () => {
        const system = new LevelSystem();
        system.load(0);
        system.registerShot();

        expect(system.advance()).toBe(1);
        expect(system.shotsUsedCount).toBe(0);

        system.load(999);
        expect(system.advance()).toBe(0);
        expect(system.hasNext).toBe(true);
    });
});
