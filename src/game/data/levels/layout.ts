import type { BubbleColorName } from '../../config';
import { LAYOUT_COLOR_TOKENS, LAYOUT_EMPTY } from './colors';
import type { LayoutCell, LevelDefinition } from './types';

/**
 * Converts layout rows into concrete cells. This is the parsing path used by
 * both the hand-authored default layouts and the runtime random generator.
 */
export function cellsFromRows(
    rows: readonly string[],
    level: Pick<LevelDefinition, 'id' | 'name'>
): LayoutCell[] {
    const cells: LayoutCell[] = [];

    rows.forEach((rowText, row) => {
        for (let col = 0; col < rowText.length; col++) {
            const token = rowText[col];

            if (token === LAYOUT_EMPTY) {
                continue;
            }

            const color = LAYOUT_COLOR_TOKENS[token];

            if (!color) {
                throw new Error(`Level ${level.id} (${level.name}) has unknown layout token "${token}".`);
            }

            cells.push({ row, col, color });
        }
    });

    return cells;
}

export function layoutCells(level: LevelDefinition): LayoutCell[] {
    return cellsFromRows(level.layout, level);
}

export const countLayoutBubbles = (level: LevelDefinition): number => layoutCells(level).length;

export const layoutColors = (level: LevelDefinition): BubbleColorName[] =>
    Array.from(new Set(layoutCells(level).map((cell) => cell.color)));
