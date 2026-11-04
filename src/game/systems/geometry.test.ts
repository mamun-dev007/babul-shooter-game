import { describe, expect, it } from 'vitest';
import {
    BUBBLE_DIAMETER,
    BUBBLE_RADIUS,
    GRID_COLS,
    GRID_ROWS,
    ROW_HEIGHT,
    WALL_LEFT,
    WALL_RIGHT,
} from '../config';
import {
    CEILING_Y,
    CONTACT_DISTANCE,
    cellCenter,
    chooseSnapCell,
    distanceBetween,
    firstContact,
    gridCellKey,
    isInsideGrid,
    marchBubble,
    nearestCell,
    neighbourCells,
    type Cell,
    type Obstacle,
} from './geometry';

const key = (cell: Cell): string => gridCellKey(cell);

const obstacle = (x: number, y: number, row = 0, col = 0): Obstacle => ({
    center: { x, y },
    cell: { row, col },
});

describe('hex grid geometry', () => {
    it('spaces adjacent cells exactly one bubble diameter apart', () => {
        expect(CONTACT_DISTANCE).toBe(BUBBLE_DIAMETER);

        for (let row = 0; row < GRID_ROWS; row++) {
            for (let col = 0; col < GRID_COLS; col++) {
                const origin = cellCenter(row, col);

                for (const neighbour of neighbourCells(row, col)) {
                    const target = cellCenter(neighbour.row, neighbour.col);

                    expect(distanceBetween(origin, target)).toBeCloseTo(
                        BUBBLE_DIAMETER,
                        6
                    );
                }
            }
        }
    });

    it('keeps horizontal and vertical row spacing stable', () => {
        expect(
            distanceBetween(cellCenter(4, 2), cellCenter(4, 3))
        ).toBeCloseTo(BUBBLE_DIAMETER, 6);
        expect(
            distanceBetween(cellCenter(4, 2), cellCenter(5, 2))
        ).toBeCloseTo(BUBBLE_DIAMETER, 6);
        expect(cellCenter(4, 2).y - cellCenter(3, 2).y).toBeCloseTo(ROW_HEIGHT, 6);
    });

    it('alternates the half-bubble row offset with parity', () => {
        const evenRow = cellCenter(0, 0, 0).x;
        const oddRow = cellCenter(0, 0, 1).x;

        expect(oddRow - evenRow).toBeCloseTo(BUBBLE_RADIUS, 6);
    });

    it('handles grid corners without wrapping or duplicate cells', () => {
        const topLeft = neighbourCells(0, 0).map(key).sort();
        const topRight = neighbourCells(0, GRID_COLS - 1).map(key).sort();

        expect(topLeft).toEqual(['0:1', '1:0']);
        expect(topRight).toEqual(['0:11', '1:11', '1:12']);

        for (const cell of [topLeft, topRight]) {
            expect(new Set(cell).size).toBe(cell.length);
        }
    });

    it('rejects coordinates outside the board', () => {
        expect(isInsideGrid(0, 0)).toBe(true);
        expect(isInsideGrid(GRID_ROWS - 1, GRID_COLS - 1)).toBe(true);
        expect(isInsideGrid(-1, 0)).toBe(false);
        expect(isInsideGrid(0, -1)).toBe(false);
        expect(isInsideGrid(GRID_ROWS, 0)).toBe(false);
        expect(isInsideGrid(0, GRID_COLS)).toBe(false);
    });

    it('finds the closest cell', () => {
        const cells = [
            { row: 0, col: 0 },
            { row: 0, col: 1 },
            { row: 1, col: 1 },
        ];
        const near = cellCenter(0, 1);

        expect(nearestCell(cells, near.x + 4, near.y + 4)).toEqual({
            row: 0,
            col: 1,
        });
        expect(nearestCell([], 100, 100)).toBeNull();
    });
});

describe('snap cell selection', () => {
    it('picks a free neighbour of the bubble that was hit', () => {
        const hitCell = { row: 2, col: 4 };
        const occupied = new Set(['2:3']);
        const impact = cellCenter(2, 3);

        const result = chooseSnapCell({
            x: impact.x,
            y: impact.y,
            hitCell,
            isFree: (cell) => !occupied.has(key(cell)),
            isConnected: () => true,
        });

        expect(result).not.toBeNull();
        expect(occupied.has(key(result as Cell))).toBe(false);
        expect(
            neighbourCells(hitCell.row, hitCell.col).some(
                (cell) => key(cell) === key(result as Cell)
            )
        ).toBe(true);
    });

    it('snaps a ceiling hit to the nearest top-row cell', () => {
        const result = chooseSnapCell({
            x: WALL_RIGHT,
            y: CEILING_Y,
            hitCell: null,
            isFree: () => true,
            isConnected: (cell) => cell.row === 0,
        });

        expect(result).toEqual({ row: 0, col: GRID_COLS - 1 });
    });

    it('falls back to the nearest connected free cell when neighbours are full', () => {
        const onlyFree = '0:0';

        const result = chooseSnapCell({
            x: cellCenter(1, 5).x,
            y: cellCenter(1, 5).y,
            hitCell: { row: 1, col: 5 },
            isFree: (cell) => key(cell) === onlyFree,
            isConnected: (cell) => cell.row === 0,
        });

        expect(result).toEqual({ row: 0, col: 0 });
    });

    it('returns null when the board has no free connected cell', () => {
        const result = chooseSnapCell({
            x: 200,
            y: 200,
            hitCell: null,
            isFree: () => false,
            isConnected: () => true,
        });

        expect(result).toBeNull();
    });
});

describe('swept bubble collision', () => {
    it('reports the first contact distance with a stationary bubble', () => {
        const target = obstacle(270, 200, 3, 5);
        const contact = firstContact(
            { x: 270, y: 300 },
            { x: 0, y: -1 },
            200,
            [target]
        );

        expect(contact).not.toBeNull();
        expect(contact?.distance).toBeCloseTo(100 - BUBBLE_DIAMETER, 6);
        expect(contact?.cell).toEqual({ row: 3, col: 5 });
    });

    it('stops exactly one diameter from the bubble it hits', () => {
        const target = obstacle(270, 200, 3, 5);
        const result = marchBubble(
            { x: 270, y: 300 },
            { x: 0, y: -1 },
            200,
            [target]
        );

        expect(result.hit?.kind).toBe('bubble');
        expect(result.hit?.cell).toEqual({ row: 3, col: 5 });
        expect(distanceBetween(result.position, target.center)).toBeCloseTo(
            CONTACT_DISTANCE,
            6
        );
    });

    it('cannot tunnel through a bubble at high speed', () => {
        const target = obstacle(270, 200);
        const result = marchBubble(
            { x: 270, y: 400 },
            { x: 0, y: -1 },
            1000,
            [target]
        );

        expect(result.hit?.kind).toBe('bubble');
        expect(result.position.y).toBeCloseTo(200 + CONTACT_DISTANCE, 6);
    });

    it('stops at the ceiling and records the impact point', () => {
        const result = marchBubble(
            { x: 270, y: 300 },
            { x: 0, y: -1 },
            400,
            []
        );

        expect(result.hit?.kind).toBe('ceiling');
        expect(result.position.y).toBeCloseTo(CEILING_Y, 6);
        expect(result.path[result.path.length - 1]).toEqual(result.position);
    });

    it('prefers a top-row bubble over the ceiling behind it', () => {
        const target = obstacle(270, CEILING_Y, 0, 5);
        const result = marchBubble(
            { x: 270, y: CEILING_Y + 100 },
            { x: 0, y: -1 },
            200,
            [target]
        );

        expect(result.hit?.kind).toBe('bubble');
        expect(result.position.y).toBeCloseTo(CEILING_Y + CONTACT_DISTANCE, 6);
    });

    it('bounces off the side walls and stays inside the playfield', () => {
        const start = { x: WALL_LEFT + 10, y: 400 };
        const result = marchBubble(
            start,
            { x: -Math.SQRT1_2, y: -Math.SQRT1_2 },
            100,
            []
        );

        expect(result.hit).toBeNull();
        expect(result.bounces).toBe(1);
        expect(result.position.x).toBeGreaterThanOrEqual(WALL_LEFT);
        expect(result.position.x).toBeLessThanOrEqual(WALL_RIGHT);
        expect(
            result.path.some((point) => Math.abs(point.x - WALL_LEFT) < 0.001)
        ).toBe(true);
    });

    it('stops at the ceiling in a top-corner tie without leaving the board', () => {
        const result = marchBubble(
            { x: WALL_LEFT + 1, y: CEILING_Y + 1 },
            { x: -Math.SQRT1_2, y: -Math.SQRT1_2 },
            10,
            []
        );

        expect(result.hit?.kind).toBe('ceiling');
        expect(result.position.y).toBeCloseTo(CEILING_Y, 6);
        expect(result.position.x).toBeGreaterThanOrEqual(WALL_LEFT);
    });

    it('reflects a repeated wall graze rather than sticking to the wall', () => {
        const result = marchBubble(
            { x: WALL_RIGHT - 2, y: 500 },
            { x: 0.2, y: -1 },
            60,
            []
        );

        expect(result.position.x).toBeLessThanOrEqual(WALL_RIGHT);
        expect(result.bounces).toBe(1);
        expect(result.position.x).toBeLessThan(WALL_RIGHT);
    });
});
