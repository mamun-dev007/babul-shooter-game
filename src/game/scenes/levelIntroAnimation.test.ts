import { describe, expect, it } from 'vitest';
import {
    INTRO_BUBBLE_RISE_MS,
    INTRO_POPUP_ENTER_MS,
    INTRO_POPUP_EXIT_MS,
    INTRO_POPUP_HOLD_MS,
    introBubbleRiseOffset,
    introPopupEnterX,
    introPopupExitX,
} from './levelIntroAnimation';

describe('level intro banner placement', () => {
    it('starts the panel completely off the left edge', () => {
        const panelWidth = 360;
        const centre = introPopupEnterX(panelWidth);

        expect(centre + panelWidth / 2).toBeLessThan(0);
    });

    it('exits the panel completely off the right edge', () => {
        const worldWidth = 700;
        const panelWidth = 360;
        const centre = introPopupExitX(worldWidth, panelWidth);

        expect(centre - panelWidth / 2).toBeGreaterThan(worldWidth);
    });

    it('keeps the banner centred horizontally at the destination', () => {
        // The scene tweens x to `GAME_WIDTH / 2`; the off-screen helpers must
        // not accidentally clamp the panel narrower than the world.
        const worldWidth = 1024;
        const panelWidth = 360;

        expect(introPopupEnterX(panelWidth)).toBeLessThan(worldWidth / 2);
        expect(introPopupExitX(worldWidth, panelWidth)).toBeGreaterThan(worldWidth / 2);
    });
});

describe('intro bubble rise offset', () => {
    it('hides the whole formation below the visible floor before rising', () => {
        const finalYs = [120, 260, 400, 520];
        const viewBottom = 790;
        const radius = 25.5;
        const offset = introBubbleRiseOffset(finalYs, viewBottom, radius);

        for (const finalY of finalYs) {
            expect(finalY + offset - radius).toBeGreaterThanOrEqual(viewBottom);
        }
    });

    it('preserves the formation spacing exactly', () => {
        const finalYs = [100, 188, 276, 364];
        const offset = introBubbleRiseOffset(finalYs, 900, 25.5);
        const startYs = finalYs.map((y) => y + offset);

        for (let index = 1; index < finalYs.length; index += 1) {
            expect(startYs[index] - startYs[index - 1]).toBeCloseTo(
                finalYs[index] - finalYs[index - 1],
                6
            );
        }
    });

    it('does not move a formation that already sits below the floor', () => {
        const offset = introBubbleRiseOffset([880, 950], 700, 25.5);

        expect(offset).toBe(0);
    });

    it('returns zero for an empty board', () => {
        expect(introBubbleRiseOffset([], 700, 25.5)).toBe(0);
    });
});

describe('level intro timing', () => {
    it('holds the banner centred for about two seconds', () => {
        expect(INTRO_POPUP_HOLD_MS).toBeGreaterThanOrEqual(1800);
        expect(INTRO_POPUP_HOLD_MS).toBeLessThanOrEqual(2400);
    });

    it('rises the formation within about two seconds', () => {
        expect(INTRO_BUBBLE_RISE_MS).toBeGreaterThanOrEqual(1500);
        expect(INTRO_BUBBLE_RISE_MS).toBeLessThanOrEqual(2500);
    });

    it('enters faster than it exits only within a short, smooth window', () => {
        expect(INTRO_POPUP_ENTER_MS).toBeGreaterThan(0);
        expect(INTRO_POPUP_EXIT_MS).toBeGreaterThan(0);
        expect(INTRO_POPUP_ENTER_MS).toBeLessThanOrEqual(600);
        expect(INTRO_POPUP_EXIT_MS).toBeLessThanOrEqual(600);
    });
});
