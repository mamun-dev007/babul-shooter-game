import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GridSystem } from './GridSystem';
import { LevelSystem } from './LevelSystem';
import { LEVELS } from '../data/levels';
import { resetRecentLayouts } from '../data/levels/randomLayout';

/**
 * Extra-balls rewarded-ad reward: +3 bubbles added to the remaining count
 * without overwriting it, repeatable, and cleared per level attempt.
 */

const recorder = (calls: unknown[]): GridSystem =>
    ({
        get bubbleCount(): number { return calls.length; },
        spawnBubble: (row: unknown, col: unknown, color: unknown) => calls.push({ row, col, color }),
    }) as unknown as GridSystem;

const readySystem = (): LevelSystem => {
    const system = new LevelSystem();
    system.load(0);
    system.buildBoard(recorder([]), { seed: 7 });
    return system;
};

const burnShots = (system: LevelSystem, targetRemaining: number): void => {
    while (system.shotsRemaining > targetRemaining && system.shotsUsedCount < system.maxShots) {
        // Skip the shot's side effects; only the counter matters here.
        system.registerShot();
    }
};

afterEach(() => {
    vi.restoreAllMocks();
    resetRecentLayouts();
});

describe('extra balls (rewarded ad) shots', () => {
    it('adds exactly 3 bubbles to an existing remaining count (5 → 8)', () => {
        const system = readySystem();
        burnShots(system, 5);
        expect(system.shotsRemaining).toBe(5);

        const granted = system.addExtraShots(3);

        expect(granted).toBe(8);
        expect(system.shotsRemaining).toBe(8);
    });

    it('never overwrites or resets the existing remaining bubbles', () => {
        const system = readySystem();
        burnShots(system, 5);
        const usedBefore = system.shotsUsedCount;

        system.addExtraShots(3);

        expect(system.shotsUsedCount).toBe(usedBefore);
        expect(system.canShoot).toBe(true);
    });

    it('grants +3 that the player can normally shoot', () => {
        const system = readySystem();
        burnShots(system, 5);
        system.addExtraShots(3);

        // The three bonus bubbles behave like ordinary shots: each consumes one.
        system.registerShot();
        expect(system.shotsRemaining).toBe(7);
        system.registerShot();
        expect(system.shotsRemaining).toBe(6);
    });

    it('adds the reward repeatedly for every completed ad', () => {
        const system = readySystem();
        burnShots(system, 2);

        system.addExtraShots(3);
        system.addExtraShots(3);

        expect(system.shotsRemaining).toBe(8);
    });

    it('ignores zero or negative reward requests', () => {
        const system = readySystem();
        burnShots(system, 9);

        expect(system.addExtraShots(0)).toBe(9);
        expect(system.addExtraShots(-5)).toBe(9);
        expect(system.addExtraShots(2.7)).toBe(11);
    });

    it('keeps shot-star limits and drop cadence unaffected by the bonus', () => {
        const system = readySystem();
        const limitsBefore = { ...system.shotStarLimits };

        system.addExtraShots(3);

        expect(system.shotStarLimits).toEqual(limitsBefore);
        expect(system.untilNextDrop).toBe(system.level.shotsPerDrop);
    });

    it('clears the bonus on a fresh attempt', () => {
        const system = readySystem();
        system.addExtraShots(3);
        burnShots(system, 0);

        system.load(0);

        expect(system.maxShots).toBe(LEVELS[0].totalShots);
        expect(system.shotsRemaining).toBe(LEVELS[0].totalShots);
    });

    it('reveals shots even at a fully exhausted budget', () => {
        const system = readySystem();
        burnShots(system, 0);
        expect(system.canShoot).toBe(false);
        expect(system.resolveStatus({ score: 0, boardEmpty: false, danger: false })).toBe('lost');

        system.addExtraShots(3);

        expect(system.shotsRemaining).toBe(3);
        expect(system.canShoot).toBe(true);
        expect(system.resolveStatus({ score: 0, boardEmpty: false, danger: false })).toBe('playing');
    });
});
