import { COLOR_NAMES, GRID_COLS, GRID_ROWS, type BubbleColorName } from '../../config';
import { LAYOUT_COLOR_TOKENS, LAYOUT_EMPTY } from './colors';
import type { ProgressionLevelDefinition } from './types';

/**
 * Static offset hex-neighbour tables. They match `geometry.neighbourCells` with
 * parity 0 (even rows unshifted, odd rows shifted right) so the generator and
 * its solvability simulation can walk the grid without the geometric math and
 * allocations of the runtime helper on every visit.
 */
const NEIGHBOUR_OFFSETS_EVEN: readonly (readonly [number, number])[] = [
    [-1, -1],
    [-1, 0],
    [0, -1],
    [0, 1],
    [1, -1],
    [1, 0],
];

const NEIGHBOUR_OFFSETS_ODD: readonly (readonly [number, number])[] = [
    [-1, 0],
    [-1, 1],
    [0, -1],
    [0, 1],
    [1, 0],
    [1, 1],
];

const offsetsFor = (row: number): readonly (readonly [number, number])[] =>
    (row & 1) === 0 ? NEIGHBOUR_OFFSETS_EVEN : NEIGHBOUR_OFFSETS_ODD;

/**
 * Random board generator for the fixed progression boards.
 *
 * Contract:
 * - the configured `totalBubbles` count is never changed;
 * - every layout is fully connected to the ceiling and generated exactly once;
 * - the arrangement differs on every attempt (seeded RNG + pattern memory);
 * - colours are placed pseudo-randomly with anti-predictable clustering and
 *   the configured palette is fully preserved;
 * - a layout is only accepted when the solvability simulation clears it
 *   inside the level's shot budget, otherwise it is regenerated.
 */

const COLOR_TOKENS: Record<BubbleColorName, string> = {
    red: 'R',
    orange: 'O',
    yellow: 'Y',
    green: 'G',
    blue: 'B',
    purple: 'P',
};

export type PatternKind =
    | 'zigzag'
    | 'pyramid'
    | 'diamond'
    | 'cluster'
    | 'scattered'
    | 'wave'
    | 'asymmetric'
    | 'mixed'
    | 'geometric';

export interface GeneratedLayout {
    readonly layout: readonly string[];
    readonly pattern: PatternKind;
    readonly seed: number;
    /** Greedy-simulation estimate of the shots needed to clear the board. */
    readonly requiredShots: number;
}

export interface LayoutAnalysis {
    readonly bubbleCount: number;
    readonly connected: boolean;
    readonly allColorsPresent: boolean;
    readonly requiredShots: number;
}

export interface GenerateLayoutOptions {
    /** Force a specific seed (tests and diagnostics). */
    seed?: number;
    /** Max regeneration attempts before the best candidate is used. */
    attempts?: number;
}

interface Cell {
    readonly row: number;
    readonly col: number;
}

type ColorGrid = (BubbleColorName | null)[][];

const mulberry32 = (seed: number): (() => number) => {
    let state = seed >>> 0;

    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
};

const cellKeyOf = (row: number, col: number): string => `${row}:${col}`;

/** Flat numeric id for fast Set lookups in the solvability simulation. */
const cellIdOf = (row: number, col: number): number => row * GRID_COLS + col;

/* ------------------------------------------------------------------ */
/* Pattern archetype weights                                          */
/* ------------------------------------------------------------------ */

type WeightFn = (row: number, col: number, rows: number) => number;

interface ClusterSeed {
    row: number;
    col: number;
    radius: number;
}

interface PatternParams {
    readonly center: number;
    readonly axis: number;
    readonly wave: { readonly frequency: number; readonly phase: number; readonly amplitude: number };
    readonly clusters: ClusterSeed[];
    readonly discs: ClusterSeed[];
    readonly midRow: number;
}

const buildPatternParams = (pattern: PatternKind, rows: number, random: () => number): PatternParams => {
    const params: PatternParams = {
        center: Math.floor(GRID_COLS / 2),
        axis: 1 + Math.floor(random() * (GRID_COLS - 2)),
        wave: {
            frequency: 0.9 + random() * 0.9,
            phase: random() * Math.PI * 2,
            amplitude: 2 + random() * 2,
        },
        clusters: [],
        discs: [],
        midRow: Math.floor(rows / 2),
    };

    if (pattern === 'cluster' || pattern === 'mixed' || pattern === 'geometric') {
        const count = pattern === 'cluster' ? 3 + Math.floor(random() * 4) : 2 + Math.floor(random() * 3);

        for (let index = 0; index < count; index++) {
            params.clusters.push({
                row: 2 + Math.floor(random() * Math.max(1, rows - 4)),
                col: Math.floor(random() * GRID_COLS),
                radius: 1.2 + random() * 2.4,
            });
        }
    }

    if (pattern === 'geometric' || pattern === 'mixed') {
        for (let index = 0; index < 2; index++) {
            params.discs.push({
                row: 2 + Math.floor(random() * Math.max(1, rows - 4)),
                col: Math.floor(random() * GRID_COLS),
                radius: 2 + random() * 2.5,
            });
        }
    }

    return params;
};

const shapeWeight = (pattern: PatternKind, params: PatternParams): WeightFn => {
    const centered = (col: number): number => Math.max(0, 4 - Math.abs(col - params.center));

    switch (pattern) {
        case 'pyramid':
            return (row, col, rows) => {
                const depth = row / Math.max(1, rows - 1);
                return Math.max(0.1, 5 - Math.abs(col - params.center) * 0.9 - depth * 4.2);
            };
        case 'diamond':
            return (row, col) =>
                Math.max(
                    0.1,
                    5.5 - Math.abs(col - params.center) * 0.8 - Math.abs(row - params.midRow) * 0.75
                );
        case 'wave':
            return (row, col) => {
                const offset = Math.sin(params.wave.phase + row * params.wave.frequency) * params.wave.amplitude;
                return Math.max(0.15, 4.5 - Math.abs(col - (params.center + offset)) * 0.65);
            };
        case 'zigzag':
            return (row, col, rows) => {
                const bandRows = Math.max(2, Math.round(rows / 5));
                const wide = Math.floor(row / bandRows) % 2 === 0;
                const sideDist = Math.min(col, GRID_COLS - 1 - col);
                return wide ? 1.5 + sideDist * 1.6 : 1.5 + (params.center - sideDist) * 1.4;
            };
        case 'cluster':
            return (row, col) => {
                let weight = 0.35;

                for (const cluster of params.clusters) {
                    const distance = Math.hypot(row - cluster.row, (col - cluster.col) * 0.85);
                    weight = Math.max(weight, Math.max(0, cluster.radius + 0.9 - distance));
                }

                return weight + centered(col) * 0.25;
            };
        case 'asymmetric':
            return (row, col) =>
                Math.max(0, 4.5 - Math.abs(col - params.axis) * 0.85) + (row % 3 === 0 ? 0.9 : 0.2);
        case 'scattered':
            return () => 1;
        case 'geometric':
            return (row, col) => {
                let weight = 0.3;

                for (const disc of params.discs) {
                    const ring = Math.abs(Math.hypot(row - disc.row, (col - disc.col) * 0.85) - disc.radius);
                    weight = Math.max(weight, Math.max(0, 2.4 - ring * 1.6));
                }

                return weight + centered(col) * 0.3;
            };
        case 'mixed':
        default: {
            // Higher levels combine several archetypes into one arrangement.
            const wave = shapeWeight('wave', params);
            const cluster = shapeWeight('cluster', params);
            const zigzag = shapeWeight('zigzag', params);

            return (row, col, rows) => (wave(row, col, rows) + cluster(row, col, rows) + zigzag(row, col, rows)) / 3;
        }
    }
};

/** Pattern pool per difficulty milestone band 1-8. */
export const patternsForBand = (band: number): readonly PatternKind[] => {
    switch (band) {
        case 1:
            return ['pyramid', 'wave'];
        case 2:
            return ['pyramid', 'wave', 'zigzag'];
        case 3:
            return ['zigzag', 'diamond', 'wave'];
        case 4:
            return ['diamond', 'cluster', 'zigzag'];
        case 5:
            return ['cluster', 'scattered', 'wave', 'diamond'];
        case 6:
            return ['scattered', 'asymmetric', 'cluster', 'geometric'];
        case 7:
            return ['mixed', 'asymmetric', 'scattered', 'geometric'];
        case 8:
        default:
            return ['mixed', 'geometric', 'cluster', 'asymmetric', 'scattered'];
    }
};

/**
 * Levels 2-5 are pinned to the zigzag archetype with a harder colour spread,
 * per the documented opening progression; level 1 stays the friendly intro.
 */
const patternForLevelBump = (levelId: number): PatternKind | null =>
    levelId >= 2 && levelId <= 5 ? 'zigzag' : null;

/** Extra colour difficulty for the designed opening levels 2-5. */
const colorBandFor = (level: ProgressionLevelDefinition): number => {
    const band = level.difficulty ?? 1;
    return level.id >= 2 && level.id <= 5 ? Math.min(8, band + 1) : band;
};

/* ------------------------------------------------------------------ */
/* Occupancy growth                                                   */
/* ------------------------------------------------------------------ */

const buildOccupancy = (
    totalBubbles: number,
    weight: WeightFn,
    random: () => number
): { rows: number; cells: Cell[] } => {
    const rows = Math.min(GRID_ROWS, Math.max(3, Math.ceil(totalBubbles / GRID_COLS) + 4));
    const occupied: boolean[][] = Array.from({ length: rows }, () =>
        new Array<boolean>(GRID_COLS).fill(false)
    );
    const frontier = new Map<string, Cell>();
    const cells: Cell[] = [];
    let count = 0;

    const pushNeighbours = (row: number, col: number): void => {
        for (const [rowOffset, colOffset] of offsetsFor(row)) {
            const nextRow = row + rowOffset;
            const nextCol = col + colOffset;

            if (
                nextRow < 0 ||
                nextRow >= rows ||
                nextCol < 0 ||
                nextCol >= GRID_COLS ||
                occupied[nextRow][nextCol] ||
                frontier.has(cellKeyOf(nextRow, nextCol))
            ) {
                continue;
            }

            frontier.set(cellKeyOf(nextRow, nextCol), { row: nextRow, col: nextCol });
        }
    };

    const addCell = (row: number, col: number): void => {
        if (row < 0 || row >= rows || col < 0 || col >= GRID_COLS || occupied[row][col]) {
            return;
        }

        occupied[row][col] = true;
        count += 1;
        cells.push({ row, col });
        frontier.delete(cellKeyOf(row, col));
        pushNeighbours(row, col);
    };

    // The ceiling row anchors every generated bubble to the board.
    for (let col = 0; col < GRID_COLS; col++) {
        addCell(0, col);
    }

    while (count < totalBubbles) {
        const candidates = [...frontier.values()];

        if (candidates.length === 0) {
            let placed = false;

            for (let row = 0; row < rows && !placed; row++) {
                for (let col = 0; col < GRID_COLS && !placed; col++) {
                    if (!occupied[row][col]) {
                        addCell(row, col);
                        placed = true;
                    }
                }
            }

            if (!placed) {
                // No spare capacity within GRID_ROWS; stop rather than loop.
                break;
            }

            continue;
        }

        const weights = candidates.map(
            (cell) => Math.max(0.05, weight(cell.row, cell.col, rows)) + random() * 0.8
        );
        const totalWeight = weights.reduce((sum, value) => sum + value, 0);
        let roll = random() * totalWeight;
        let chosen = candidates[candidates.length - 1];

        for (let index = 0; index < candidates.length; index++) {
            roll -= weights[index];
            if (roll <= 0) {
                chosen = candidates[index];
                break;
            }
        }

        addCell(chosen.row, chosen.col);
    }

    return { rows, cells };
};

/* ------------------------------------------------------------------ */
/* Colour placement                                                   */
/* ------------------------------------------------------------------ */

const assignColors = (
    cells: readonly Cell[],
    palette: readonly BubbleColorName[],
    band: number,
    random: () => number
): Map<string, BubbleColorName> => {
    const placement = new Map<string, BubbleColorName>();
    const remaining = new Map<BubbleColorName, number>();
    const colorCount = Math.max(1, Math.min(palette.length, COLOR_NAMES.length));

    // Balanced quota: every configured colour is used, spread as evenly as the
    // bubble count allows.
    const base = Math.floor(cells.length / colorCount);
    const extras = cells.length % colorCount;

    palette.slice(0, colorCount).forEach((color, index) => {
        remaining.set(color, base + (index < extras ? 1 : 0));
    });

    // Higher difficulty: shorter same-colour runs and fewer same-colour
    // adjacencies, so matching colours sit further apart.
    const maxRun = Math.max(3, 9 - band);
    const continueChance = Math.max(0.22, 0.62 - band * 0.045);

    let runColor: BubbleColorName | null = null;
    let runLeft = 0;

    for (const cell of cells) {
        let color: BubbleColorName | null = null;

        if (runColor && runLeft > 0 && (remaining.get(runColor) ?? 0) > 0 && random() < continueChance) {
            color = runColor;
            runLeft -= 1;
        } else {
            const options = [...remaining.entries()].filter(
                ([name, count]) => count > 0 && !(name === runColor && random() < 0.45)
            );
            const pool = options.length > 0 ? options : [...remaining.entries()].filter(([, count]) => count > 0);

            if (pool.length > 0) {
                const total = pool.reduce((sum, [, count]) => sum + count, 0);
                let roll = random() * total;

                for (const [name, count] of pool) {
                    roll -= count;
                    if (roll <= 0) {
                        color = name;
                        break;
                    }
                }

                if (!color) {
                    color = pool[pool.length - 1][0];
                }

                // Avoid repeating the previous run colour so matching colours
                // stay strategically separated.
                if (color === runColor && pool.length > 1) {
                    color = pool.find(([name]) => name !== runColor)?.[0] ?? color;
                }
            } else {
                color = runColor ?? palette[0];
            }

            runColor = color;
            runLeft = Math.max(0, 3 + Math.floor(random() * (maxRun - 3 + 1)) - 1);
        }

        remaining.set(color, Math.max(0, (remaining.get(color) ?? 0) - 1));
        placement.set(cellKeyOf(cell.row, cell.col), color);
    }

    return placement;
};

/* ------------------------------------------------------------------ */
/* Solvability analysis                                               */
/* ------------------------------------------------------------------ */

const parseColorGrid = (layout: readonly string[]): ColorGrid =>
    layout.map((rowText) =>
        Array.from({ length: GRID_COLS }, (_, col) => {
            const token = rowText[col] ?? LAYOUT_EMPTY;
            return token === LAYOUT_EMPTY ? null : LAYOUT_COLOR_TOKENS[token] ?? null;
        })
    );

const reachableSet = (grid: ColorGrid): Set<number> => {
    const reached = new Set<number>();
    const stack: Cell[] = [];
    const rows = grid.length;

    for (let col = 0; col < GRID_COLS; col++) {
        if (grid[0]?.[col]) {
            stack.push({ row: 0, col });
        }
    }

    while (stack.length > 0) {
        const current = stack.pop()!;
        const key = cellIdOf(current.row, current.col);

        if (reached.has(key)) {
            continue;
        }

        reached.add(key);

        for (const [rowOffset, colOffset] of offsetsFor(current.row)) {
            const nextRow = current.row + rowOffset;
            const nextCol = current.col + colOffset;

            if (nextRow < 0 || nextRow >= rows || nextCol < 0 || nextCol >= GRID_COLS) {
                continue;
            }

            if (!reached.has(cellIdOf(nextRow, nextCol)) && grid[nextRow][nextCol]) {
                stack.push({ row: nextRow, col: nextCol });
            }
        }
    }

    return reached;
};

interface ActiveCell {
    row: number;
    col: number;
    color: BubbleColorName;
}

const largestSameColorCluster = (
    grid: ColorGrid,
    cells: ActiveCell[]
): ActiveCell[] | null => {
    const visited = new Set<number>();
    let best: ActiveCell[] | null = null;

    // Iterates only the still-standing bubbles instead of the entire grid.
    for (const start of cells) {
        const startKey = cellIdOf(start.row, start.col);

        if (visited.has(startKey)) {
            continue;
        }

        const color = start.color;
        const stack: ActiveCell[] = [start];
        const cluster: ActiveCell[] = [];
        visited.add(startKey);

        while (stack.length > 0) {
            const current = stack.pop()!;
            cluster.push(current);

            for (const [rowOffset, colOffset] of offsetsFor(current.row)) {
                const nextRow = current.row + rowOffset;
                const nextCol = current.col + colOffset;

                if (nextRow < 0 || nextRow >= grid.length || nextCol < 0 || nextCol >= GRID_COLS) {
                    continue;
                }

                const nextKey = cellIdOf(nextRow, nextCol);

                if (!visited.has(nextKey) && grid[nextRow][nextCol] === color) {
                    visited.add(nextKey);
                    stack.push({ row: nextRow, col: nextCol, color });
                }
            }
        }

        if (cluster.length >= 3 && (!best || cluster.length > best.length)) {
            best = cluster;
        }
    }

    return best;
};

/**
 * Simulates clearing the board: each shot removes the largest reachable
 * same-colour cluster plus everything that loses its ceiling anchor. When no
 * cluster of three exists any more, the leftover bubbles need manual cleanup,
 * charged in groups of three (the best a normal shot can guarantee).
 *
 * The simulation tracks only the active bubbles in a flat list, so the cost
 * shrinks as the board clears instead of rescanning the whole grid per shot.
 */
export const analyzeLayout = (
    layout: readonly string[],
    palette: readonly BubbleColorName[]
): LayoutAnalysis => {
    const grid = parseColorGrid(layout);
    let bubbleCount = 0;
    const present = new Set<BubbleColorName>();

    for (const row of grid) {
        for (const color of row) {
            if (color) {
                bubbleCount += 1;
                present.add(color);
            }
        }
    }

    const anchored = reachableSet(grid);
    let connected = true;

    outer: for (let row = 0; row < grid.length; row++) {
        for (let col = 0; col < GRID_COLS; col++) {
            if (grid[row][col] && !anchored.has(cellIdOf(row, col))) {
                connected = false;
                break outer;
            }
        }
    }

    // Mutable working copy plus the flat active list the simulation iterates.
    const working: ColorGrid = grid.map((row) => [...row]);
    let active: ActiveCell[] = [];

    for (let row = 0; row < working.length; row++) {
        for (let col = 0; col < GRID_COLS; col++) {
            const color = working[row][col];

            if (color) {
                active.push({ row, col, color });
            }
        }
    }

    let requiredShots = 0;

    while (active.length > 0) {
        const cluster = largestSameColorCluster(working, active);

        if (!cluster) {
            requiredShots += Math.ceil(active.length / 3);
            break;
        }

        for (const cell of cluster) {
            working[cell.row][cell.col] = null;
        }

        const anchoredAfter = reachableSet(working);

        for (const cell of active) {
            if (!anchoredAfter.has(cellIdOf(cell.row, cell.col))) {
                working[cell.row][cell.col] = null;
            }
        }

        // Rebuild from the active list only; this stays allocation-light since
        // the array shrinks every shot and is reused via reassignment.
        const survivors: ActiveCell[] = [];

        for (const cell of active) {
            const color = working[cell.row][cell.col];

            if (color) {
                cell.color = color;
                survivors.push(cell);
            }
        }

        active = survivors;
        requiredShots += 1;

        if (requiredShots > 5000) {
            break;
        }
    }

    return {
        bubbleCount,
        connected,
        allColorsPresent: palette.every((color) => present.has(color)),
        requiredShots,
    };
};

/* ------------------------------------------------------------------ */
/* Seed, attempt assembly and generation loop                        */
/* ------------------------------------------------------------------ */

const randomSeed = (): number => {
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        const buffer = new Uint32Array(1);
        crypto.getRandomValues(buffer);
        return buffer[0] >>> 0;
    }

    return (Math.random() * 0x1_0000_0000) >>> 0;
};

interface Attempt {
    readonly layout: string[];
    readonly pattern: PatternKind;
    readonly seed: number;
    readonly analysis: LayoutAnalysis;
}

const buildAttempt = (
    level: ProgressionLevelDefinition,
    pattern: PatternKind,
    seed: number,
    colorBand: number = level.difficulty ?? 1
): Attempt => {
    const random = mulberry32(seed);
    const rows = Math.min(GRID_ROWS, Math.ceil(level.totalBubbles / GRID_COLS) + 4);
    const weight = shapeWeight(pattern, buildPatternParams(pattern, rows, random));
    const occupancy = buildOccupancy(level.totalBubbles, weight, random);
    const placement = assignColors(occupancy.cells, level.colors, colorBand, random);

    const layout = Array.from({ length: occupancy.rows }, (_, row) =>
        Array.from({ length: GRID_COLS }, (_, col) => {
            const color = placement.get(cellKeyOf(row, col));
            return color ? COLOR_TOKENS[color] : LAYOUT_EMPTY;
        }).join('')
    );

    // Trailing empty rows are dropped so scrolling never covers fake depth.
    while (layout.length > 1 && !layout[layout.length - 1].replace(/\./g, '')) {
        layout.pop();
    }

    const analysis = analyzeLayout(layout, level.colors);

    return { layout, pattern, seed, analysis };
};

interface RecentRecord {
    readonly pattern: PatternKind;
    readonly seeds: readonly number[];
}

const recentByLevel = new Map<number, RecentRecord>();

/** Test hook: forget every recorded attempt. */
export const resetRecentLayouts = (): void => {
    recentByLevel.clear();
};

/**
 * Generates a fresh random arrangement for the level. Invalid or unsolvable
 * attempts are rejected and regenerated; the most recent pattern/seed per level
 * is skipped when alternatives exist. The configured bubble count never changes.
 */
export const generateLevelLayout = (
    level: ProgressionLevelDefinition,
    options: GenerateLayoutOptions = {}
): GeneratedLayout => {
    // Large boards validate much more slowly, so their attempt ladder is
    // shorter; the fail-safe keeps any level playable either way.
    const defaultAttempts =
        level.totalBubbles >= 1000 ? 10 : level.totalBubbles >= 600 ? 14 : 24;
    const attempts = Math.max(1, options.attempts ?? defaultAttempts);
    const previous = recentByLevel.get(level.id);
    const pinnedPattern = patternForLevelBump(level.id);
    const pool = pinnedPattern ? [pinnedPattern] : patternsForBand(level.difficulty ?? 1);
    // Never reuse the immediately previous pattern when alternatives exist.
    const patternPool = previous && !pinnedPattern
        ? pool.filter((entry) => entry !== previous.pattern)
        : [...pool];
    const patterns = patternPool.length > 0 ? patternPool : [...pool];

    let best: Attempt | null = null;

    for (let attempt = 0; attempt < attempts; attempt++) {
        // A forced seed stays deterministic but every attempt still gets a
        // different seed, so a rejected attempt never loops on one layout.
        const forced = options.seed;
        const seed = forced !== undefined ? (forced + attempt * 7919) >>> 0 : randomSeed();
        const pattern = patterns[Math.floor(Math.random() * patterns.length)];
        const colorBand = colorBandFor(level);
        const candidate = buildAttempt(level, pattern, seed, colorBand);

        if (
            candidate.analysis.bubbleCount === level.totalBubbles &&
            candidate.analysis.connected &&
            candidate.analysis.allColorsPresent &&
            candidate.analysis.requiredShots <= level.totalShots &&
            !(previous?.seeds ?? []).includes(seed)
        ) {
            recentByLevel.set(level.id, { pattern, seeds: [...(previous?.seeds ?? []).slice(-7), seed] });
            return {
                layout: candidate.layout,
                pattern,
                seed,
                requiredShots: candidate.analysis.requiredShots,
            };
        }

        if (candidate.analysis.bubbleCount !== level.totalBubbles) {
            continue;
        }

        const better =
            !best ||
            (candidate.analysis.connected && !best.analysis.connected) ||
            (candidate.analysis.connected === best.analysis.connected &&
                candidate.analysis.requiredShots < best.analysis.requiredShots);

        if (better) {
            best = candidate;
        }
    }

    // Fail safe: play the closest valid attempt instead of blocking the level.
    const fallback =
        best ??
        buildAttempt(level, patterns[0], randomSeed(), colorBandFor(level));

    if (
        fallback.analysis.bubbleCount === level.totalBubbles &&
        fallback.analysis.connected &&
        fallback.analysis.allColorsPresent
    ) {
        const id = fallback.seed;
        recentByLevel.set(level.id, {
            pattern: fallback.pattern,
            seeds: [...(recentByLevel.get(level.id)?.seeds ?? []).slice(-7), id],
        });
    }

    return {
        layout: fallback.layout,
        pattern: fallback.pattern,
        seed: fallback.seed,
        requiredShots: fallback.analysis.requiredShots,
    };
};
