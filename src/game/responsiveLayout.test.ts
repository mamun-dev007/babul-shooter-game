import { describe, expect, it } from 'vitest';
import {
    BUBBLE_RADIUS,
    BOARD_VIEW_BOTTOM,
    BOARD_VIEW_TOP,
    DANGER_Y,
    GAME_HEIGHT,
    GAME_WIDTH,
    GRID_TOP,
    SHOOTER_Y,
} from './config';
import {
    CANVAS_BOTTOM_GAP,
    CANVAS_TOP_ANCHOR,
    PROGRESS_Y,
    SHOTS_Y,
    TOOLBAR_BUTTON_XS,
    TOOLBAR_BUTTON_Y,
    TOOLBAR_HEIGHT,
    TOOLBAR_Y,
} from '../ui/hudAnchors';
import { computeWorldSize } from './layout';

/**
 * Responsive viewport contracts: the design viewport (GAME_WIDTH x
 * GAME_HEIGHT) letterboxes onto every real screen via Phaser Scale.FIT, so
 * "responsive" means every anchor derives from the design size — nothing may
 * hardcode the 540x960 literals. Top HUD hugs the top, bottom controls hug
 * the bottom, shooter sits between board floor and toolbar.
 */
describe('responsive layout anchors', () => {
    it('keeps bottom-anchored gameplay values derived from GAME_HEIGHT', () => {
        expect(TOOLBAR_Y).toBe(GAME_HEIGHT - CANVAS_BOTTOM_GAP);
        expect(TOOLBAR_Y + TOOLBAR_HEIGHT).toBe(GAME_HEIGHT - 10);
        expect(TOOLBAR_BUTTON_Y).toBe(GAME_HEIGHT - 46);
        expect(SHOOTER_Y).toBe(GAME_HEIGHT - 114);
        expect(SHOTS_Y).toBe(GAME_HEIGHT - 136);
        expect(BOARD_VIEW_BOTTOM).toBe(GAME_HEIGHT - 170);
        expect(DANGER_Y).toBe(BOARD_VIEW_BOTTOM - 80);
    });

    it('keeps top HUD anchors tied to the single top anchor', () => {
        expect(PROGRESS_Y).toBe(CANVAS_TOP_ANCHOR + 18);
        expect(BOARD_VIEW_TOP).toBe(GRID_TOP);
    });

    it('never lets bubbles, shooter and bottom controls overlap', () => {
        // Board floor clears the shooter silhouette (radius 19 + margin).
        expect(BOARD_VIEW_BOTTOM).toBeLessThan(SHOOTER_Y - BUBBLE_RADIUS - 20);
        // Shooter sits above the toolbar band.
        expect(SHOOTER_Y).toBeLessThan(TOOLBAR_Y - 8);
        // Toolbar stays inside the canvas.
        expect(TOOLBAR_Y + TOOLBAR_HEIGHT).toBeLessThanOrEqual(GAME_HEIGHT);
        // DANGER line inside the visible board.
        expect(DANGER_Y).toBeGreaterThan(BOARD_VIEW_TOP);
        expect(DANGER_Y).toBeLessThan(BOARD_VIEW_BOTTOM);
    });

    it('spreads the toolbar buttons evenly across any design width', () => {
        const slot = GAME_WIDTH / (TOOLBAR_BUTTON_XS.length + 1);

        TOOLBAR_BUTTON_XS.forEach((center, index) => {
            expect(center).toBeCloseTo(slot * (index + 1), 6);
        });

        // Perfect symmetry around the horizontal centre.
        const { length } = TOOLBAR_BUTTON_XS;
        for (let index = 0; index < length / 2; index += 1) {
            const left = TOOLBAR_BUTTON_XS[index];
            const right = TOOLBAR_BUTTON_XS[length - 1 - index];
            expect(left + right).toBeCloseTo(GAME_WIDTH, 6);
        }
    });

    it('reflows identically for common phone viewport essays (proportional scaling)', () => {
        // The canvas letterboxes, so on real 320..430px devices the design
        // coordinates shrink by scale = viewportHeight/960 — positions scale
        // in unison: only ratios between anchors matter. Locked here:
        const boardMid = (BOARD_VIEW_TOP + BOARD_VIEW_BOTTOM) / 2;
        expect(boardMid).toBeLessThan(SHOOTER_Y);
        expect(TOOLBAR_BUTTON_XS[1]).toBeLessThan(TOOLBAR_BUTTON_XS[2]);
    });

    it('computes finite playable worlds for common Android screen sizes', () => {
        [
            [320, 568],
            [360, 640],
            [360, 800],
            [390, 844],
            [412, 915],
            [432, 960],
            [480, 1040],
            [375, 812],
            [600, 960],
            [768, 1024],
            [820, 1180],
            [1024, 1366],
            [1280, 720],
            [1366, 768],
            [1440, 900],
            [1920, 1080],
        ].forEach(([width, height]) => {
            const world = computeWorldSize(width, height);
            expect(world.width).toBeGreaterThanOrEqual(GRID_TOP * 6);
            expect(world.height).toBeGreaterThanOrEqual(640);
            expect(world.width / world.height).toBeCloseTo(width / height, 1);
        });
    });
});
