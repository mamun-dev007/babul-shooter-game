import {
    resolveLevelProgressState,
    resolveLevelStars,
    type LevelProgressSnapshot,
    type LevelProgressState,
} from './progress';

/**
 * Layout and view-model helpers for the level-selection map.
 *
 * The path is a proper snake: every ten nodes make one full S-wave curving
 * left then right, so a single screen always shows one complete loop of ten
 * stops. Positions are fully deterministic — no playtesting-randomness.
 */

export let MAP_WIDTH = 540;
/**
 * Vertical step between neighbouring nodes.
 *
 * Sized from the visible map viewport (height / 9) so about ten node
 * centres fit on screen at a time, clamped to 60–90px: the 60px floor
 * keeps the 52px buttons from overlapping on short screens, while the
 * 90px cap still keeps ten levels inside tall viewports. At the 540×960
 * design size this is 70px (9 × 70 = 630px inside the 634px viewport).
 */
export let MAP_NODE_SPACING = 70;
export const MAP_TOP_PAD = 90;
export const MAP_BOTTOM_PAD = 96;
export let MAP_PATH_CENTER = 270;
export let MAP_PATH_AMPLITUDE = 180;
/** Nodes per full snake cycle. Equals the page size: one wave per screen. */
export const MAP_WAVE_NODES = 10;

/** Exactly ten levels at a time live inside the map viewport. */
export const LEVELS_PER_PAGE = MAP_WAVE_NODES;

export const configureLevelMapLayout = (
    width: number,
    viewportHeight: number
): void => {
    MAP_WIDTH = Math.max(320, Math.round(width));
    MAP_PATH_CENTER = MAP_WIDTH / 2;
    MAP_PATH_AMPLITUDE = Math.max(72, Math.min(180, (MAP_WIDTH - 70) / 2));
    MAP_NODE_SPACING = Math.max(60, Math.min(90, Math.floor(viewportHeight / 9)));
};

export type MapNodeTint = 'blue' | 'purple' | 'green' | 'gold';

export const NODE_TINT_COLORS: Record<MapNodeTint, number> = {
    blue: 0x3b82f6,
    purple: 0xa855f7,
    green: 0x34d399,
    gold: 0xfbbf24,
};

export interface LevelMapPoint {
    readonly index: number;
    readonly x: number;
    readonly y: number;
    readonly tint: MapNodeTint;
}

export interface LevelMapEntry extends LevelMapPoint {
    readonly id: number;
    readonly name: string;
    readonly chapterName: string;
    readonly state: LevelProgressState;
    readonly stars: number;
}

export interface LevelMapSource {
    readonly id: number;
    readonly name: string;
    readonly chapterName: string;
    readonly chapter?: number;
}

/** Total pixel height of the scrollable map for `count` nodes. */
export const levelMapHeight = (count: number): number => {
    const nodes = Math.max(1, Math.floor(count));

    return MAP_TOP_PAD + (nodes - 1) * MAP_NODE_SPACING + MAP_BOTTOM_PAD;
};

export const mapNodeTint = (index: number, chapter?: number): MapNodeTint => {
    const cycle: readonly MapNodeTint[] = ['blue', 'purple', 'green', 'gold'];
    const page = Math.floor(index / MAP_WAVE_NODES);
    const bucket = (chapter ?? page + 1) - 1;
    return cycle[((bucket % cycle.length) + cycle.length) % cycle.length];
};

/**
 * Snake path: index 0 sits at the bottom; nodes walk upward while the x
 * position rides one full sine cycle every MAP_WAVE_NODES nodes, producing a
 * right/left winding road with identical step spacing.
 */
export const levelMapNodePosition = (
    index: number,
    count: number
): { x: number; y: number } => {
    const nodes = Math.max(1, Math.floor(count));
    const safeIndex = Math.max(0, Math.min(nodes - 1, Math.floor(index)));
    const height = levelMapHeight(nodes);
    const y = height - MAP_BOTTOM_PAD - safeIndex * MAP_NODE_SPACING;
    const phase = (safeIndex / MAP_WAVE_NODES) * Math.PI * 2;
    const x = MAP_PATH_CENTER + MAP_PATH_AMPLITUDE * Math.sin(phase);

    return { x, y };
};

/** Smooth position used by the rendered road between two integer node stops. */
export const levelMapPositionAt = (
    index: number,
    count: number
): { x: number; y: number } => {
    const nodes = Math.max(1, Math.floor(count));
    const safeIndex = Math.max(0, Math.min(nodes - 1, index));
    const height = levelMapHeight(nodes);
    const y = height - MAP_BOTTOM_PAD - safeIndex * MAP_NODE_SPACING;
    const phase = (safeIndex / MAP_WAVE_NODES) * Math.PI * 2;
    const x = MAP_PATH_CENTER + MAP_PATH_AMPLITUDE * Math.sin(phase);

    return { x, y };
};

export const buildLevelMapPath = (count: number): readonly LevelMapPoint[] => {
    const nodes = Math.max(0, Math.floor(count));
    const points: LevelMapPoint[] = [];

    for (let index = 0; index < nodes; index++) {
        const { x, y } = levelMapNodePosition(index, nodes);
        points.push({ index, x, y, tint: mapNodeTint(index) });
    }

    return points;
};

export const buildLevelMap = (
    levels: readonly LevelMapSource[],
    progress: LevelProgressSnapshot
): LevelMapEntry[] => {
    const count = levels.length;
    return levels.map((level, index) => {
        const { x, y } = levelMapNodePosition(index, count);
        return {
            index,
            id: level.id,
            name: level.name,
            chapterName: level.chapterName,
            x,
            y,
            tint: mapNodeTint(index, level.chapter),
            state: resolveLevelProgressState(index, progress),
            stars: resolveLevelStars(index, progress),
        };
    });
};

/**
 * Scroll offset (mapLayer.y) that centres the page of LEVELS_PER_PAGE nodes
 * containing `index` within the map viewport. Pure, so the scene and tests
 * share the same math.
 */
export const levelMapPageScroll = (
    index: number,
    count: number,
    viewTop: number,
    viewBottom: number
): number => {
    const nodes = Math.max(1, Math.floor(count));
    const safeIndex = Math.max(0, Math.min(nodes - 1, Math.floor(index)));
    const page = Math.floor(safeIndex / LEVELS_PER_PAGE);
    const firstOfPage = Math.min(nodes - 1, page * LEVELS_PER_PAGE);
    const lastOfPage = Math.min(nodes - 1, firstOfPage + LEVELS_PER_PAGE - 1);
    const topY = levelMapNodePosition(firstOfPage, nodes).y;
    const bottomY = levelMapNodePosition(lastOfPage, nodes).y;
    const midView = (viewTop + viewBottom) / 2;
    const midBand = (topY + bottomY) / 2;

    return mapScrollBounds(nodes, viewTop, viewBottom).clamp(midView - midBand);
};

/**
 * Scroll offset (mapLayer.y) that puts the exact `index` node's centre at
 * the vertical centre of the visible map viewport. Intentionally
 * unclamped: the first/last levels centre exactly, leaving fixed
 * background beyond the map edge, while drag/wheel scrolling stays
 * clamped by mapScrollBounds. Pure, so scene and tests share the math.
 */
export const levelMapCenterScroll = (
    index: number,
    count: number,
    viewTop: number,
    viewBottom: number
): number => {
    const nodes = Math.max(1, Math.floor(count));
    const safeIndex = Math.max(0, Math.min(nodes - 1, Math.floor(index)));
    const midView = (viewTop + viewBottom) / 2;
    const nodeY = levelMapNodePosition(safeIndex, nodes).y;

    return midView - nodeY;
};

export interface MapScrollBounds {
    readonly min: number;
    readonly max: number;
    readonly clamp: (value: number) => number;
}

/** scroll ∈ [-height + viewBottom, viewTop]: map edges snap to view edges. */
export const mapScrollBounds = (
    count: number,
    viewTop: number,
    viewBottom: number
): MapScrollBounds => {
    const height = levelMapHeight(count);
    const min = Math.min(0, viewBottom - height);
    const max = Math.max(viewTop, 0);

    return {
        min,
        max,
        clamp: (value: number): number => Math.max(min, Math.min(max, value)),
    };
};







