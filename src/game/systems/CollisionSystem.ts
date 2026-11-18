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

/**
 * Cap a stalled frame so a tab switch cannot move the bubble across the board,
 * but keep it high enough that a low-end 15-20 FPS device still moves the
 * projectile at full speed. Long frames are split into small substeps below,
 * so this cap never turns into a speed penalty.
 */
const MAX_FRAME_MS = 100;
const MAX_SUBSTEP_MS = 25;
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
    step(
        bubble: Bubble,
        velocity: Velocity,
        deltaMs: number,
        onWallBounce?: () => void
    ): ImpactEvent | null {
        const speed = Math.hypot(velocity.x, velocity.y);

        if (speed <= 0) {
            return null;
        }

        const totalMs = Math.max(0, Math.min(deltaMs, MAX_FRAME_MS));

        if (totalMs <= 0) {
            return null;
        }

        const obstacles = this.obstacles();
        let remaining = totalMs;
        let position = { x: bubble.x, y: bubble.y };
        let direction = { x: velocity.x / speed, y: velocity.y / speed };
        let bounces = 0;

        // Substep long frames so travel distance stays proportional to real
        // time on slow devices. Each march is still a continuous sweep, so a
        // fast projectile can never skip a wall or a bubble.
        while (remaining > 0) {
            const slice = Math.min(remaining, MAX_SUBSTEP_MS);
            const result = marchBubble(
                position,
                direction,
                (speed * slice) / 1000,
                obstacles,
                { maxBounces: MAX_BOUNCES_PER_STEP, ceilingY: this.grid.collisionCeilingY }
            );

            position = result.position;
            direction = result.direction;
            bounces += result.bounces;
            remaining -= slice;

            if (result.hit) {
                bubble.setPosition(position.x, position.y);
                velocity.x = direction.x * speed;
                velocity.y = direction.y * speed;
                if (bounces > 0) {
                    onWallBounce?.();
                }
                return { kind: result.hit.kind, hitCell: result.hit.cell };
            }
        }

        bubble.setPosition(position.x, position.y);
        velocity.x = direction.x * speed;
        velocity.y = direction.y * speed;

        if (bounces > 0) {
            onWallBounce?.();
        }

        return null;
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

        if (!result.hit) {
            return [];
        }

        const hitCell = result.hit.kind === 'bubble' ? result.hit.cell : null;
        const cell = this.resolveCell(result.position.x, result.position.y, hitCell);

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
