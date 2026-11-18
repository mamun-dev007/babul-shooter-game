import { describe, expect, it, vi } from 'vitest';
import { BUBBLE_RADIUS, GRID_TOP, LAUNCH_SPEED } from '../config';
import type { Bubble } from '../objects/Bubble';
import type { Cell } from './geometry';
import { cellCenter, neighbourCells } from './geometry';
import { CollisionSystem } from './CollisionSystem';
import type { GridSystem } from './GridSystem';

describe('CollisionSystem predicted matches', () => {
    it('predicts a match when the shot attaches to the ceiling', () => {
        const bubbles = [
            { row: 0, col: 0, color: 'red' as const },
            { row: 0, col: 1, color: 'red' as const },
        ];
        const findSnapCell = vi.fn(
            (_x: number, _y: number, hitCell: Cell | null): Cell =>
                hitCell ?? { row: 0, col: 2 }
        );
        const grid = {
            collisionCeilingY: GRID_TOP + BUBBLE_RADIUS,
            shootableBubbles: () => [],
            findSnapCell,
            neighbourCells,
            bubbleAt: (row: number, col: number) =>
                bubbles.find((bubble) => bubble.row === row && bubble.col === col) ?? null,
            floatingBubbles: () => [],
        } as unknown as GridSystem;
        const collision = new CollisionSystem(grid);
        const muzzle = { ...cellCenter(0, 2), y: GRID_TOP + BUBBLE_RADIUS + 100 };

        const predicted = collision.predictedMatch(muzzle, 0, 'red');

        expect(findSnapCell).toHaveBeenCalledWith(
            muzzle.x,
            GRID_TOP + BUBBLE_RADIUS,
            null
        );
        expect(predicted).toHaveLength(2);
        expect(predicted.every((bubble) => bubble.color === 'red')).toBe(true);
    });
});

describe('CollisionSystem high-speed movement', () => {
    it('sweeps the faster projectile into a bubble instead of tunneling through it', () => {
        const target = { x: 350, y: 200, row: 4, col: 5 };
        const projectile = {
            x: target.x,
            y: target.y + 126,
            setPosition(x: number, y: number) {
                this.x = x;
                this.y = y;
            },
        };
        const grid = {
            collisionCeilingY: GRID_TOP + BUBBLE_RADIUS,
            shootableBubbles: () => [target],
        } as unknown as GridSystem;
        const velocity = { x: 0, y: -LAUNCH_SPEED };
        const collision = new CollisionSystem(grid);

        const impact = collision.step(projectile as unknown as Bubble, velocity, 50);

        expect(impact).toEqual({ kind: 'bubble', hitCell: { row: 4, col: 5 } });
        expect(projectile.y).toBeCloseTo(target.y + BUBBLE_RADIUS * 2);
        expect(velocity.y).toBe(-LAUNCH_SPEED);
    });

    it('keeps full speed on a slow frame instead of slowing the projectile', () => {
        const projectile = {
            x: 350,
            y: 900,
            setPosition(x: number, y: number) {
                this.x = x;
                this.y = y;
            },
        };
        const grid = {
            collisionCeilingY: GRID_TOP + BUBBLE_RADIUS,
            shootableBubbles: () => [],
        } as unknown as GridSystem;
        const velocity = { x: 0, y: -LAUNCH_SPEED };
        let bounces = 0;

        const impact = new CollisionSystem(grid).step(
            projectile as unknown as Bubble,
            velocity,
            100,
            () => { bounces += 1; }
        );

        expect(impact).toBeNull();
        expect(projectile.y).toBeCloseTo(900 - LAUNCH_SPEED * 0.1, 3);
        expect(velocity.y).toBe(-LAUNCH_SPEED);
        expect(bounces).toBe(0);
    });
});
