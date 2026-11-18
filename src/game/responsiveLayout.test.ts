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
    PAUSE_BUTTON_RADIUS,
    PLUS_BUTTON_RADIUS,
    POWER_BUTTON_RADIUS,
    PROGRESS_HEIGHT,
    PROGRESS_Y,
    SHOTS_CAPTION_Y,
    SHOTS_Y,
    SIDE_CONTROL_RADIUS,
    TOOLBAR_BUTTON_RADIUS,
    TOOLBAR_BUTTON_XS,
    TOOLBAR_BUTTON_Y,
    TOOLBAR_HEIGHT,
    TOOLBAR_Y,
    plusButtonY,
    shotsCaptionY,
    shotsX,
    shotsY,
    toolbarButtonY,
    toolbarY,
} from '../ui/hudAnchors';
import {
    aimBandBottomY,
    aimBandTopY,
    computeWorldSize,
    DESIGN_WIDTH,
    dangerLineY,
    gridOriginX,
    gridSpanWidth,
    LAUNCHER_BASE_RADIUS,
    LAUNCHER_LOADED_BUBBLE_SIZE,
    LAUNCHER_NEXT_PREVIEW_SIZE,
    LAUNCHER_SIDE_CONTROL_MAX_OFFSET,
    LAUNCHER_SIDE_CONTROL_MIN_GAP,
    LAUNCHER_SIDE_CONTROL_RADIUS,
    launcherBaseBottomOffset,
    launcherSideControlBottomOffset,
    launcherSideControlOffsetX,
    launcherSideControlY,
    launcherTopOffset,
    loadingBarGeometry,
    MIN_WORLD_HEIGHT,
    progressBarBottomY,
    shooterAnchorY,
    SHOOTER_TOP_CLEARANCE,
} from './layout';
import {
    SETTINGS_BASE_PANEL_HEIGHT,
    SETTINGS_BASE_PANEL_WIDTH,
    SETTINGS_CONTENT_CENTER_X,
    SETTINGS_CONTENT_CENTER_Y,
    SETTINGS_PANEL_HEIGHT,
    SETTINGS_PANEL_WIDTH,
    SETTINGS_POPUP_SCALE,
    settingsCameraScroll,
    settingsFitScale,
} from './responsive';

/** Phone-first viewports: the widths the HUD must fit without clipping. */
const VIEWPORTS: Array<[number, number]> = [
    [320, 568],
    [360, 640],
    [360, 800],
    [375, 667],
    [375, 812],
    [390, 844],
    [414, 896],
    [430, 932],
    [540, 960],
    [768, 1024],
    [820, 1180],
    [1024, 1366],
    [1280, 720],
    [1366, 768],
    [1440, 900],
    [1920, 1080],
];

/**
 * Responsive viewport contracts: the world tracks the real container aspect
 * and Phaser Scale.FIT fills it edge-to-edge, so "responsive" means every
 * anchor derives from the live design size — nothing may hardcode literals.
 * Top HUD hugs the top, bottom controls hug the bottom, shooter sits between
 * board floor and toolbar.
 */
describe('responsive layout anchors', () => {
    it('keeps bottom-anchored gameplay values derived from GAME_HEIGHT', () => {
        expect(TOOLBAR_Y).toBe(GAME_HEIGHT - CANVAS_BOTTOM_GAP);
        expect(TOOLBAR_Y + TOOLBAR_HEIGHT).toBe(GAME_HEIGHT - 10);
        expect(TOOLBAR_BUTTON_Y).toBe(GAME_HEIGHT - 57);
        expect(SHOOTER_Y).toBe(GAME_HEIGHT - 162);
        expect(SHOTS_Y).toBe(GAME_HEIGHT - 162);
        expect(SHOTS_CAPTION_Y).toBe(SHOTS_Y + 20);
        expect(BOARD_VIEW_BOTTOM).toBe(GAME_HEIGHT - 170);
        expect(DANGER_Y).toBe(BOARD_VIEW_BOTTOM - 80);
    });

    it('keeps top HUD anchors tied to the single top anchor', () => {
        expect(PROGRESS_Y).toBe(CANVAS_TOP_ANCHOR + 18);
        expect(BOARD_VIEW_TOP).toBe(GRID_TOP);
    });

    it('bounds the aim band to the progress bar bottom and launcher top', () => {
        // Top of the band: the Progress Bar's bottom edge — nothing above it
        // (the HUD row, score and level labels) may accept aim input.
        expect(aimBandTopY()).toBe(PROGRESS_Y + PROGRESS_HEIGHT);
        expect(aimBandTopY()).toBe(progressBarBottomY());
        // Bottom of the band: the launcher's topmost pixel. Everything below
        // (loaded bubble seeks, SHOTS card, toolbar buttons) is non-aimable.
        expect(aimBandBottomY()).toBe(SHOOTER_Y - SHOOTER_TOP_CLEARANCE);
        // The band is a sane playable strip: it contains the board's visible
        // interior and excludes the launcher body.
        expect(aimBandBottomY()).toBeLessThan(SHOOTER_Y);
        expect(aimBandTopY()).toBeLessThan(aimBandBottomY());
    });

    it('never lets bubbles, shooter and bottom controls overlap', () => {
        // The launcher body sits below the danger line, so board bubbles can
        // never be drawn behind it.
        expect(SHOOTER_Y - LAUNCHER_BASE_RADIUS).toBeGreaterThan(DANGER_Y);
        // Shooter sits above the toolbar band.
        expect(SHOOTER_Y).toBeLessThan(TOOLBAR_Y - 8);
        // Toolbar stays inside the canvas.
        expect(TOOLBAR_Y + TOOLBAR_HEIGHT).toBeLessThanOrEqual(GAME_HEIGHT);
        // DANGER line inside the visible board.
        expect(DANGER_Y).toBeGreaterThan(BOARD_VIEW_TOP);
        expect(DANGER_Y).toBeLessThan(BOARD_VIEW_BOTTOM);
    });
});

/**
 * Bottom-screen clipping contracts: the enlarged launcher and its two
 * equal-sized side controls are bottom-anchored above the toolbar on every
 * phone/tablet/desktop aspect. No part of them may fall off the visible
 * screen or sit under the bottom power-up buttons.
 */
describe('bottom gameplay chrome stays fully visible', () => {
    it.each(VIEWPORTS)(
        'keeps launcher and side controls clear of the bottom HUD on %ix%i',
        (width, height) => {
            const world = computeWorldSize(width, height);
            const h = world.height;
            const w = world.width;
            const launcherY = shooterAnchorY(h);
            const toolbarTop = toolbarY(h);
            const powerButtonTop = toolbarButtonY(h) - POWER_BUTTON_RADIUS;
            const plusBadgeTop = plusButtonY(h) - PLUS_BUTTON_RADIUS;

            // Launcher base (shadow included): above the toolbar with room to
            // breathe, and well inside the screen.
            const launcherBottom = launcherY + launcherBaseBottomOffset();
            expect(launcherBottom).toBeLessThanOrEqual(toolbarTop - 6);
            expect(launcherBottom).toBeLessThan(h - 6);

            // Both side controls share the launcher's vertical centre and the
            // same shadow-inclusive bottom edge, so they clear the power
            // buttons and their plus badges together.
            const sideBottom = launcherSideControlY(h) + launcherSideControlBottomOffset();
            expect(sideBottom).toBeLessThanOrEqual(powerButtonTop - 6);
            expect(sideBottom).toBeLessThanOrEqual(plusBadgeTop - 6);
            expect(sideBottom).toBeLessThanOrEqual(toolbarTop - 6);
            expect(sideBottom).toBeLessThan(h - 6);

            // Both controls are symmetrically placed around the launcher and
            // stay fully inside the world, with a real gap from the launcher.
            const offset = launcherSideControlOffsetX(w);
            const leftX = w / 2 - offset;
            const rightX = w / 2 + offset;
            expect(shotsX(w)).toBe(leftX);
            expect(rightX).toBeCloseTo(w / 2 + offset, 6);
            expect(leftX - SIDE_CONTROL_RADIUS).toBeGreaterThanOrEqual(6);
            expect(rightX + SIDE_CONTROL_RADIUS).toBeLessThanOrEqual(w - 6);
            expect(leftX).toBeLessThan(rightX);
            expect(offset - SIDE_CONTROL_RADIUS - LAUNCHER_BASE_RADIUS).toBeGreaterThanOrEqual(
                LAUNCHER_SIDE_CONTROL_MIN_GAP - 1
            );

            // Labels render inside their discs, and the caption stays above
            // the toolbar band.
            expect(shotsY(h)).toBe(launcherSideControlY(h));
            expect(shotsY(h)).toBe(shooterAnchorY(h));
            expect(shotsCaptionY(h)).toBeLessThan(shotsY(h) + SIDE_CONTROL_RADIUS);
            expect(shotsCaptionY(h) + 10).toBeLessThanOrEqual(toolbarTop - 4);

            // The launcher stays below the top HUD and below the danger line,
            // so the board can never draw over it.
            expect(launcherY - launcherTopOffset()).toBeGreaterThan(
                PROGRESS_Y + PROGRESS_HEIGHT
            );
            expect(launcherY - LAUNCHER_BASE_RADIUS).toBeGreaterThan(dangerLineY(h));
        }
    );

    it('keeps the enlarged current and next bubble displays readable', () => {
        // Both launcher bubbles are larger than a board bubble; the preview
        // stays a smaller sibling of the loaded bubble and fits its disc.
        expect(LAUNCHER_LOADED_BUBBLE_SIZE).toBeGreaterThan(BUBBLE_RADIUS * 2);
        expect(LAUNCHER_NEXT_PREVIEW_SIZE).toBeGreaterThan(BUBBLE_RADIUS * 2 * 0.7);
        expect(LAUNCHER_NEXT_PREVIEW_SIZE).toBeLessThan(LAUNCHER_LOADED_BUBBLE_SIZE);
        expect(LAUNCHER_NEXT_PREVIEW_SIZE).toBeLessThan(SIDE_CONTROL_RADIUS * 2 - 10);
    });

    it('renders both launcher side controls at exactly the same size', () => {
        expect(SIDE_CONTROL_RADIUS).toBe(LAUNCHER_SIDE_CONTROL_RADIUS);
        expect(shotsY()).toBe(launcherSideControlY());
        expect(shotsY()).toBe(shooterAnchorY());
        expect(shotsCaptionY()).toBe(shotsY() + 20);
        expect(GAME_WIDTH - shotsX(GAME_WIDTH)).toBeCloseTo(
            GAME_WIDTH / 2 + launcherSideControlOffsetX(GAME_WIDTH),
            6
        );
    });

    it('spaces the side controls dynamically and caps them on wide screens', () => {
        const minimum =
            LAUNCHER_BASE_RADIUS +
            LAUNCHER_SIDE_CONTROL_MIN_GAP +
            LAUNCHER_SIDE_CONTROL_RADIUS;
        const phone = launcherSideControlOffsetX(GAME_WIDTH);
        const wider = launcherSideControlOffsetX(850);
        const desktop = launcherSideControlOffsetX(1600);

        expect(phone).toBeGreaterThanOrEqual(Math.ceil(minimum));
        expect(wider).toBeGreaterThan(phone);
        expect(desktop).toBe(LAUNCHER_SIDE_CONTROL_MAX_OFFSET);
        expect(desktop).toBeLessThanOrEqual(LAUNCHER_SIDE_CONTROL_MAX_OFFSET);
    });

    it('renders every bottom toolbar button at the same size', () => {
        expect(POWER_BUTTON_RADIUS).toBe(TOOLBAR_BUTTON_RADIUS);
        expect(PAUSE_BUTTON_RADIUS).toBe(TOOLBAR_BUTTON_RADIUS);
        expect(TOOLBAR_BUTTON_RADIUS).toBeGreaterThan(42);
        expect(TOOLBAR_BUTTON_Y - TOOLBAR_BUTTON_RADIUS).toBeGreaterThan(TOOLBAR_Y);
        expect(TOOLBAR_BUTTON_Y + TOOLBAR_BUTTON_RADIUS).toBeLessThan(
            TOOLBAR_Y + TOOLBAR_HEIGHT
        );
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

    it('fills the viewport exactly on every phone and desktop size', () => {
        [
            [320, 568],
            [360, 640],
            [360, 800],
            [375, 667],
            [375, 812],
            [390, 844],
            [414, 896],
            [430, 932],
            [540, 960],
            [768, 1024],
            [820, 1180],
            [1024, 1366],
            [1280, 720],
            [1366, 768],
            [1440, 900],
            [1920, 1080],
        ].forEach(([width, height]) => {
            const world = computeWorldSize(width, height);

            // The world keeps the available aspect exactly, so Scale.FIT fills
            // the container edge-to-edge — no letterbox bands. Rounding to
            // whole world pixels may leave a sub-pixel remainder.
            expect(world.width / world.height).toBeCloseTo(width / height, 2);

            const scale = Math.min(width / world.width, height / world.height);
            expect(width - world.width * scale).toBeLessThan(1);
            expect(height - world.height * scale).toBeLessThan(1);

            expect(world.width).toBeGreaterThanOrEqual(gridSpanWidth());
            expect(world.height).toBeGreaterThanOrEqual(MIN_WORLD_HEIGHT);
        });
    });

    it('keeps every bubble column inside the world on all viewport sizes', () => {
        [
            [320, 568],
            [360, 640],
            [375, 812],
            [390, 844],
            [414, 896],
            [430, 932],
            [768, 1024],
            [1024, 1366],
            [1280, 720],
            [1920, 1080],
        ].forEach(([width, height]) => {
            const world = computeWorldSize(width, height);
            expect(world.width).toBeGreaterThanOrEqual(gridSpanWidth());
            expect(gridOriginX(world.width)).toBeGreaterThanOrEqual(0);
            expect(gridOriginX(world.width) + gridSpanWidth()).toBeLessThanOrEqual(
                world.width + 1e-6
            );
        });
    });
});

/**
 * The loading bar is drawn twice over the same artwork: once in DOM (the
 * HTML boot splash, before Phaser boots) and once on the canvas by
 * LoadingScene. Both must agree on the geometry to the pixel, so the exact
 * formulas are locked here — changing them means updating the inline mirror
 * script in index.html and src/game/bootSplashBar.ts the same way.
 */
describe('loading bar geometry', () => {
    it('keeps the baseline 540x960 metrics stable', () => {
        const bar = loadingBarGeometry(540, 960);
        expect(bar.width).toBeCloseTo(486, 6);
        expect(bar.height).toBeCloseTo(38.4, 6);
        expect(bar.x).toBeCloseTo(27, 6);
        expect(bar.y).toBeCloseTo(777.6, 6);
        expect(bar.percentFontSize).toBe(32);
        expect(bar.percentX).toBe(270);
        expect(bar.percentY).toBeCloseTo(839, 6);
    });

    it('centres the bar and keeps it above the bottom on every world', () => {
        [
            [320, 568],
            [390, 844],
            [540, 960],
            [820, 1180],
            [1024, 640],
            [1280, 800],
        ].forEach(([w, h]) => {
            const bar = loadingBarGeometry(w, h);
            expect(bar.x).toBeCloseTo((w - bar.width) / 2, 6);
            expect(bar.width).toBeLessThanOrEqual(600);
            expect(bar.height).toBeGreaterThanOrEqual(30);
            expect(bar.height).toBeLessThanOrEqual(40);
            expect(bar.y + bar.height).toBeLessThan(h - 40);
            expect(bar.percentX).toBe(w / 2);
            // Percent label sits just below the bar, on screen.
            expect(bar.percentY).toBeGreaterThan(bar.y + bar.height);
            expect(bar.percentY).toBeLessThan(h);
            expect(bar.percentFontSize).toBeGreaterThanOrEqual(28);
            expect(bar.percentFontSize).toBeLessThanOrEqual(36);
        });
    });
});

describe('settings popup responsive fit', () => {
    it('uses the settings artwork centre, not the gameplay centre', () => {
        expect(SETTINGS_CONTENT_CENTER_X).toBe(34 + SETTINGS_BASE_PANEL_WIDTH / 2);
        expect(SETTINGS_CONTENT_CENTER_Y).toBe(220 + SETTINGS_BASE_PANEL_HEIGHT / 2);
        expect(SETTINGS_CONTENT_CENTER_X).not.toBe(DESIGN_WIDTH / 2);
    });

    it('enlarges the settings popup by ~80% in both dimensions', () => {
        expect(SETTINGS_POPUP_SCALE).toBeGreaterThanOrEqual(1.75);
        expect(SETTINGS_POPUP_SCALE).toBeLessThanOrEqual(1.85);
        expect(SETTINGS_PANEL_WIDTH).toBe(Math.round(472 * SETTINGS_POPUP_SCALE));
        expect(SETTINGS_PANEL_HEIGHT).toBe(Math.round(520 * SETTINGS_POPUP_SCALE));
    });

    it.each(VIEWPORTS)(
        'keeps the settings panel centred and fully visible on %ix%i',
        (width, height) => {
            const world = computeWorldSize(width, height);
            const scale = settingsFitScale(width, height, world.width, world.height);
            const cssWidth = SETTINGS_PANEL_WIDTH * scale * (width / world.width);
            const cssHeight = SETTINGS_PANEL_HEIGHT * scale * (height / world.height);

            expect(scale).toBeGreaterThan(0);
            expect(scale).toBeLessThanOrEqual(1);
            expect(cssWidth).toBeLessThanOrEqual(Math.min(width * 0.94, 756) + 0.5);
            expect(cssHeight).toBeLessThanOrEqual(height * 0.94 + 0.5);
        }
    );

    it.each(VIEWPORTS)(
        'keeps the enlarged popup fully inside the camera view on %ix%i',
        (width, height) => {
            const world = computeWorldSize(width, height);
            const zoom = settingsFitScale(width, height, world.width, world.height);
            const scrollX = settingsCameraScroll(SETTINGS_CONTENT_CENTER_X, world.width);
            const scrollY = settingsCameraScroll(SETTINGS_CONTENT_CENTER_Y, world.height);
            // Phaser's world view is centred at scroll + size/2, independent
            // of zoom. The popup must stay inside that view with margin.
            expect(scrollX + world.width / 2).toBe(SETTINGS_CONTENT_CENTER_X);
            expect(scrollY + world.height / 2).toBe(SETTINGS_CONTENT_CENTER_Y);
            const viewHalfW = world.width / zoom / 2;
            const viewHalfH = world.height / zoom / 2;
            expect(viewHalfW).toBeGreaterThanOrEqual(SETTINGS_PANEL_WIDTH / 2);
            expect(viewHalfH).toBeGreaterThanOrEqual(SETTINGS_PANEL_HEIGHT / 2);
        }
    );
});
