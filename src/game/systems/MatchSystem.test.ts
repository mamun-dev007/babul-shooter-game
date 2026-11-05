import { describe, expect, it } from 'vitest';
import { neighbourCells, type Cell } from './geometry';
import { MatchSystem } from './MatchSystem';
import { GRID_COLS, type BubbleColorName } from '../config';

interface FakeBubble {
    row: number;
    col: number;
    color: BubbleColorName;
}

class FakeGrid {
    bubbles: FakeBubble[] = [];

    constructor(bubbles: Array<{ row: number; col: number; color: BubbleColorName }>) {
        this.bubbles = bubbles.map((bubble) => ({ ...bubble }));
    }

    bubbleAt(row: number, col: number): FakeBubble | null {
        return this.bubbles.find((bubble) => bubble.row === row && bubble.col === col) ?? null;
    }

    clearBubble(bubble: FakeBubble): void {
        this.bubbles = this.bubbles.filter(
            (candidate) => !(candidate.row === bubble.row && candidate.col === bubble.col)
        );
    }

    floatingBubbles(): FakeBubble[] {
        const anchors = this.bubbles.filter((bubble) => bubble.row === 0);

        if (anchors.length === 0) {
            return [...this.bubbles];
        }

        const connected = new Set<string>();
        const queue: FakeBubble[] = [...anchors];

        while (queue.length > 0) {
            const current = queue.shift();

            if (!current) {
                break;
            }

            const key = `${current.row}:${current.col}`;

            if (connected.has(key)) {
                continue;
            }

            connected.add(key);

            for (const neighbour of neighbourCells(current.row, current.col)) {
                const neighbourKey = `${neighbour.row}:${neighbour.col}`;

                if (connected.has(neighbourKey)) {
                    continue;
                }

                const candidate = this.bubbleAt(neighbour.row, neighbour.col);

                if (candidate) {
                    queue.push(candidate);
                }
            }
        }

        return this.bubbles.filter((bubble) => !connected.has(`${bubble.row}:${bubble.col}`));
    }

    colorCluster(row: number, col: number): FakeBubble[] {
        const start = this.bubbleAt(row, col);

        if (!start) {
            return [];
        }

        const cluster: FakeBubble[] = [];
        const visited = new Set<string>([`${start.row}:${start.col}`]);
        const queue: FakeBubble[] = [start];

        while (queue.length > 0) {
            const current = queue.shift();

            if (!current) {
                break;
            }

            cluster.push(current);

            for (const neighbour of neighbourCells(current.row, current.col)) {
                const key = `${neighbour.row}:${neighbour.col}`;

                if (visited.has(key)) {
                    continue;
                }

                const candidate = this.bubbleAt(neighbour.row, neighbour.col);

                if (candidate && candidate.color === current.color) {
                    visited.add(key);
                    queue.push(candidate);
                }
            }
        }

        return cluster;
    }

    neighbourCells(row: number, col: number): Cell[] {
        return neighbourCells(row, col);
    }
}

describe('MatchSystem', () => {    it('does not pop a connected group of two', () => {
        const grid = new FakeGrid([
            { row: 0, col: 0, color: 'red' },
            { row: 0, col: 1, color: 'red' },
        ]);
        const match = new MatchSystem(grid as never);

        const outcome = match.resolve(0, 0);

        expect(outcome.matched).toEqual([]);
        expect(outcome.floating).toEqual([]);
        expect(outcome.score).toBe(0);
        expect(outcome.color).toBeNull();
        expect(grid.bubbles).toHaveLength(2);
    });

    it('pops a connected group of three', () => {
        const grid = new FakeGrid([
            { row: 0, col: 0, color: 'red' },
            { row: 0, col: 1, color: 'red' },
            { row: 0, col: 2, color: 'red' },
        ]);
        const match = new MatchSystem(grid as never);

        const outcome = match.resolve(0, 0);

        expect(outcome.matched).toHaveLength(3);
        expect(outcome.color).toBe('red');
        expect(outcome.score).toBeGreaterThan(0);
        expect(grid.bubbles).toHaveLength(0);
    });

    it('pops a larger connected group of five', () => {
        const grid = new FakeGrid(
            Array.from({ length: 5 }, (_, index) => ({
                row: 0,
                col: index,
                color: 'blue' as const,
            }))
        );
        const match = new MatchSystem(grid as never);

        const outcome = match.resolve(0, 0);

        expect(outcome.matched).toHaveLength(5);
        expect(outcome.score).toBe(5 * 10 + (5 - 3) * 15);
        expect(grid.bubbles).toHaveLength(0);
    });

    it('keeps disconnected same-colored bubbles apart', () => {
        const grid = new FakeGrid([
            { row: 0, col: 0, color: 'green' },
            { row: 3, col: 0, color: 'green' },
        ]);
        const match = new MatchSystem(grid as never);

        const outcome = match.resolve(0, 0);

        expect(outcome.matched).toEqual([]);
        expect(outcome.score).toBe(0);
        expect(grid.bubbles).toHaveLength(2);
    });

    it('ignores bubbles of different colors', () => {
        const grid = new FakeGrid([
            { row: 0, col: 0, color: 'red' },
            { row: 0, col: 1, color: 'red' },
            { row: 2, col: 0, color: 'blue' },
        ]);
        const match = new MatchSystem(grid as never);

        const outcome = match.resolve(0, 0);

        expect(outcome.matched).toEqual([]);
        expect(grid.bubbles).toHaveLength(3);
    });

    it('does not process the same cell twice', () => {
        const grid = new FakeGrid([
            { row: 0, col: 0, color: 'yellow' },
            { row: 0, col: 1, color: 'yellow' },
            { row: 0, col: 2, color: 'yellow' },
        ]);
        const match = new MatchSystem(grid as never);

        const first = match.resolve(0, 0);
        const second = match.resolve(0, 0);

        expect(first.matched).toHaveLength(3);
        expect(second.matched).toEqual([]);
    });

    it('resolves a new cluster that reuses a previously cleared cell', () => {
        const grid = new FakeGrid([
            { row: 0, col: 0, color: 'yellow' },
            { row: 0, col: 1, color: 'yellow' },
            { row: 0, col: 2, color: 'yellow' },
        ]);
        const match = new MatchSystem(grid as never);

        expect(match.resolve(0, 0).matched).toHaveLength(3);

        grid.bubbles.push(
            { row: 0, col: 0, color: 'green' },
            { row: 0, col: 1, color: 'green' },
            { row: 0, col: 2, color: 'green' }
        );

        const outcome = match.resolve(0, 0);

        expect(outcome.matched).toHaveLength(3);
        expect(outcome.color).toBe('green');
        expect(grid.bubbles).toHaveLength(0);
    });
});

describe('grid bounds used by match tests', () => {
    it('exposes a wide enough board for the fixture rows', () => {
        expect(GRID_COLS).toBeGreaterThan(3);
    });
});

describe('MatchSystem ceiling connectivity', () => {
    it('keeps fully supported groups from floating', () => {
        const grid = new FakeGrid([
            { row: 0, col: 0, color: 'red' },
            { row: 0, col: 1, color: 'red' },
            { row: 0, col: 2, color: 'red' },
        ]);
        const match = new MatchSystem(grid as never);

        expect(grid.floatingBubbles()).toEqual([]);

        const outcome = match.resolve(0, 0);

        expect(outcome.matched).toHaveLength(3);
        expect(outcome.floating).toEqual([]);
    });

    it('drops and scores unsupported bubbles left behind by a pop', () => {
        const grid = new FakeGrid([
            { row: 0, col: 0, color: 'red' },
            { row: 0, col: 1, color: 'red' },
            { row: 0, col: 2, color: 'red' },
            { row: 2, col: 0, color: 'green' },
        ]);
        const match = new MatchSystem(grid as never);

        const outcome = match.resolve(0, 0);

        expect(outcome.matched).toHaveLength(3);
        expect(outcome.floating).toHaveLength(1);
        expect(outcome.score).toBeGreaterThan(0);
        expect(grid.bubbles).toHaveLength(0);
    });

    it('handles multiple disconnected floating groups after a pop', () => {
        const grid = new FakeGrid([
            { row: 0, col: 0, color: 'red' },
            { row: 0, col: 1, color: 'red' },
            { row: 0, col: 2, color: 'red' },
            { row: 2, col: 0, color: 'green' },
            { row: 2, col: 2, color: 'green' },
        ]);
        const match = new MatchSystem(grid as never);

        const outcome = match.resolve(0, 0);

        expect(outcome.matched).toHaveLength(3);
        expect(outcome.floating).toHaveLength(2);
    });

    it('drops an unsupported bubble sitting on the bottom edge row', () => {
        const grid = new FakeGrid([
            { row: 0, col: 0, color: 'red' },
            { row: 0, col: 1, color: 'red' },
            { row: 0, col: 2, color: 'red' },
            { row: 15, col: 0, color: 'green' },
        ]);
        const match = new MatchSystem(grid as never);

        const outcome = match.resolve(0, 0);

        expect(outcome.matched).toHaveLength(3);
        expect(outcome.floating).toHaveLength(1);
    });

    it('resolves safely on an empty board', () => {
        const grid = new FakeGrid([]);
        const match = new MatchSystem(grid as never);

        const outcome = match.resolve(0, 0);

        expect(outcome.matched).toEqual([]);
        expect(outcome.score).toBe(0);
    });
});

describe('predict (predicted destruction preview)', () => {
    it('returns the bubbles a shot completing a trio would destroy', () => {
        const grid = new FakeGrid([
            { row: 0, col: 0, color: 'yellow' },
            { row: 0, col: 1, color: 'yellow' },
        ]);
        const match = new MatchSystem(grid as never);

        // A fired yellow bubble snapping at (0, 2) joins (0,1) + (0,0) into a
        // valid ≥3 group: exactly those two board bubbles would be destroyed
        // — the classic "aim at the yellow pair, both glow" scenario.
        const destroyed = match.predict(0, 2, 'yellow');

        expect(destroyed).toHaveLength(2);
        expect(destroyed.every((bubble) => bubble.color === 'yellow')).toBe(true);
        // Prediction must be mutation-free: the board is untouched.
        expect(grid.bubbles).toHaveLength(2);
    });

    it('returns nothing when the shot cannot complete a group of three', () => {
        const grid = new FakeGrid([{ row: 0, col: 0, color: 'red' }]);

        const destroyed = new MatchSystem(grid as never).predict(0, 1, 'red');

        expect(destroyed).toEqual([]);
    });

    it('walks the whole chain beyond the snap cell\'s direct neighbours', () => {
        const grid = new FakeGrid([
            { row: 0, col: 0, color: 'blue' },
            { row: 0, col: 1, color: 'blue' },
            { row: 0, col: 2, color: 'blue' },
        ]);

        const destroyed = new MatchSystem(grid as never).predict(0, 3, 'blue');

        expect(destroyed).toHaveLength(3);
    });

    it('never highlights groups of another colour on the board', () => {
        const grid = new FakeGrid([
            { row: 0, col: 0, color: 'red' },
            { row: 0, col: 1, color: 'blue' },
            { row: 0, col: 2, color: 'blue' },
        ]);

        // The blue pair connects into a trio at (0,3), but the red bubble
        // plays a different colour and must never appear in the result.
        const destroyed = new MatchSystem(grid as never).predict(0, 3, 'blue');

        expect(destroyed).toHaveLength(2);
        expect(destroyed.every((bubble) => bubble.color === 'blue')).toBe(true);
    });
});
