import { describe, expect, it } from 'vitest';
import {
    LEVEL_HUD_SCALE,
    LEVEL_HUD_TOP_PADDING,
    mobileSideButtonLayout,
    mobileTopBarLayout,
} from './levelSectionLayout';

const PHONE_SCALES = [1.3, 1.42, 1.55, 1.58] as const;
/** A phone band multiplier combined with the 1.5x HUD enlargement. */
const HUD_SCALES = PHONE_SCALES.map((scale) => scale * LEVEL_HUD_SCALE);
const WORLD_WIDTH = 540;
const COLLECT_TOP = 69;

describe('Level Section HUD layout', () => {
    it('adds 20px of top padding above the top button row', () => {
        for (const scale of HUD_SCALES) {
            const top = mobileTopBarLayout(scale);
            expect(top.y).toBe(48 + LEVEL_HUD_TOP_PADDING);
        }
    });

    it('keeps the two top buttons apart and inside the world', () => {
        for (const scale of HUD_SCALES) {
            const top = mobileTopBarLayout(scale);

            expect(top.gearX - top.radius).toBeGreaterThanOrEqual(0);
            expect(top.infoX - top.gearX).toBeGreaterThanOrEqual(top.radius * 2);
            expect(top.infoX + top.radius).toBeLessThanOrEqual(700);
        }
    });

    it('pushes the collect panel below the scaled info button', () => {
        for (const scale of HUD_SCALES) {
            const top = mobileTopBarLayout(scale);

            // Top of the shifted panel must sit below the Info disc with a gap.
            expect(COLLECT_TOP + top.collectShift).toBeGreaterThanOrEqual(
                top.y + top.radius + 6
            );
            expect(top.collectShift).toBeGreaterThanOrEqual(0);
        }
    });

    it('keeps side buttons on-screen and vertically separated', () => {
        for (const scale of HUD_SCALES) {
            const side = mobileSideButtonLayout(scale, WORLD_WIDTH);

            expect(side.leftX - side.radius).toBeGreaterThanOrEqual(0);
            expect(side.rightX + side.radius).toBeLessThanOrEqual(WORLD_WIDTH);
            expect(side.y2 - side.y1).toBeGreaterThan(side.radius * 2);
            expect(side.y3 - side.y2).toBeGreaterThan(side.radius * 2);
            // Each step must also fit the disc plus both label rows.
            expect(side.y2 - side.y1).toBeGreaterThan(
                side.radius + 41 * scale + 4
            );
        }
    });

    it('grows the controls as the phone ladder grows', () => {
        let previousRadius = 0;
        let previousStep = 0;

        for (const scale of HUD_SCALES) {
            const top = mobileTopBarLayout(scale);
            const side = mobileSideButtonLayout(scale, WORLD_WIDTH);
            const step = side.y2 - side.y1;

            expect(top.radius).toBeGreaterThan(previousRadius);
            expect(step).toBeGreaterThan(previousStep);
            previousRadius = top.radius;
            previousStep = step;
        }
    });
});
