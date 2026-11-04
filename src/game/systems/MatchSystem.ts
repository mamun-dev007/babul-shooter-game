import type { BubbleColorName } from '../config';
import type { Bubble } from '../objects/Bubble';
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
}
