import {
    BUBBLE_DIAMETER,
    BUBBLE_RADIUS,
    GRID_COLS,
    GRID_ROWS,
    GRID_TOP,
    ROW_HEIGHT,
} from '../config';
import { gridOriginX, wallLeftX, wallRightX } from '../layout';

export interface Point {
    x: number;
    y: number;
}

export interface Cell {
    row: number;
    col: number;
}

export interface Obstacle {
    center: Point;
    cell: Cell;
}

export interface Contact {
    distance: number;
    cell: Cell;
}

export interface MarchHit {
    kind: 'bubble' | 'ceiling';
    cell: Cell | null;
}

export interface MarchResult {
    position: Point;
    /** Unit direction after any wall bounces. */
    direction: Point;
    hit: MarchHit | null;
    distance: number;
    bounces: number;
    path: Point[];
}

export interface MarchOptions {
    /** When greater than zero, the path is sampled at this spacing. */
    sampleDistance?: number;
    maxBounces?: number;
    /** Moves with the scrollable board; defaults to the fixed ceiling. */
    ceilingY?: number;
}

export interface SnapOptions {
    x: number;
    y: number;
    hitCell: Cell | null;
    parity?: number;
    isFree: (cell: Cell) => boolean;
    isConnected: (cell: Cell) => boolean;
    fallbackRadius?: number;
}

/** Two bubbles touch when their centres are exactly one diameter apart. */
export const CONTACT_DISTANCE = BUBBLE_DIAMETER;
export const CEILING_Y = GRID_TOP + BUBBLE_RADIUS;

const EPSILON = 1e-6;
const MAX_ITERATIONS = 512;
const SNAP_FALLBACK_RADIUS = BUBBLE_DIAMETER * 2.5;

export const distanceBetween = (a: Point, b: Point): number =>
    Math.hypot(a.x - b.x, a.y - b.y);

export const gridCellKey = (cell: Cell): string => `${cell.row}:${cell.col}`;

export const isInsideGrid = (row: number, col: number): boolean =>
    row >= 0 && row < GRID_ROWS && col >= 0 && col < GRID_COLS;

/** Centre of a hex-grid cell, using the same offset convention as the board. */
export const cellCenter = (row: number, col: number, parity = 0): Point => {
    const shift = ((row + parity) & 1) === 1 ? BUBBLE_RADIUS : 0;

    return {
        x: gridOriginX() + BUBBLE_RADIUS + col * BUBBLE_DIAMETER + shift,
        y: GRID_TOP + BUBBLE_RADIUS + row * ROW_HEIGHT,
    };
};

export const gridCells = (): Cell[] => {
    const cells: Cell[] = [];

    for (let row = 0; row < GRID_ROWS; row++) {
        for (let col = 0; col < GRID_COLS; col++) {
            cells.push({ row, col });
        }
    }

    return cells;
};

/** Cells exactly one bubble away in the offset hex grid. */
export const neighbourCells = (row: number, col: number, parity = 0): Cell[] => {
    const origin = cellCenter(row, col, parity);
    const neighbours: Cell[] = [];

    for (let rowOffset = -1; rowOffset <= 1; rowOffset++) {
        for (let colOffset = -1; colOffset <= 1; colOffset++) {
            if (rowOffset === 0 && colOffset === 0) {
                continue;
            }

            const nextRow = row + rowOffset;
            const nextCol = col + colOffset;

            if (!isInsideGrid(nextRow, nextCol)) {
                continue;
            }

            const target = cellCenter(nextRow, nextCol, parity);

            // Hex neighbours are one diameter apart. The tolerance absorbs the
            // floating-point error in ROW_HEIGHT without admitting corner cells.
            if (distanceBetween(origin, target) <= CONTACT_DISTANCE + 0.5) {
                neighbours.push({ row: nextRow, col: nextCol });
            }
        }
    }

    return neighbours;
};

export const nearestCell = (
    cells: readonly Cell[],
    x: number,
    y: number,
    parity = 0
): Cell | null => {
    let best: Cell | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const cell of cells) {
        const position = cellCenter(cell.row, cell.col, parity);
        const distance = Math.hypot(position.x - x, position.y - y);

        if (distance < bestDistance) {
            best = cell;
            bestDistance = distance;
        }
    }

    return best;
};

/**
 * Picks the grid cell a newly arrived bubble should occupy. It prefers a free
 * neighbour of the bubble that was hit, then the nearest connected free cell
 * around the impact point, and only then falls back to the whole board.
 */
export const chooseSnapCell = (options: SnapOptions): Cell | null => {
    const { x, y, hitCell, isFree, isConnected, parity = 0 } = options;
    const fallbackRadius = options.fallbackRadius ?? SNAP_FALLBACK_RADIUS;

    if (hitCell && isInsideGrid(hitCell.row, hitCell.col)) {
        const freeNeighbours = neighbourCells(hitCell.row, hitCell.col, parity).filter(isFree);

        if (freeNeighbours.length > 0) {
            return nearestCell(freeNeighbours, x, y, parity);
        }
    }

    const connectedFreeCells = gridCells().filter(
        (cell) => isFree(cell) && isConnected(cell)
    );

    if (connectedFreeCells.length === 0) {
        return null;
    }

    const localCells = connectedFreeCells.filter((cell) => {
        const position = cellCenter(cell.row, cell.col, parity);
        return Math.hypot(position.x - x, position.y - y) <= fallbackRadius;
    });

    return nearestCell(localCells.length > 0 ? localCells : connectedFreeCells, x, y, parity);
};

/**
 * Swept circle-vs-circle test. Returns the first contact along a unit ray, or
 * null when nothing is within `maxDistance`. Solving the quadratic means a
 * fast bubble cannot tunnel through a stationary one between frames.
 */
export const firstContact = (
    origin: Point,
    direction: Point,
    maxDistance: number,
    obstacles: readonly Obstacle[]
): Contact | null => {
    const length = Math.hypot(direction.x, direction.y);

    if (length <= EPSILON || maxDistance < 0) {
        return null;
    }

    const unitX = direction.x / length;
    const unitY = direction.y / length;
    let best: Contact | null = null;
    let bestDistance = maxDistance + EPSILON;

    for (const obstacle of obstacles) {
        const offsetX = origin.x - obstacle.center.x;
        const offsetY = origin.y - obstacle.center.y;
        const projection = offsetX * unitX + offsetY * unitY;
        const gap =
            offsetX * offsetX +
            offsetY * offsetY -
            CONTACT_DISTANCE * CONTACT_DISTANCE;

        let along: number;

        if (gap <= 0) {
            // Already touching or overlapping: stop at the current position.
            along = 0;
        } else {
            const discriminant = projection * projection - gap;

            if (discriminant < 0) {
                continue;
            }

            along = -projection - Math.sqrt(discriminant);

            if (along < 0) {
                // The obstacle is behind the bubble.
                continue;
            }
        }

        if (along < bestDistance) {
            bestDistance = along;
            best = {
                distance: along,
                cell: { row: obstacle.cell.row, col: obstacle.cell.col },
            };
        }
    }

    return best;
};

/**
 * Advances a bubble along a direction, reflecting off the side walls and
 * stopping on the first contact with a stationary bubble or the ceiling.
 * Pure geometry: the caller owns the Bubble object and its velocity.
 */
export const marchBubble = (
    origin: Point,
    direction: Point,
    maxDistance: number,
    obstacles: readonly Obstacle[],
    options: MarchOptions = {}
): MarchResult => {
    const sampleDistance = Math.max(0, options.sampleDistance ?? 0);
    const maxBounces = options.maxBounces ?? 32;
    const ceilingY = options.ceilingY ?? CEILING_Y;
    const path: Point[] = [{ x: origin.x, y: origin.y }];

    const pushPoint = (point: Point): void => {
        const last = path[path.length - 1];

        if (!last || distanceBetween(last, point) > 0.01) {
            path.push(point);
        }
    };

    const length = Math.hypot(direction.x, direction.y);

    if (length <= EPSILON || maxDistance <= 0) {
        return {
            position: { x: origin.x, y: origin.y },
            direction: { x: 0, y: -1 },
            hit: null,
            distance: 0,
            bounces: 0,
            path,
        };
    }

    const left = wallLeftX();
    const right = wallRightX();

    let x = origin.x;
    let y = origin.y;
    let directionX = direction.x / length;
    let directionY = direction.y / length;
    let remaining = maxDistance;
    let travelled = 0;
    let bounces = 0;
    let nextSampleAt = sampleDistance;
    let iterations = 0;

    while (remaining > EPSILON && iterations < MAX_ITERATIONS) {
        iterations += 1;

        const toCeiling =
            directionY < -EPSILON ? (y - ceilingY) / -directionY : Number.POSITIVE_INFINITY;
        const toWall =
            directionX < -EPSILON
                ? (x - left) / -directionX
                : directionX > EPSILON
                  ? (right - x) / directionX
                  : Number.POSITIVE_INFINITY;

        const contact = firstContact(
            { x, y },
            { x: directionX, y: directionY },
            remaining,
            obstacles
        );
        const contactDistance = contact?.distance ?? Number.POSITIVE_INFINITY;
        const travel = Math.min(remaining, toCeiling, toWall, contactDistance);

        if (sampleDistance > 0) {
            while (nextSampleAt <= travelled + travel + EPSILON) {
                const offset = nextSampleAt - travelled;
                pushPoint({ x: x + directionX * offset, y: y + directionY * offset });
                nextSampleAt += sampleDistance;
            }
        }

        x += directionX * travel;
        y += directionY * travel;
        travelled += travel;
        remaining -= travel;

        // Never allow a wall clamp to push the centre outside the playfield.
        x = Math.min(right, Math.max(left, x));

        if (
            contact &&
            contactDistance <= travel + EPSILON &&
            contactDistance <= toCeiling + EPSILON &&
            contactDistance <= toWall + EPSILON
        ) {
            pushPoint({ x, y });

            return {
                position: { x, y },
                direction: { x: directionX, y: directionY },
                hit: { kind: 'bubble', cell: contact.cell },
                distance: travelled,
                bounces,
                path,
            };
        }

        // A ceiling hit wins a tie with the wall so a corner shot stops in the
        // top row instead of reflecting away from it.
        if (toCeiling <= travel + EPSILON && toCeiling <= toWall + EPSILON) {
            y = ceilingY;
            pushPoint({ x, y });

            return {
                position: { x, y },
                direction: { x: directionX, y: directionY },
                hit: { kind: 'ceiling', cell: null },
                distance: travelled,
                bounces,
                path,
            };
        }

        if (toWall <= travel + EPSILON) {
            if (x <= left + EPSILON) {
                x = left;
                directionX = Math.abs(directionX);
            } else if (x >= right - EPSILON) {
                x = right;
                directionX = -Math.abs(directionX);
            } else {
                directionX = -directionX;
            }

            // Keep the corner in the sampled path so the aim guide bends at
            // the wall instead of drawing a line through it.
            pushPoint({ x, y });
            bounces += 1;

            if (bounces > maxBounces) {
                pushPoint({ x, y });

                return {
                    position: { x, y },
                    direction: { x: directionX, y: directionY },
                    hit: null,
                    distance: travelled,
                    bounces,
                    path,
                };
            }
        }
    }

    pushPoint({ x, y });

    return {
        position: { x, y },
        direction: { x: directionX, y: directionY },
        hit: null,
        distance: travelled,
        bounces,
        path,
    };
};
