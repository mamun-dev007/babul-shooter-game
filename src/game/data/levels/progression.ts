import { COLOR_NAMES, GRID_COLS, GRID_ROWS, type BubbleColorName } from '../../config';
import { neighbourCells } from '../../systems/geometry';
import { LAYOUT_COLOR_TOKENS, LAYOUT_EMPTY } from './colors';
import type { LevelDefinition, ProgressionLevelDefinition } from './types';

/**
 * Deterministic 1000-level progression builder.
 *
 * The hand-authored chapter files still provide the chapter/level names and
 * descriptions, but every balance number is rebuilt here:
 *
 * - `totalBubbles` follows a strictly increasing curve from 50 to 1500;
 * - the runtime board layout itself is generated fresh per attempt by
 *   `randomLayout.ts` using patterns, colours, seeds and a solvability check;
 * - `totalShots` scales with bubble count, palette size and difficulty band;
 * - star limits are 50% / 75% / 100% of the shot budget, stored per level;
 * - boards are fixed after generation: no drops, no respawns.
 */

const TOTAL_LEVELS = 1000;

/**
 * Bubble-count anchors. Progression interpolates linearly between them, so the
 * curve is smooth and every level is strictly harder (more bubbles) than the
 * level before it.
 */
const BUBBLE_ANCHORS: readonly (readonly [number, number])[] = [
    [1, 50],
    [5, 70],
    [10, 95],
    [20, 130],
    [50, 220],
    [100, 350],
    [200, 500],
    [300, 650],
    [500, 850],
    [700, 1100],
    [1000, 1500],
];

const clampInt = (value: number, min: number, max: number): number =>
    Math.max(min, Math.min(max, Math.floor(value)));

const levelProgress = (level: number): number =>
    Math.max(0, Math.min(1, (level - 1) / (TOTAL_LEVELS - 1)));

const MAX_LAYOUT_ROWS = GRID_ROWS;

/** Bubble count grows smoothly and strictly from 50 at level 1 to 1500 at level 1000. */
export const totalBubblesForLevel = (level: number): number => {
    const safeLevel = clampInt(level, 1, TOTAL_LEVELS);

    if (safeLevel === BUBBLE_ANCHORS[0][0]) {
        return BUBBLE_ANCHORS[0][1];
    }

    if (safeLevel >= BUBBLE_ANCHORS[BUBBLE_ANCHORS.length - 1][0]) {
        return BUBBLE_ANCHORS[BUBBLE_ANCHORS.length - 1][1];
    }

    let lower = BUBBLE_ANCHORS[0];
    let upper = BUBBLE_ANCHORS[1];

    for (let index = 1; index < BUBBLE_ANCHORS.length; index++) {
        if (safeLevel <= BUBBLE_ANCHORS[index][0]) {
            lower = BUBBLE_ANCHORS[index - 1];
            upper = BUBBLE_ANCHORS[index];
            break;
        }
    }

    const span = upper[0] - lower[0];
    const t = span > 0 ? (safeLevel - lower[0]) / span : 1;
    return Math.round(lower[1] + (upper[1] - lower[1]) * t);
};

/** Colour variety grows in five deliberate bands (unchanged palettes). */
export const colorCountForLevel = (level: number): number => {
    const safeLevel = clampInt(level, 1, TOTAL_LEVELS);

    if (safeLevel <= 20) return 2;
    if (safeLevel <= 100) return 3;
    if (safeLevel <= 300) return 4;
    if (safeLevel <= 600) return 5;
    return 6;
};

/**
 * Difficulty milestones:
 * 1-50 Beginner, 51-100 Normal, 101-200 Medium, 201-300 Hard,
 * 301-500 Very Hard, 501-700 Extreme, 701-900 Expert, 901-1000 Insane.
 */
export const difficultyBandForLevel = (level: number): 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 => {
    const safeLevel = clampInt(level, 1, TOTAL_LEVELS);

    if (safeLevel <= 50) return 1;
    if (safeLevel <= 100) return 2;
    if (safeLevel <= 200) return 3;
    if (safeLevel <= 300) return 4;
    if (safeLevel <= 500) return 5;
    if (safeLevel <= 700) return 6;
    if (safeLevel <= 900) return 7;
    return 8;
};

export const difficultyLabelForLevel = (level: number): string =>
    [
        'Normal',
        'Medium',
        'Hard',
        'Very Hard',
        'Extreme Hard',
        'Very Extreme',
        'Expert',
        'Insane',
    ][difficultyBandForLevel(level) - 1] ?? 'Insane';

const paletteForLevel = (level: number): readonly BubbleColorName[] => {
    const count = colorCountForLevel(level);
    const offset = ((level - 1) * 2) % COLOR_NAMES.length;
    const palette: BubbleColorName[] = [];

    for (let step = 0; step < count; step++) {
        palette.push(COLOR_NAMES[(offset + step) % COLOR_NAMES.length]);
    }

    return palette;
};

const tokenFor = (color: BubbleColorName): string =>
    Object.entries(LAYOUT_COLOR_TOKENS).find(([, value]) => value === color)?.[0] ?? 'R';

/** Stable PRNG so every level always builds the same board. */
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

interface Cell {
    readonly row: number;
    readonly col: number;
}

const cellKey = (row: number, col: number): string => `${row}:${col}`;

/**
 * Selects the next cell from the connected frontier. Early bands fill rows in
 * order (beginner-friendly solid faces); later bands pick weighted frontier
 * cells to create arches, pyramids, checkerboards and scattered fortresses.
 */
const chooseFrontierCell = (
    frontier: readonly Cell[],
    band: number,
    level: number,
    random: () => number
): Cell => {
    if (band <= 1) {
        return [...frontier].sort((left, right) =>
            left.row === right.row ? left.col - right.col : left.row - right.row
        )[0];
    }

    if (band === 2 && random() < 0.55) {
        return [...frontier].sort((left, right) =>
            left.row === right.row ? left.col - right.col : left.row - right.row
        )[0];
    }

    const pattern = Math.floor((level - 1) / 10) % 5;
    const weights = frontier.map((cell) => {
        let weight = 1;

        switch (pattern) {
            case 0:
                weight += Math.max(0.25, 3 - Math.abs(cell.col - 5) * 0.45);
                break;
            case 1:
                weight += Math.abs(cell.col - 5) * 0.45;
                break;
            case 2:
                weight += (cell.row + cell.col) % 2 === 0 ? 1.8 : 0.35;
                break;
            case 3:
                weight += cell.col % 3 === 0 ? 2.2 : 0.4;
                break;
            default:
                weight += random() * 2.5;
                break;
        }

        return weight + random() * 1.2;
    });

    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    let roll = random() * totalWeight;

    for (let index = 0; index < frontier.length; index++) {
        roll -= weights[index];
        if (roll <= 0) {
            return frontier[index];
        }
    }

    return frontier[frontier.length - 1];
};

const buildLayout = (
    level: number,
    totalBubbles: number,
    palette: readonly BubbleColorName[]
): string[] => {
    const band = difficultyBandForLevel(level);
    const random = mulberry32(level * 0x9e3779b1 + 0x51ed270b);
    const rowsNeeded = Math.min(
        MAX_LAYOUT_ROWS,
        Math.max(3, Math.ceil(totalBubbles / GRID_COLS) + 3)
    );
    const occupied: boolean[][] = Array.from({ length: rowsNeeded }, () =>
        Array.from({ length: GRID_COLS }, () => false)
    );
    const frontier = new Map<string, Cell>();
    let count = 0;

    const pushNeighbours = (row: number, col: number): void => {
        for (const neighbour of neighbourCells(row, col, 0)) {
            if (
                neighbour.row >= rowsNeeded ||
                occupied[neighbour.row][neighbour.col] ||
                frontier.has(cellKey(neighbour.row, neighbour.col))
            ) {
                continue;
            }

            frontier.set(cellKey(neighbour.row, neighbour.col), neighbour);
        }
    };

    const addCell = (row: number, col: number): void => {
        if (row < 0 || row >= rowsNeeded || col < 0 || col >= GRID_COLS) {
            return;
        }

        if (occupied[row][col]) {
            return;
        }

        occupied[row][col] = true;
        count += 1;
        frontier.delete(cellKey(row, col));
        pushNeighbours(row, col);
    };

    // The ceiling row is the anchor: every generated bubble connects to it.
    for (let col = 0; col < GRID_COLS; col++) {
        addCell(0, col);
    }

    while (count < totalBubbles) {
        const candidates = [...frontier.values()];

        if (candidates.length === 0) {
            // This should be unreachable because rowsNeeded always leaves spare
            // capacity, but fall back to the first free connected cell so the
            // builder can never loop forever.
            let placed = false;

            for (let row = 0; row < rowsNeeded && !placed; row++) {
                for (let col = 0; col < GRID_COLS && !placed; col++) {
                    if (!occupied[row][col]) {
                        addCell(row, col);
                        placed = true;
                    }
                }
            }

            if (!placed) {
                break;
            }

            continue;
        }

        const next = chooseFrontierCell(candidates, band, level, random);
        addCell(next.row, next.col);
    }

    const colorGrid: (BubbleColorName | null)[][] = Array.from(
        { length: rowsNeeded },
        () => Array.from({ length: GRID_COLS }, () => null)
    );
    const occupiedCells: Cell[] = [];

    for (let row = 0; row < rowsNeeded; row++) {
        for (let col = 0; col < GRID_COLS; col++) {
            if (occupied[row][col]) {
                occupiedCells.push({ row, col });
            }
        }
    }

    for (const cell of occupiedCells) {
        if (band <= 1) {
            // Wide colour bands make the opening levels readable and poppable.
            const colorIndex =
                (Math.floor(cell.row / 2) + Math.floor(cell.col / 4)) % palette.length;
            colorGrid[cell.row][cell.col] = palette[colorIndex];
            continue;
        }

        const neighbourColors: BubbleColorName[] = [];

        for (const neighbour of neighbourCells(cell.row, cell.col, 0)) {
            const color = colorGrid[neighbour.row]?.[neighbour.col];
            if (color) {
                neighbourColors.push(color);
            }
        }

        colorGrid[cell.row][cell.col] =
            neighbourColors.length > 0 && random() < 0.58
                ? neighbourColors[Math.floor(random() * neighbourColors.length)]
                : palette[Math.floor(random() * palette.length)];
    }

    // Every declared colour must appear in the layout.
    const used = new Set(
        occupiedCells
            .map((cell) => colorGrid[cell.row][cell.col])
            .filter((color): color is BubbleColorName => color !== null)
    );
    const missing = palette.filter((color) => !used.has(color));

    missing.forEach((color, index) => {
        const target = occupiedCells[Math.max(0, occupiedCells.length - 1 - index * 3)];
        if (target) {
            colorGrid[target.row][target.col] = color;
        }
    });

    const layout = Array.from({ length: rowsNeeded }, (_, row) =>
        Array.from({ length: GRID_COLS }, (_, col) => {
            const color = colorGrid[row][col];
            return color ? tokenFor(color) : LAYOUT_EMPTY;
        }).join('')
    );

    // Remove trailing empty rows so the board's scroll height is honest.
    while (layout.length > 1 && !layout[layout.length - 1].replace(/\./g, '')) {
        layout.pop();
    }

    const actual = layout.join('').split('').filter((token) => token !== LAYOUT_EMPTY).length;

    if (actual !== totalBubbles) {
        throw new Error(
            `Progression level ${level} generated ${actual} bubbles; expected ${totalBubbles}.`
        );
    }

    return layout;
};

/**
 * Shot budgets tighten as the milestone band rises: the clear rate expected
 * from each shot goes down while the palette and the arrangement complexity go
 * up. A small allowance on top keeps every randomly generated layout solvable
 * within the budget (the generator validates this before play). This catalog
 * value is the *ceiling*; the runtime budget per attempt is derived from the
 * actual generated puzzle by `attemptShotBudgetFor` below.
 */
export const totalShotsForLevel = (level: number, totalBubbles: number): number => {
    const safeLevel = clampInt(level, 1, TOTAL_LEVELS);
    const band = difficultyBandForLevel(safeLevel);
    const clearRate = 3.5 - band * 0.11;
    const base = Math.ceil(totalBubbles / clearRate);
    const allowance = 1.18 - levelProgress(safeLevel) * 0.14;

    return Math.max(10, Math.ceil(base * allowance));
};

/**
 * Bounds of the mistake allowance an attempt budget may add on top of the
 * verified shot requirement. Level 1 keeps 85% headroom (easy), and the
 * allowance shrinks steadily to ~23% at level 1000 (accuracy demanded).
 */
export const attemptAllowanceForLevel = (level: number): number =>
    0.85 - levelProgress(clampInt(level, 1, TOTAL_LEVELS)) * 0.62;

/**
 * Algorithmic per-attempt shot budget.
 *
 * Input is the shot requirement of the *actually generated* board, as measured
 * by the solvability simulation (`randomLayout.analyzeLayout`). The budget is
 * requirement + allowance, so:
 * - it is never smaller than what the verified-solvable puzzle needs;
 * - it is never inflated beyond the catalog ceiling (`level.totalShots`);
 * - the relative headroom shrinks every level, forcing better accuracy.
 */
export const attemptShotBudgetFor = (
    levelId: number,
    totalShots: number,
    requiredShots: number
): number => {
    const required = Math.max(1, Math.ceil(Number(requiredShots) || 1));
    const ceiling = Math.max(3, Math.floor(totalShots));
    const tolerance = Math.max(2, Math.ceil(required * attemptAllowanceForLevel(levelId)));
    return Math.max(required + 2, Math.min(ceiling, required + tolerance));
};

export const starLimitsForShots = (
    totalShots: number
): { threeStarLimit: number; twoStarLimit: number; oneStarLimit: number } => {
    const total = Math.max(3, Math.floor(totalShots));
    // 1-50% = 3 stars, 50-75% = 2 stars, 75-100% = 1 star. The clamps keep the
    // three limits strictly ascending even for a tiny budget.
    const threeStarLimit = Math.max(1, Math.min(total - 2, Math.ceil(total * 0.5)));
    const twoStarLimit = Math.max(
        threeStarLimit + 1,
        Math.min(total - 1, Math.ceil(total * 0.75))
    );
    const oneStarLimit = Math.max(twoStarLimit + 1, total);

    return { threeStarLimit, twoStarLimit, oneStarLimit };
};

const buildProgressionLevel = (
    base: LevelDefinition,
    levelIndex: number,
    previousShots: number
): ProgressionLevelDefinition => {
    const level = levelIndex + 1;
    const totalBubbles = totalBubblesForLevel(level);
    const palette = paletteForLevel(level);
    const layout = buildLayout(level, totalBubbles, palette);
    // Budgets never shrink between levels so a harder board is never also a
    // looser one.
    const totalShots = Math.max(previousShots, totalShotsForLevel(level, totalBubbles));
    const { threeStarLimit, twoStarLimit, oneStarLimit } = starLimitsForShots(totalShots);

    return Object.freeze({
        id: level,
        chapter: base.chapter,
        chapterName: base.chapterName,
        name: base.name,
        description: `${base.description} Clear all ${totalBubbles} bubbles in ${totalShots} shots.`,
        layout: Object.freeze([...layout]),
        colors: Object.freeze([...palette]),
        maxShots: totalShots,
        shotsPerDrop: 0,
        objective: Object.freeze({ type: 'clear-board' as const }),
        starThresholds: Object.freeze([threeStarLimit, twoStarLimit, oneStarLimit]) as unknown as readonly [
            number,
            number,
            number,
        ],
        playtested: false,
        difficulty: difficultyBandForLevel(level),
        balanceNotes:
            'Fixed board with random per-attempt layouts validated for solvability; automated structural checks only.',
        totalBubbles,
        totalShots,
        threeStarLimit,
        twoStarLimit,
        oneStarLimit,
        fixedBoard: true,
        dangerEnabled: false,
    });
};

/**
 * Rebuilds every chapter from its metadata. The returned chapters keep the
 * existing 100 × 10 shape so the level map and selection UI need no changes.
 */
export function buildProgressionChapters(
    baseChapters: readonly (readonly LevelDefinition[])[]
): readonly (readonly ProgressionLevelDefinition[])[] {
    let levelIndex = 0;
    let previousShots = 0;

    return baseChapters.map((baseLevels) => {
        const levels = baseLevels.map((base) => {
            const built = buildProgressionLevel(base, levelIndex++, previousShots);
            previousShots = built.totalShots;
            return built;
        });
        return Object.freeze(levels);
    });
}
