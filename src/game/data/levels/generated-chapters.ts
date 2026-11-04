import type { BubbleColorName } from '../../config';
import { COLOR_NAMES } from '../../config';
import { LAYOUT_COLOR_TOKENS, LAYOUT_EMPTY } from './colors';
import { calculateRequiredShots, SMART_SHOT_ALLOWANCE } from './shotAnalysis';
import { neighbourCells } from '../../systems/geometry';
import { defineChapter } from './defineChapter';
import type { ChapterDefinition, LevelDefinition } from './types';

/**
 * Procedural chapters 11-100 (900 levels).
 *
 * Design rules shared with the hand-authored first ten chapters:
 * - 13-character rows, tokens from LAYOUT_COLOR_TOKENS, '.' for empty.
 * - The ceiling row anchors the board and every bubble connects to it.
 * - Score targets sized from the deterministic smart-shot analysis so the
 *   validator's shot-economy checks pass without inflating the objective.
 * - Every layout is seeded: the same chapter/level always builds the same
 *   board, both in-game and in validation.
 */

const GRID_WIDTH = 13;
/** Rows + floor(maxShots / shotsPerDrop) must stay <= 15 to clear drop pressure. */
const MAX_TOTAL_DROP_ROWS = 15;
const MAX_SHOTS_PER_DROP = 8;

const MINERALS = [
    'Amethyst',
    'Sapphire',
    'Emerald',
    'Citrine',
    'Garnet',
    'Jadeite',
    'Lapis',
    'Malachite',
    'Tourmaline',
] as const;

const PLACES = [
    'Peaks',
    'Shoals',
    'Grove',
    'Chasm',
    'Mesa',
    'Fjord',
    'Dunes',
    'Marsh',
    'Ridgeline',
    'Hollow',
] as const;

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'] as const;

const PATTERN_DESCRIPTIONS = [
    'Two edge bites open flanking lanes into a wide rampart.',
    'A checkerboard turns every clearance into cascading parlays.',
    'One slanted ridge asks for bank shots as the face marches sideways.',
    'Twin towers flank a narrow bridge, so collapse the span under them.',
    'A pyramid guards its spire, so shave the shoulders first.',
    'An inverted arch leaves the shoulders wide and the core hollow.',
    'Open vertical gutters split the face into striped columns.',
    'A diagonal band twists across the face in a calm S-curve.',
    'Scattered buoys float below two solid anchor rows.',
    'A solid core hides behind two tall window notches.',
];

/** Deterministic PRNG so every generated layout stays stable forever. */
const mulberry32 = (seed: number): (() => number) => {
    let state = seed >>> 0;

    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};

/* ------------------------------------------------------------------ */
/* Shape masks                                                         */
/* ------------------------------------------------------------------ */

interface ShapeContext {
    readonly random: () => number;
    readonly rows: number;
}

type MaskFn = (context: ShapeContext) => boolean[][];

const fullMask = (rows: number): boolean[][] =>
    Array.from({ length: rows }, () => Array.from({ length: GRID_WIDTH }, () => true));

/** Keeps only the `span` centre columns of `row`. */
const spanRow = (mask: boolean[][], row: number, span: number): void => {
    const pad = Math.floor((GRID_WIDTH - span) / 2);
    const safeSpan = Math.max(1, span);

    for (let col = 0; col < GRID_WIDTH; col++) {
        mask[row][col] = col >= pad && col < pad + safeSpan;
    }
};

const MASK_PATTERNS: readonly MaskFn[] = [
    // 0. Solid rampart with symmetric edge bites.
    ({ random, rows }) => {
        const mask = fullMask(rows);

        for (let row = 2; row < rows; row++) {
            const bite = 1 + Math.floor(random() * 3);
            mask[row][bite] = false;
            mask[row][GRID_WIDTH - 1 - bite] = false;
        }

        return mask;
    },

    // 1. Checkerboard: every shot opens a matching lane.
    ({ rows }) =>
        fullMask(rows).map((rowMask, row) => {
            for (let col = row % 2; col < GRID_WIDTH; col += 2) {
                rowMask[col] = false;
            }

            return rowMask;
        }),

    // 2. Slanted ridge: the occupied face marches sideways per row.
    ({ random, rows }) => {
        const mask = fullMask(rows);
        const direction = random() > 0.5 ? 1 : -1;

        for (let row = 1; row < rows; row++) {
            const span = 7;
            const start = Math.max(
                0,
                Math.min(GRID_WIDTH - span, 1 + row * direction)
            );

            for (let col = 0; col < GRID_WIDTH; col++) {
                mask[row][col] = col >= start && col < start + span;
            }
        }

        spanRow(mask, 0, GRID_WIDTH);
        return mask;
    },

    // 3. Twin towers with a connected bridge row.
    ({ random, rows }) => {
        const mask = fullMask(rows);
        const gap = 1 + Math.floor(random() * 3);

        for (let row = 1; row < rows; row++) {
            for (let col = 0; col < GRID_WIDTH; col++) {
                mask[row][col] = col < gap || col >= GRID_WIDTH - gap;
            }
        }

        // A wide bridge row keeps both towers re-anchored.
        const bridge = Math.min(2, rows - 1);

        for (let col = 0; col < GRID_WIDTH; col++) {
            mask[bridge][col] = col <= 5 || col >= 7;
        }

        return mask;
    },

    // 4. Pyramid shrinking to a spire.
    ({ rows }) => {
        const mask = fullMask(rows);

        for (let row = 1; row < rows; row++) {
            spanRow(mask, row, GRID_WIDTH - 2 * row);
        }

        return mask;
    },

    // 5. Inverted arch: wide shoulders with a hollowed core.
    ({ rows }) => {
        const mask = fullMask(rows);

        for (let row = 1; row < rows; row++) {
            const coreSpan = Math.max(1, GRID_WIDTH - 4 - 2 * row);

            for (let col = 0; col < GRID_WIDTH; col++) {
                const shoulder = col <= 2 || col >= GRID_WIDTH - 3;
                const pad = Math.floor((GRID_WIDTH - coreSpan) / 2);
                const core = col >= pad && col < pad + coreSpan;

                mask[row][col] = shoulder || core;
            }
        }

        return mask;
    },

    // 6. Striped columns of varying width.
    ({ random, rows }) => {
        const mask = fullMask(rows);
        let col = Math.floor(random() * 3);

        while (col < GRID_WIDTH) {
            const width = 1 + Math.floor(random() * 2);

            for (let row = 1; row < rows; row++) {
                mask[row][col] = false;
            }

            col += width + 3;
        }

        return mask;
    },

    // 7. Diagonal band: a soft S-curve across the face.
    ({ rows }) => {
        const mask = fullMask(rows);
        const half = Math.max(1, Math.floor(rows / 2) - 1);

        for (let row = 1; row < rows; row++) {
            const centreColumn = Math.round(
                GRID_WIDTH / 2 + (GRID_WIDTH / 2 - 1 - half) * Math.sin((row / rows) * Math.PI * 2)
            );

            for (let col = 0; col < GRID_WIDTH; col++) {
                mask[row][col] = Math.abs(col - centreColumn) <= half;
            }
        }

        return mask;
    },

    // 8. Buoy clusters: sparse drops below two solid rows.
    ({ random, rows }) => {
        const mask = fullMask(rows);

        for (let row = 2; row < rows; row++) {
            for (let col = 0; col < GRID_WIDTH; col++) {
                mask[row][col] = random() > 0.45;
            }
        }

        return mask;
    },

    // 9. Starpoint: solid core with two tall notches.
    ({ random, rows }) => {
        const mask = fullMask(rows);
        const notch = 2 + Math.floor(random() * 5);

        for (let row = 1; row < rows; row++) {
            mask[row][notch] = false;
            mask[row][GRID_WIDTH - 1 - notch] = false;
        }

        return mask;
    },
];

/* ------------------------------------------------------------------ */
/* Mask cleanup + colour assignment                                    */
/* ------------------------------------------------------------------ */

/** Removes cells that are not connected to the ceiling row, repeatedly. */
const dropFloatingCells = (mask: boolean[][]): void => {
    let changed = true;

    while (changed) {
        changed = false;
        const connected = new Set<string>();
        const queue: [number, number][] = [];

        for (let col = 0; col < GRID_WIDTH; col++) {
            if (mask[0]?.[col]) {
                queue.push([0, col]);
                connected.add(`0:${col}`);
            }
        }

        while (queue.length > 0) {
            const [row, col] = queue.shift() as [number, number];

            for (const next of neighbourCells(row, col, 0)) {
                const key = `${next.row}:${next.col}`;

                if (mask[next.row]?.[next.col] && !connected.has(key)) {
                    connected.add(key);
                    queue.push([next.row, next.col]);
                }
            }
        }

        for (let row = 0; row < mask.length; row++) {
            for (let col = 0; col < GRID_WIDTH; col++) {
                if (mask[row][col] && !connected.has(`${row}:${col}`)) {
                    mask[row][col] = false;
                    changed = true;
                }
            }
        }
    }
};

const tokenFor = (color: BubbleColorName): string => {
    const token = Object.entries(LAYOUT_COLOR_TOKENS).find(([, value]) => value === color)?.[0];
    return token ?? 'R';
};

/** Rows of layout strings; every declared colour is guaranteed to appear. */
const maskToRows = (mask: boolean[][], palette: readonly BubbleColorName[], random: () => number): string[] => {
    const rows = mask.map((rowMask, row) =>
        rowMask.map((filled, col) => {
            if (!filled) {
                return LAYOUT_EMPTY;
            }

            // Bias toward the colour above/behind so clusters stay poppable.
            const roll = row + (col % 2 === 0 ? 0 : 1) + Math.floor(random() * 3);

            return tokenFor(palette[roll % palette.length]);
        }).join('')
    );

    const used = new Set<string>();
    rows.forEach((rowText) => [...rowText].forEach((token) => used.add(token)));

    const tokens = palette.map(tokenFor);
    const missing = tokens.filter((token) => !used.has(token));

    if (missing.length === 0) {
        return rows;
    }

    // Replace leading bubbles until each declared colour shows up.
    return rows.map((rowText) => {
        const stillMissing = tokens.filter((token) => !used.has(token));

        if (stillMissing.length === 0) {
            return rowText;
        }

        const chars = [...rowText];
        let replaced = 0;

        for (let col = 0; col < chars.length && replaced < stillMissing.length; col++) {
            if (chars[col] === LAYOUT_EMPTY) {
                continue;
            }

            const token = stillMissing[replaced];
            chars[col] = token;
            used.add(token);
            replaced += 1;
        }

        return chars.join('');
    });
};

/* ------------------------------------------------------------------ */
/* Level construction                                                  */
/* ------------------------------------------------------------------ */

const tierOf = (chapter: number): number => Math.min(3, Math.floor((chapter - 11) / 25));

const paletteForChapter = (chapter: number): readonly BubbleColorName[] => {
    const tier = tierOf(chapter);
    const count = Math.min(COLOR_NAMES.length, 2 + tier);
    const offset = ((chapter - 11) * 2) % COLOR_NAMES.length;
    const palette: BubbleColorName[] = [];

    for (let step = 0; step < count; step++) {
        palette.push(COLOR_NAMES[(offset + step) % COLOR_NAMES.length]);
    }

    if (new Set(palette).size < 2) {
        palette[1] = COLOR_NAMES[(offset + 1) % COLOR_NAMES.length];
    }

    return palette;
};

const chapterNameFor = (chapter: number): string => {
    const offset = chapter - 11;
    const mineral = MINERALS[offset % MINERALS.length];
    const place = PLACES[Math.floor(offset / MINERALS.length) % PLACES.length];

    return `${mineral} ${place}`;
};

const buildLevel = (chapter: number, slot: number, levelIndex: number): LevelDefinition => {
    const tier = tierOf(chapter);
    const random = mulberry32(chapter * 1009 + slot * 131 + 0x9e37);
    const palette = paletteForChapter(chapter);
    const shapeIndex = (chapter * 7 + slot * 3) % MASK_PATTERNS.length;
    const rows = 4 + Math.min(3, Math.floor(random() * (tier + 1)) + Math.floor(tier / 2));

    const mask = MASK_PATTERNS[shapeIndex]({ random, rows });
    dropFloatingCells(mask);

    // Guarantee at least the ceiling row survived cleanup.
    if (!mask[0].some((filled) => filled)) {
        for (let col = 0; col < GRID_WIDTH; col++) {
            mask[0][col] = true;
        }
    }

    const layout = maskToRows(mask, palette, random);
    const cellCount = layout.join('').split('').filter((token) => token !== LAYOUT_EMPTY).length;

    const probe = {
        id: levelIndex + 1,
        name: 'probe',
        description: 'probe',
        layout,
        colors: [...palette],
        maxShots: 1,
        shotsPerDrop: 1,
        objective: { type: 'score' as const, targetScore: 1 },
        starThresholds: [1, 2, 3],
        playtested: false,
    };
    const analysis = calculateRequiredShots(probe as unknown as LevelDefinition);

    // Keep rows + floor(maxShots / shotsPerDrop) inside the drop-pressure budget.
    const shotsPerDrop = tier >= 2 ? 7 : MAX_SHOTS_PER_DROP;
    const dropSafeCap = (MAX_TOTAL_DROP_ROWS + 1 - rows) * shotsPerDrop - 1;
    const maxShots = Math.max(
        2,
        Math.min(analysis.estimatedRequiredShots + SMART_SHOT_ALLOWANCE + tier, dropSafeCap)
    );

    // Targets sit well inside the validator's combo and capacity ceilings.
    const targetScale = [7, 9, 11, 13][tier];
    const capacityTarget = Math.floor((cellCount + maxShots) * 9);
    const targetScore = Math.max(1, Math.min(maxShots * targetScale, capacityTarget));
    const secondStar = Math.max(targetScore + 10, Math.round(targetScore * 1.35));
    const thirdStar = Math.max(secondStar + 10, Math.round(targetScore * 1.85));
    const chapterName = chapterNameFor(chapter);

    return {
        id: levelIndex + 1,
        chapter,
        chapterName,
        name: `${chapterName} ${ROMAN[slot]}`,
        description: `${PATTERN_DESCRIPTIONS[shapeIndex]} Chapter ${chapter}, difficulty band ${tier + 1} of 4.`,
        layout,
        colors: [...palette],
        maxShots,
        shotsPerDrop,
        objective: { type: 'score', targetScore },
        starThresholds: [targetScore, secondStar, thirdStar],
        playtested: false,
        difficulty: (tier + 1) as 1 | 2 | 3 | 4 | 5,
        balanceNotes: 'Deterministic generated board; automated structural and shot-budget checks only.',
    };
};

const FIRST_GENERATED_CHAPTER = 11;
const GENERATED_CHAPTER_COUNT = 90;

/** Chapters 11-100, ten levels each: level ids 101-1000, contiguous and unique. */
export const GENERATED_CHAPTERS: readonly (readonly LevelDefinition[])[] = Array.from(
    { length: GENERATED_CHAPTER_COUNT },
    (_, chapterIndex): readonly LevelDefinition[] => {
        const chapter = FIRST_GENERATED_CHAPTER + chapterIndex;
        const generated = Array.from({ length: 10 }, (_, slot) =>
            buildLevel(chapter, slot, (chapter - 1) * 10 + slot)
        );

        const chapterDef: ChapterDefinition = {
            id: chapter,
            name: generated[0].chapterName,
            levels: generated.map(({ chapter: _c, chapterName: _n, ...rest }) => rest),
        };

        return defineChapter(chapterDef);
    }
);
