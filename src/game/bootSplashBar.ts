import { computeWorldSize, loadingBarGeometry, worldHeight, worldWidth } from './layout';
import { loadingPercent } from './loadingProgress';

/**
 * DOM progress bar inside the HTML boot splash.
 *
 * The splash artwork paints progressively as the browser streams the image
 * in, so no event can reveal the bar in the artwork's first painted frame —
 * the bar is therefore on screen from the splash's very first paint and the
 * artwork never shows without it. It mirrors LoadingScene's canvas bar at
 * the exact same on-screen position, so the hand-off to the canvas-rendered
 * bar (once Phaser boots) is invisible.
 *
 * The bar is placed by three sync points, in order:
 *  1. an inline script in index.html (runs before this bundle, mirrors the
 *     same math — see the comment there),
 *  2. `positionBootSplashBar` from main.ts once the world size is known,
 *  3. `syncBootSplashBarToCanvas` from LoadingScene.preload against the
 *     live canvas rect — the pixel-perfect, authoritative placement.
 *
 * Every function is a no-op once the splash has been removed from the DOM.
 */

const BAR_ID = 'boot-splash-bar';
const FILL_ID = 'boot-splash-bar-fill';
const PERCENT_ID = 'boot-splash-percent';

/**
 * Phaser strokes the track rect with the line centred on its edge, so the
 * visible stroke reaches 1 world px outside the rect. The CSS track box is
 * inflated by the same amount so its (inward-drawn) border lands on top of
 * Phaser's stroke band.
 */
const STROKE_OVERHANG = 1;

/** Phaser draws the text stroke *before* the fill, leaving the stroke's
 *  outer half visible around the glyphs — mirrored with a blur-free ring
 *  of text-shadows so the DOM glyph fill stays solid like the canvas one. */
const TEXT_STROKE_COLOR = '#083d67';

interface SplashBarElements {
    readonly bar: HTMLElement;
    readonly fill: HTMLElement;
    readonly percent: HTMLElement;
}

let maxFillWidthPx = 0;
let currentProgress = 0;

const findSplashBar = (): SplashBarElements | null => {
    const bar = document.getElementById(BAR_ID);
    const fill = document.getElementById(FILL_ID);
    const percent = document.getElementById(PERCENT_ID);
    if (!bar || !fill || !percent) {
        return null;
    }
    return { bar, fill, percent };
};

const outerTextStroke = (radiusPx: number): string => {
    const radius = radiusPx.toFixed(2);
    const offsets = [
        `${radius}px 0`,
        `-${radius}px 0`,
        `0 ${radius}px`,
        `0 -${radius}px`,
        `${radius}px ${radius}px`,
        `${radius}px -${radius}px`,
        `-${radius}px ${radius}px`,
        `-${radius}px -${radius}px`,
    ];
    return offsets.map((offset) => `${TEXT_STROKE_COLOR} ${offset} 0`).join(', ');
};

/**
 * Places the bar on screen. `originLeft`/`originTop` are the canvas fit
 * rect's top-left in CSS pixels and `scale` converts world pixels to CSS
 * pixels.
 */
const applyGeometry = (
    elements: SplashBarElements,
    originLeft: number,
    originTop: number,
    scale: number,
    w: number,
    h: number
): void => {
    const g = loadingBarGeometry(w, h);

    elements.bar.style.left = `${originLeft + (g.x - STROKE_OVERHANG) * scale}px`;
    elements.bar.style.top = `${originTop + (g.y - STROKE_OVERHANG) * scale}px`;
    elements.bar.style.width = `${(g.width + 2 * STROKE_OVERHANG) * scale}px`;
    elements.bar.style.height = `${(g.height + 2 * STROKE_OVERHANG) * scale}px`;
    elements.bar.style.borderWidth = `${2 * STROKE_OVERHANG * scale}px`;

    // The fill is inset 3 world px inside the track rect; the padding box
    // (inside the border) already sits at the stroke's inner edge, which is
    // 1 world px in — hence the extra 2 world px offset on each side.
    elements.fill.style.left = `${2 * STROKE_OVERHANG * scale}px`;
    elements.fill.style.top = `${2 * STROKE_OVERHANG * scale}px`;
    elements.fill.style.height = `${(g.height - 6) * scale}px`;
    maxFillWidthPx = (g.width - 6) * scale;
    elements.fill.style.width = `${maxFillWidthPx * currentProgress}px`;

    elements.percent.style.left = `${originLeft + g.percentX * scale}px`;
    elements.percent.style.top = `${originTop + g.percentY * scale}px`;
    elements.percent.style.fontSize = `${Math.max(1, Math.round(g.percentFontSize * scale))}px`;
    elements.percent.style.textShadow = outerTextStroke(2 * STROKE_OVERHANG * scale);
};

/**
 * Positions the splash bar using the same computeWorldSize + Scale.FIT math
 * the canvas will be laid out with (viewport → world → centred fit rect).
 */
export const positionBootSplashBar = (viewportWidth: number, viewportHeight: number): void => {
    const elements = findSplashBar();
    if (!elements) {
        return;
    }
    const world = computeWorldSize(viewportWidth, viewportHeight);
    const scale = Math.min(viewportWidth / world.width, viewportHeight / world.height);
    const originLeft = (viewportWidth - world.width * scale) / 2;
    const originTop = (viewportHeight - world.height * scale) / 2;
    applyGeometry(elements, originLeft, originTop, scale, world.width, world.height);
};

/**
 * Re-syncs the splash bar onto the canvas' live on-screen rect — the
 * authoritative, pixel-perfect placement right before LoadingScene takes
 * over rendering the same bar.
 */
export const syncBootSplashBarToCanvas = (canvas: HTMLCanvasElement): void => {
    const elements = findSplashBar();
    if (!elements) {
        return;
    }
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
        // Canvas not laid out yet (still mid-boot); the pre-bundle placement
        // from positionBootSplashBar stays in effect.
        return;
    }
    applyGeometry(elements, rect.left, rect.top, rect.width / worldWidth(), worldWidth(), worldHeight());
};

/**
 * Mirrors the Phaser loader progress onto the splash bar so the visible DOM
 * bar and the (splash-covered) canvas bar agree during the hand-off window.
 */
export const updateBootSplashBarProgress = (progress: number): void => {
    const elements = findSplashBar();
    if (!elements) {
        return;
    }
    const value = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
    currentProgress = value;
    elements.fill.style.width = `${maxFillWidthPx * value}px`;
    elements.percent.textContent = `${loadingPercent(value)}%`;
};
