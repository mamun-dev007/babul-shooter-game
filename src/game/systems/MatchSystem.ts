import type { BubbleColorName } from '../config';
import type { Bubble } from '../objects/Bubble';
import type { Cell } from './geometry';
import type { GridSystem } from './GridSystem';

export interface MatchOutcome {
    matched: Bubble[];
    floating: Bubble[];
    score: number;
    color: BubbleColorName | null;
}

export class MatchSystem {
    private readonly grid: GridSystem;

    constructor(grid: GridSystem) {
        this.grid = grid;
    }

    resolve(row: number, col: number): MatchOutcome {
        const cluster = this.grid.colorCluster(row, col);

        if (cluster.length < 3) {
            return {
                matched: [],
                floating: [],
                score: 0,
                color: null,
            };
        }

        const color = cluster[0].color;

        for (const bubble of cluster) {
            this.grid.clearBubble(bubble);
        }

        const floating = this.grid.floatingBubbles();

        for (const bubble of floating) {
            this.grid.clearBubble(bubble);
        }

        const comboBonus = Math.max(0, cluster.length - 3) * 15;
        const score = cluster.length * 10 + comboBonus + floating.length * 25;

        return {
            matched: cluster,
            floating,
            score,
            color,
        };
    }

    /**
     * Mutation-free twin of `resolve`: would placing a `color` bubble at the
     * currently *empty* snap cell (row, col) destroy a matching group? Walks
     * the same colour-connected neighbours as `resolve`, then asks the grid
     * which other bubbles would become unsupported if the matched cells and
     * the virtual shot bubble were removed. The prediction is mutation-free.
     */
    predict(row: number, col: number, color: BubbleColorName): Bubble[] {
        const cluster: Bubble[] = [];
        // The ghost bubble counts as visited so the walk can never enter it.
        const visited = new Set<string>([`${row}:${col}`]);
        const queue: Cell[] = this.grid.neighbourCells(row, col);

        while (queue.length > 0) {
            const current = queue.shift();

            if (!current) {
                break;
            }

            const key = this.cellKey(current.row, current.col);

            if (visited.has(key)) {
                continue;
            }

            const bubble = this.grid.bubbleAt(current.row, current.col);

            if (!bubble || bubble.color !== color) {
                continue;
            }

            visited.add(key);
            cluster.push(bubble);

            for (const neighbour of this.grid.neighbourCells(current.row, current.col)) {
                if (!visited.has(this.cellKey(neighbour.row, neighbour.col))) {
                    queue.push(neighbour);
                }
            }
        }

        // resolve() only destroys a group when the placed bubble completes a
        // group of three or more. Then it also removes every bubble no longer
        // connected to the ceiling after that group (including the virtual
        // shot bubble) is removed.
        if (cluster.length + 1 < 3) {
            return [];
        }

        const matchedCells = [
            { row, col },
            ...cluster.map((bubble) => ({ row: bubble.row, col: bubble.col })),
        ];
        return [...cluster, ...this.grid.floatingBubbles(matchedCells)];
    }

    private cellKey(row: number, col: number): string {
        return `${row}:${col}`;
    }
}
