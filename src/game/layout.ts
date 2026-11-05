import type { Scene } from 'phaser';
import { BUBBLE_DIAMETER, BUBBLE_RADIUS, GRID_COLS, GRID_TOP, setGameViewport } from './config';

/**
 * Dynamic world size — the single source of truth for the live design
 * coordinates every scene anchors to.
 *
 * The game no longer letterboxes a fixed 540x960 canvas. Instead the world is
 * sized to match the real (safe-area-excluded) container aspect within sane
 * clamps, and Phaser Scale.FIT then fills the screen edge-to-edge. Every scene
 * re-derives its layout from `worldWidth()` / `worldHeight()` (or the explicit
 * anchor helpers below) so a resize or rotation reflows UI and gameplay
 * coordinates live.
 */

export interface WorldSize {
    readonly width: number;
    readonly height: number;
}

/** Baseline design viewport. All anchor helpers return these exact values at it. */
export const DESIGN_WIDTH = 540;
export const DESIGN_HEIGHT = 960;

/** Shortest playable world (matches the 640px design cut-off). */
export const MIN_WORLD_HEIGHT = 640;
/** Tallest world before extra height letterboxes instead of stretching play. */
export const MAX_WORLD_HEIGHT = 1180;
/** Widest world before extra width letterboxes (portrait-first game). */
export const MAX_WORLD_WIDTH = 1150;

const BASELINE_BOTTOM_OFFSETS = {
    toolbar: 82,
    toolbarButton: 46,
    shooter: 114,
    shotsCard: 136,
    notice: 154,
    boardView: 170,
} as const;

/**
 * Top HUD chrome metrics (shared source for the HUD and the aim band).
 * Mirrored live in `ui/hudAnchors.ts`, which re-exports the constants for the
 * HUD while deriving its own anchors from them.
 */
export const CANVAS_TOP_ANCHOR = 18;
/** Gap from the top HUD row to the progress bar's top edge. */
export const PROGRESS_BAR_TOP_OFFSET = 18;
export const PROGRESS_HEIGHT = 9;

/**
 * Vertical clearance from the launcher's origin to its topmost pixel (the
 * barrel's top edge, drawn as `-SHOOTER_TOP_CLEARANCE` in objects/Shooter).
 * Here so the aim band stays pure layout math — no Phaser runtime imports.
 */
export const SHOOTER_TOP_CLEARANCE = 78;

let currentWorld: WorldSize = { width: DESIGN_WIDTH, height: DESIGN_HEIGHT };

export const worldSize = (): WorldSize => ({ ...currentWorld });
export const worldWidth = (): number => currentWorld.width;
export const worldHeight = (): number => currentWorld.height;

const clamp = (value: number, min: number, max: number): number =>
    Math.min(max, Math.max(min, value));

/**
 * Pure mapping from the real available area (padded container bounds, in CSS
 * pixels) to world coordinates.
 *
 * - Portrait/taller screens: width stays 540 (13 columns must fit), height
 *   follows the aspect ratio, clamped so bottom controls never overlap.
 * - Landscape / ultra-short screens: height locks to the minimum and the
 *   width widens to match the aspect so FIT fills the screen.
 */
export const computeWorldSize = (availW: number, availH: number): WorldSize => {
    const aw = Math.max(1, availW);
    const ah = Math.max(1, availH);
    const matchedHeight = DESIGN_WIDTH * (ah / aw);

    if (matchedHeight >= MIN_WORLD_HEIGHT) {
        return {
            width: DESIGN_WIDTH,
            height: Math.round(clamp(matchedHeight, MIN_WORLD_HEIGHT, MAX_WORLD_HEIGHT)),
        };
    }

    return {
        width: Math.round(clamp(MIN_WORLD_HEIGHT * (aw / ah), DESIGN_WIDTH, MAX_WORLD_WIDTH)),
        height: MIN_WORLD_HEIGHT,
    };
};

type WorldSizeListener = (size: WorldSize) => void;
const listeners = new Set<WorldSizeListener>();

/** Subscribes to live world changes; returns an unsubscribe function. */
export const onWorldResize = (listener: WorldSizeListener): (() => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

/**
 * Applies a new world size and notifies every subscribed scene. Returns true
 * when the size actually changed (callers have already guarded, this is the
 * authoritative no-op filter).
 */
export const setWorldSize = (size: WorldSize): boolean => {
    const width = Math.round(Math.max(BUBBLE_DIAMETER * GRID_COLS, size.width));
    const height = Math.round(Math.max(MIN_WORLD_HEIGHT / 2, size.height));

    if (width === currentWorld.width && height === currentWorld.height) {
        return false;
    }

    currentWorld = { width, height };
    setGameViewport(width, height);
    listeners.forEach((listener) => listener({ ...currentWorld }));
    return true;
};

/** Reset used by tests and any full-reboot flow. */
export const resetWorldSize = (): void => {
    setWorldSize({ width: DESIGN_WIDTH, height: DESIGN_HEIGHT });
};

/**
 * Registers a relayout callback for a scene and auto-unsubscribes when the
 * scene shuts down, so restarted scenes never leak listeners.
 */
export const attachRelayout = (
    scene: Scene,
    listener: (size: WorldSize) => void
): (() => void) => {
    const off = onWorldResize(listener);
    scene.events.once('shutdown', off);
    scene.events.once('destroy', off);
    return off;
};

/* ------------------------------------------------------------------------- */
/* Gameplay anchors (baseline-exact at 540x960)                               */
/* ------------------------------------------------------------------------- */

/** Horizontal span the 13-column grid needs: centres + one outer radius. */
export const gridSpanWidth = (): number => GRID_COLS * BUBBLE_DIAMETER + BUBBLE_RADIUS;

/** Left origin of the grid so the formation is centred in the world. */
export const gridOriginX = (w = worldWidth()): number =>
    (w - gridSpanWidth()) / 2;

/** Bounce walls just outside the bubble centres' playfield. */
export const wallLeftX = (w = worldWidth()): number => gridOriginX(w) + BUBBLE_RADIUS;
export const wallRightX = (w = worldWidth()): number => w - gridOriginX(w) - BUBBLE_RADIUS;

/** Visible board band. Top is top-anchored (HUD height), floor hugs the shooter stack. */
export const boardViewTopY = (): number => GRID_TOP;
export const boardViewBottomY = (h = worldHeight()): number =>
    h - BASELINE_BOTTOM_OFFSETS.boardView;

/** Danger line sits 80px above the board floor. */
export const dangerLineY = (h = worldHeight()): number =>
    boardViewBottomY(h) - 80;

/** Launcher origin, above the toolbar. */
export const shooterAnchorY = (h = worldHeight()): number =>
    h - BASELINE_BOTTOM_OFFSETS.shooter;

/** Bottom edge of the top progress bar: the aim band's ceiling. */
export const progressBarBottomY = (): number =>
    CANVAS_TOP_ANCHOR + PROGRESS_BAR_TOP_OFFSET + PROGRESS_HEIGHT;

/** Highest pointer Y that still aims/fires (below the top progress bar). */
export const aimBandTopY = (): number => progressBarBottomY();
/** Lowest pointer Y that may aim or fire (at the launcher's top edge). */
export const aimBandBottomY = (h = worldHeight()): number =>
    shooterAnchorY(h) - SHOOTER_TOP_CLEARANCE;

/* ------------------------------------------------------------------------- */
/* HUD anchors live in `ui/hudAnchors.ts`; shared chrome anchors below.       */
/* ------------------------------------------------------------------------- */

/* MenuScene */
export const menuCoinX = (w = worldWidth()): number => w - 92;
export const menuCoinY = (): number => 52;
export const menuPlayY = (h = worldHeight()): number => h - 370;
export const menuSettingsY = (h = worldHeight()): number => h - 270;
export const menuUtilityY = (h = worldHeight()): number => h - 158;

/* LevelSelectionScene */
export const mapViewTopY = (): number => 108;
export const mapViewBottomY = (h = worldHeight()): number => h - 218;
export const mapPlayY = (h = worldHeight()): number => h - 108;
