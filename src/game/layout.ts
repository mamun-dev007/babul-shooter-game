import type { Scene } from 'phaser';
import { BUBBLE_DIAMETER, BUBBLE_RADIUS, GRID_COLS, GRID_TOP, setGameViewport } from './config';

/**
 * Dynamic world size - the single source of truth for the live design
 * coordinates every scene anchors to.
 *
 * The game no longer letterboxes a fixed 700x960 canvas. Instead the world is
 * sized to match the real (safe-area-excluded) container aspect exactly, and
 * Phaser Scale.FIT then fills the screen edge-to-edge. Every scene
 * re-derives its layout from `worldWidth()` / `worldHeight()` (or the explicit
 * anchor helpers below) so a resize or rotation reflows UI and gameplay
 * coordinates live.
 */

export interface WorldSize {
    readonly width: number;
    readonly height: number;
}

/** Baseline design viewport. All anchor helpers return these exact values at it. */
export const DESIGN_WIDTH = 700;
export const DESIGN_HEIGHT = 960;

/** Shortest playable world (matches the 640px design cut-off). */
export const MIN_WORLD_HEIGHT = 640;
/**
 * Legacy upper bounds kept for API compatibility. The world now always keeps
 * the viewport aspect so Scale.FIT can fill the canvas edge-to-edge; clamping
 * either dimension independently would letterbox the screen.
 */
export const MAX_WORLD_HEIGHT = 1180;
export const MAX_WORLD_WIDTH = 1150;

const BASELINE_BOTTOM_OFFSETS = {
    /** Toolbar top. */
    toolbar: 104,
    /** Power buttons' centres. */
    toolbarButton: 54,
    /** Launcher origin - high enough for the enlarged silhouette to clear
     *  the toolbar and the power buttons at every viewport height. */
    shooter: 162,
    /** SHOTS card top edge (the card hangs beside the launcher). */
    shotsCard: 170,
    /** Transient power-up toast centre. */
    notice: 190,
    /** Board's visible floor. */
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
 * Vertical clearance from the launcher's origin to the barrel's top edge
 * (drawn as `-SHOOTER_TOP_CLEARANCE` in objects/Shooter). Here so the aim band
 * stays pure layout math - no Phaser runtime imports.
 */
export const SHOOTER_TOP_CLEARANCE = 92;

/**
 * Launcher silhouette, uniformly ~39% larger than the original artwork and
 * roughly 18% larger than the previous 1.18 launcher. Every part of the
 * launcher (base, barrel, loaded bubble and next-bubble widget) derives from
 * these metrics, so proportions, shading and the spin animation are preserved
 * exactly. The silhouette is bottom-anchored above the toolbar: the
 * lowest launcher pixel (shadow / spinner ring) always stays inside the
 * visible viewport and clear of the bottom power-up buttons - asserted for
 * every supported viewport by responsiveLayout.test.ts.
 */
export const LAUNCHER_SCALE = 1.39;
export const LAUNCHER_BASE_RADIUS = 24 * LAUNCHER_SCALE;
export const LAUNCHER_SHADOW_RADIUS = 28 * LAUNCHER_SCALE;
export const LAUNCHER_SHADOW_OFFSET_Y = 5 * LAUNCHER_SCALE;
export const LAUNCHER_LOADED_BUBBLE_SIZE = BUBBLE_DIAMETER * LAUNCHER_SCALE;
/** Barrel length: the loaded bubble sits at the muzzle (barrel tip). */
export const LAUNCHER_BARREL_TIP = 76 * LAUNCHER_SCALE;
/** Preview bubble inside the equal-sized side control. */
export const LAUNCHER_NEXT_PREVIEW_SIZE = 38;

/** Both controls beside the launcher share this exact disc size. */
export const LAUNCHER_SIDE_CONTROL_RADIUS = 40;
/** Minimum breathing room between the launcher base and either side control. */
export const LAUNCHER_SIDE_CONTROL_MIN_GAP = 28;
/** Keeps desktop controls from drifting excessively far from the launcher. */
export const LAUNCHER_SIDE_CONTROL_MAX_OFFSET = 180;

/**
 * Horizontal distance from the launcher centre to each side control. Scales
 * with the available width, but never crowds the launcher or the screen edge.
 */
export const launcherSideControlOffsetX = (w = worldWidth()): number => {
    const minimum = LAUNCHER_BASE_RADIUS + LAUNCHER_SIDE_CONTROL_MIN_GAP + LAUNCHER_SIDE_CONTROL_RADIUS;
    const preferred = w * 0.19;
    const edgeSafe = w / 2 - LAUNCHER_SIDE_CONTROL_RADIUS - 18;
    return Math.round(
        Math.max(minimum, Math.min(preferred, LAUNCHER_SIDE_CONTROL_MAX_OFFSET, edgeSafe))
    );
};

/** Side controls share the launcher origin's vertical centre. */
export const launcherSideControlY = (h = worldHeight()): number => shooterAnchorY(h);

/** Lowest side-control pixel (shadow included), below its centre. */
export const launcherSideControlBottomOffset = (): number =>
    LAUNCHER_SIDE_CONTROL_RADIUS + 7;

/** Highest launcher pixel (top of the loaded bubble), above its origin. */
export const launcherTopOffset = (): number =>
    LAUNCHER_BARREL_TIP + LAUNCHER_LOADED_BUBBLE_SIZE / 2;

/** Lowest launcher pixel (base shadow included), below its origin. */
export const launcherBaseBottomOffset = (): number =>
    LAUNCHER_SHADOW_OFFSET_Y + LAUNCHER_SHADOW_RADIUS;

let currentWorld: WorldSize = { width: DESIGN_WIDTH, height: DESIGN_HEIGHT };

export const worldSize = (): WorldSize => ({ ...currentWorld });
export const worldWidth = (): number => currentWorld.width;
export const worldHeight = (): number => currentWorld.height;

/**
 * Pure mapping from the real available area (padded container bounds, in CSS
 * pixels) to world coordinates.
 *
 * The world always keeps the exact available aspect so Phaser's Scale.FIT
 * fills the container edge-to-edge - no letterboxing. Portrait/taller screens
 * anchor the width at the design width (the 13 columns must fit) and let the
 * height follow the aspect; landscape / ultra-short screens anchor the height
 * at the minimum and let the width widen. Clamping either dimension on its
 * own would reintroduce empty bands.
 */
export const computeWorldSize = (availW: number, availH: number): WorldSize => {
    const aw = Math.max(1, availW);
    const ah = Math.max(1, availH);
    const matchedHeight = DESIGN_WIDTH * (ah / aw);

    if (matchedHeight >= MIN_WORLD_HEIGHT) {
        return {
            width: DESIGN_WIDTH,
            height: Math.round(matchedHeight),
        };
    }

    return {
        width: Math.round(MIN_WORLD_HEIGHT * (aw / ah)),
        height: MIN_WORLD_HEIGHT,
    };
};

/**
 * The live area Phaser fits into: the container's own CSS box when it is laid
 * out, falling back to the visual viewport (then the window) during boot.
 * Measuring the container - not the window - keeps the world aspect aligned
 * with what Scale.FIT actually sees, including safe-area/browser chrome.
 */
export const measureViewport = (): WorldSize => {
    const container =
        typeof document === 'undefined' ? null : document.getElementById('game-container');
    const containerWidth = container?.clientWidth ?? 0;
    const containerHeight = container?.clientHeight ?? 0;

    if (containerWidth > 0 && containerHeight > 0) {
        return { width: containerWidth, height: containerHeight };
    }

    const viewport = typeof window === 'undefined' ? null : window.visualViewport;
    return {
        width: viewport?.width ?? (typeof window === 'undefined' ? DESIGN_WIDTH : window.innerWidth),
        height:
            viewport?.height ??
            (typeof window === 'undefined' ? DESIGN_HEIGHT : window.innerHeight),
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
    const width = Math.round(
        Math.max(BUBBLE_DIAMETER * GRID_COLS + BUBBLE_RADIUS, size.width)
    );
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
/* Gameplay anchors (baseline-exact at 700x960)                               */
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

/* ------------------------------------------------------------------------- */
/* Loading screen bar (LoadingScene canvas bar + HTML boot splash share it)   */
/* ------------------------------------------------------------------------- */

/**
 * Loading bar metrics in world coordinates. LoadingScene draws its canvas
 * bar from these numbers and the HTML boot splash mirrors them in CSS so
 * artwork + bar are visible together from the very first paint (before the
 * JS bundle boots) and the DOM-canvas hand-off is pixel-identical.
 */
export interface LoadingBarGeometry {
    /** Track top-left corner in world pixels. */
    readonly x: number;
    /** Track top-left corner in world pixels. */
    readonly y: number;
    /** Track size in world pixels. */
    readonly width: number;
    readonly height: number;
    /** Percent label font size in world pixels (rounded). */
    readonly percentFontSize: number;
    /** Percent label centre - the label is drawn with origin 0.5. */
    readonly percentX: number;
    readonly percentY: number;
}

/** Single source of truth for the loading bar's size and position. */
export const loadingBarGeometry = (
    w: number = worldWidth(),
    h: number = worldHeight()
): LoadingBarGeometry => {
    const width = Math.min(600, w * 0.9);
    const height = Math.max(30, Math.min(40, h * 0.04));
    const y = h - Math.max(52, Math.min(h * 0.19, w * 0.34));

    return {
        x: (w - width) / 2,
        y,
        width,
        height,
        percentFontSize: Math.round(Math.max(28, Math.min(36, w * 0.06))),
        percentX: w / 2,
        percentY: y + height + Math.max(16, Math.round(height * 0.6)),
    };
};
