import { describe, expect, it, vi } from 'vitest';
import { BOARD_VIEW_BOTTOM, BOARD_VIEW_TOP, BUBBLE_RADIUS, GRID_TOP } from '../config';
import type { Bubble } from '../objects/Bubble';
import { GridSystem } from './GridSystem';

// GridSystem only needs the Bubble type here. Mocking the runtime module keeps
// Phaser (which expects a browser `window`) out of the node test environment.
vi.mock('../objects/Bubble', () => ({ Bubble: class {} }));

interface FakeBubble {
    row: number;
    col: number;
    color: 'red';
    x: number;
    y: number;
    destroy: () => void;
    setCell: (row: number, col: number) => void;
    setPosition: (x: number, y: number) => void;
    snapTo: (x: number, y: number) => void;
}

const makeBubble = (): FakeBubble => ({
    row: -1,
    col: -1,
    color: 'red',
    x: 0,
    y: 0,
    destroy: vi.fn(),
    setCell(row: number, col: number) {
        this.row = row;
        this.col = col;
    },
    setPosition(x: number, y: number) {
        this.x = x;
        this.y = y;
    },
    snapTo(x: number, y: number) {
        this.x = x;
        this.y = y;
    },
});

const makeGrid = (): GridSystem => new GridSystem({} as Phaser.Scene);

const asBubble = (bubble: FakeBubble): Bubble => bubble as unknown as Bubble;

describe('fixed-board GridSystem scrolling', () => {
    it('moves existing bubbles without ever creating or removing any', () => {
        const grid = makeGrid();
        const top = makeBubble();
        const bottom = makeBubble();

        grid.placeBubble(asBubble(top), 0, 0);
        grid.placeBubble(asBubble(bottom), 40, 0);

        expect(grid.bubbleCount).toBe(2);

        const before = grid.getBubbles().map((bubble) => ({ row: bubble.row, col: bubble.col }));
        grid.followBoard();
        grid.scrollBy(-10_000);
        grid.scrollBy(10_000);

        expect(grid.bubbleCount).toBe(2);
        expect(grid.getBubbles().map((bubble) => ({ row: bubble.row, col: bubble.col }))).toEqual(before);
    });

    it('drag scrolling only repositions existing bubbles and never regenerates them', () => {
        const grid = makeGrid();
        const top = makeBubble();
        const bottom = makeBubble();

        grid.placeBubble(asBubble(top), 0, 2);
        grid.placeBubble(asBubble(bottom), 40, 3);

        const before = grid
            .getBubbles()
            .map((bubble) => ({ row: bubble.row, col: bubble.col, color: bubble.color }));

        // A scroll gesture, a glide and clamped extremes: the grid must hold
        // exactly the same bubble objects (rows, columns, colors, identity).
        grid.scrollBy(37);
        grid.scrollBy(-104);
        grid.scrollBy(10_000);
        grid.setScrollOffset(grid.scrollOffsetY);

        expect(grid.bubbleCount).toBe(2);
        expect(
            grid.getBubbles().map((bubble) => ({ row: bubble.row, col: bubble.col, color: bubble.color }))
        ).toEqual(before);
        expect(grid.bubbleAt(0, 2)).toBe(asBubble(top));
        expect(grid.bubbleAt(40, 3)).toBe(asBubble(bottom));
    });

    it('only reports bubbles inside the viewport as shootable', () => {
        const grid = makeGrid();
        const top = makeBubble();
        const bottom = makeBubble();

        grid.placeBubble(asBubble(top), 0, 0);
        grid.placeBubble(asBubble(bottom), 40, 0);

        grid.setScrollOffset(0);
        expect(grid.shootableBubbles()).toEqual([asBubble(top)]);
        expect(grid.isBubbleShootable(asBubble(bottom))).toBe(false);

        grid.followBoard();
        expect(grid.isBubbleShootable(asBubble(top))).toBe(false);
        expect(grid.shootableBubbles()).toEqual([asBubble(bottom)]);

        // The frontier is anchored at the viewport's vertical middle, never at
        // the bottom edge.
        expect(bottom.y + BUBBLE_RADIUS).toBeCloseTo((BOARD_VIEW_TOP + BOARD_VIEW_BOTTOM) / 2);
        expect(grid.scrollOffsetY).toBe(grid.minScrollOffset);
        expect(grid.ceilingY).toBeCloseTo(GRID_TOP + BUBBLE_RADIUS + grid.minScrollOffset);
        expect(grid.collisionCeilingY).toBeCloseTo(BOARD_VIEW_TOP + BUBBLE_RADIUS);
        expect(grid.contentBottom).toBeGreaterThan(BOARD_VIEW_BOTTOM);
    });

    it('plays the formation in the upper-middle band with an open lower half', () => {
        const grid = makeGrid();
        const top = makeBubble();
        const bottom = makeBubble();

        grid.placeBubble(asBubble(top), 0, 0);
        grid.placeBubble(asBubble(bottom), 40, 0);

        grid.followBoard();

        const midY = (BOARD_VIEW_TOP + BOARD_VIEW_BOTTOM) / 2;

        // The frontier never sinks below the vertical midpoint...
        expect(bottom.y + BUBBLE_RADIUS).toBeLessThanOrEqual(midY + 0.5);
        // ...and stays inside the playable band.
        expect(bottom.y + BUBBLE_RADIUS).toBeGreaterThanOrEqual(BOARD_VIEW_TOP - 0.5);
    });

    it('keeps a small formation ceiling-aligned above the midpoint', () => {
        const grid = makeGrid();
        const top = makeBubble();
        const frontier = makeBubble();

        grid.placeBubble(asBubble(top), 0, 0);
        grid.placeBubble(asBubble(frontier), 3, 0);

        grid.followBoard();

        const midY = (BOARD_VIEW_TOP + BOARD_VIEW_BOTTOM) / 2;

        // Small boards cannot dip below their ceiling, so the whole formation
        // spans the upper part of the band and ends above the middle.
        expect(grid.scrollOffsetY).toBe(0);
        expect(frontier.y + BUBBLE_RADIUS).toBeLessThan(midY);
        expect(frontier.y + BUBBLE_RADIUS).toBeGreaterThan(BOARD_VIEW_TOP);
    });
});
