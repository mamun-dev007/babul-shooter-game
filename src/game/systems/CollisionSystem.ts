import type { Bubble } from '../objects/Bubble';
import {
    marchBubble,
    type Cell,
    type Obstacle,
    type Point,
} from './geometry';
import type { GridSystem } from './GridSystem';
import { MatchSystem } from './MatchSystem';
import type { BubbleColorName } from '../config';

export interface Velocity {
    x: number;
    y: number;
}

export interface ImpactEvent {
    kind: 'bubble' | 'ceiling';
    hitCell: Cell | null;
}

/** Cap a stalled frame so a tab switch cannot move the bubble across the board. */
const MAX_FRAME_MS = 50;
const MAX_BOUNCES_PER_STEP = 24;
const PREDICTION_MAX_DISTANCE = 5000;
const PREDICTION_SAMPLE_DISTANCE = 16;
const PREDICTION_MAX_BOUNCES = 24;

export class CollisionSystem {
    private readonly grid: GridSystem;

    constructor(grid: GridSystem) {
        this.grid = grid;
    }

    /**
     * Moves the bubble by the distance implied by the frame delta and reports
     * the first bubble or ceiling contact. Wall bounces are reflected back into
     * `velocity`, so gameplay and rendering stay in sync.
     */
    step(bubble: Bubble, velocity: Velocity, deltaMs: number): ImpactEvent | null {
        const speed = Math.hypot(velocity.x, velocity.y);

        if (speed <= 0) {
            return null;
        }

        const delta = Math.max(0, Math.min(deltaMs, MAX_FRAME_MS));
        const distance = (speed * delta) / 1000;

        if (distance <= 0) {
            return null;
        }

        const result = marchBubble(
            { x: bubble.x, y: bubble.y },
            velocity,
            distance,
            this.obstacles(),
            { maxBounces: MAX_BOUNCES_PER_STEP, ceilingY: this.grid.collisionCeilingY }
        );

        bubble.setPosition(result.position.x, result.position.y);
        velocity.x = result.direction.x * speed;
        velocity.y = result.direction.y * speed;

        if (!result.hit) {
            return null;
        }

        return {
            kind: result.hit.kind,
            hitCell: result.hit.cell,
        };
    }

    resolveCell(x: number, y: number, hitCell: Cell | null): Cell | null {
        return this.grid.findSnapCell(x, y, hitCell);
    }

    /** Predicted path for the aim guide, using the same contacts as `step`. */
    predict(origin: Point, angle: number, maxBounces = PREDICTION_MAX_BOUNCES): Point[] {
        const result = marchBubble(
            origin,
            { x: Math.sin(angle), y: -Math.cos(angle) },
            PREDICTION_MAX_DISTANCE,
            this.obstacles(),
            {
                sampleDistance: PREDICTION_SAMPLE_DISTANCE,
                maxBounces,
                ceilingY: this.grid.collisionCeilingY,
            }
        );

        return result.path;
    }

    /**
     * Bubbles a shot fired along `angle` would actually destroy through a
     * colour match — the mutation-free twin of the live resolve chain. The
     * same march live shots use halts at the first impact, `resolveCell`
     * picks the same snap cell the bubble would land on, and MatchSystem's
     * ≥3 colour rule runs with the fired bubble as a virtual (unplaced)
     * participant. No board state is touched. An empty result ⇒ the shot
     * would not trigger a match ⇒ nothing should be highlighted.
     */
    predictedMatch(origin: Point, angle: number, color: BubbleColorName): Bubble[] {
        const result = marchBubble(
            origin,
            { x: Math.sin(angle), y: -Math.cos(angle) },
            PREDICTION_MAX_DISTANCE,
            this.obstacles(),
            {
                maxBounces: PREDICTION_MAX_BOUNCES,
                ceilingY: this.grid.collisionCeilingY,
            }
        );

        if (result.hit?.kind !== 'bubble' || !result.hit.cell) {
            return [];
        }

        const cell = this.resolveCell(result.position.x, result.position.y, result.hit.cell);

        if (!cell) {
            return [];
        }

        return new MatchSystem(this.grid).predict(cell.row, cell.col, color);
    }

    private obstacles(): Obstacle[] {
        // Only bubbles inside the visible board band can be hit. Rows hidden
        // above the viewport remain part of the board but never receive an
        // invisible projectile or an off-screen attachment.
        return this.grid.shootableBubbles().map((bubble) => ({
            center: { x: bubble.x, y: bubble.y },
            cell: { row: bubble.row, col: bubble.col },
        }));
    }
}
