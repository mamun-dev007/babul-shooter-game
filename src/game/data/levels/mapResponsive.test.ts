import { describe, expect, it } from 'vitest';
import { levelButtonScale, isMobileLevelWidth } from '../../levelBreakpoints';
import {
    MAP_NODE_HIT_RADIUS,
    MAP_NODE_RADIUS,
    MAP_NODE_SPACING,
    MAP_PATH_AMPLITUDE,
    MAP_PATH_CENTER,
    MAP_PATH_SCALE,
    buildLevelMapPath,
    configureLevelMapLayout,
} from './map';

/** Restores the tablet/desktop baseline after a mobile case. */
const useBaseline = (): void => {
    configureLevelMapLayout(540, 634, false);
};

describe('responsive level map layout', () => {
    it('keeps the tablet/desktop baseline exactly unchanged', () => {
        useBaseline();

        expect(MAP_PATH_AMPLITUDE).toBe(180);
        expect(MAP_NODE_RADIUS).toBe(26);
        expect(MAP_NODE_HIT_RADIUS).toBe(32);
        expect(MAP_NODE_SPACING).toBe(70);
        expect(MAP_PATH_SCALE).toBe(1);
    });

    it('scales node discs, hit areas and road strokes per phone breakpoint', () => {
        const expected = [
            [320, 1.3, 34, 39, 74],
            [360, 1.42, 37, 42, 80],
            [390, 1.55, 40, 45, 86],
            [540, 1.58, 41, 46, 88],
        ] as const;

        for (const [width, scale, radius, hit, spacing] of expected) {
            configureLevelMapLayout(540, 634, isMobileLevelWidth(width), levelButtonScale(width));

            expect(levelButtonScale(width)).toBe(scale);
            expect(MAP_NODE_RADIUS).toBe(radius);
            expect(MAP_NODE_HIT_RADIUS).toBe(hit);
            expect(MAP_NODE_SPACING).toBe(spacing);
            // The road thickens with the buttons and never matches the old
            // 1.22x mobile stroke except at the historic 1.18 ratio.
            expect(MAP_PATH_SCALE).toBeCloseTo(1.22 * (scale / 1.18), 6);
            // Neighbouring discs keep a real gap, and hit areas stay inside
            // the band between disc centres so taps hit the intended level.
            expect(spacing - 2 * radius).toBeGreaterThanOrEqual(6);
            expect(hit).toBeGreaterThanOrEqual(radius + 4);
            expect(hit).toBeLessThanOrEqual(spacing - radius - 1);
        }
    });

    it('widens the snake per breakpoint while keeping every disc on screen', () => {
        for (const width of [320, 360, 375, 390, 414, 430, 540]) {
            configureLevelMapLayout(540, 634, isMobileLevelWidth(width), levelButtonScale(width));

            const path = buildLevelMapPath(1000);
            const visualRadius = MAP_NODE_RADIUS + 4; // includes selected ring
            const left = Math.min(...path.map((point) => point.x));
            const right = Math.max(...path.map((point) => point.x));

            expect(MAP_PATH_AMPLITUDE).toBeGreaterThanOrEqual(72);
            expect(MAP_PATH_AMPLITUDE).toBeLessThanOrEqual(
                Math.max(72, MAP_PATH_CENTER - MAP_NODE_RADIUS - 16)
            );
            expect(left - visualRadius).toBeGreaterThanOrEqual(0);
            expect(right + visualRadius).toBeLessThanOrEqual(540);
            // The S-curve is centred and symmetric, so buttons stay aligned
            // with the road on both sides.
            expect(MAP_PATH_CENTER).toBe(270);
            expect(left + right).toBeCloseTo(540, 6);
        }
    });

    it('never lets neighbouring node discs overlap on short phones', () => {
        for (const width of [320, 360, 390, 430]) {
            configureLevelMapLayout(540, 594, isMobileLevelWidth(width), levelButtonScale(width));

            expect(2 * MAP_NODE_RADIUS).toBeLessThan(MAP_NODE_SPACING);
            expect(MAP_NODE_SPACING).toBeGreaterThanOrEqual(66);
        }
    });

    it('clamps the wider path on narrow worlds instead of overflowing', () => {
        for (const worldWidth of [320, 360, 420]) {
            configureLevelMapLayout(worldWidth, 634, true, 1.58);

            const path = buildLevelMapPath(1000);
            const visualRadius = MAP_NODE_RADIUS + 4;
            const left = Math.min(...path.map((point) => point.x));
            const right = Math.max(...path.map((point) => point.x));

            expect(MAP_PATH_AMPLITUDE).toBeLessThanOrEqual(
                Math.max(72, worldWidth / 2 - MAP_NODE_RADIUS - 16)
            );
            expect(left - visualRadius).toBeGreaterThanOrEqual(0);
            expect(right + visualRadius).toBeLessThanOrEqual(worldWidth);
        }

        useBaseline();
    });
});
