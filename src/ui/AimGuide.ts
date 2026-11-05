import { BUBBLE_DIAMETER, BUBBLE_RADIUS, bubbleTexture } from '../game/config';
import type { Shooter } from '../game/objects/Shooter';
import type { CollisionSystem } from '../game/systems/CollisionSystem';
import type { Point } from '../game/systems/GridSystem';
import { trajectoryPalette } from './trajectoryColors';

const GUIDE_DEPTH = 5;
const GHOST_DEPTH = 6;

/**
 * Draws the predicted trajectory and a translucent ghost bubble at the impact
 * point. Uses the same CollisionSystem prediction as the live shot.
 */
export class AimGuide {
    private readonly graphics: Phaser.GameObjects.Graphics;
    private readonly ghost: Phaser.GameObjects.Image;
    private readonly shooter: Shooter;
    private readonly collision: CollisionSystem;

    private visible = false;
    private lastAngle: number | null = null;
    private lastTexture: string | null = null;

    constructor(scene: Phaser.Scene, shooter: Shooter, collision: CollisionSystem) {
        this.shooter = shooter;
        this.collision = collision;

        this.graphics = scene.add.graphics().setDepth(GUIDE_DEPTH);
        this.ghost = scene.add
            .image(0, 0, bubbleTexture(shooter.currentColor))
            .setDisplaySize(BUBBLE_DIAMETER, BUBBLE_DIAMETER)
            .setAlpha(0.34)
            .setDepth(GHOST_DEPTH)
            .setVisible(false);
    }

    show(): void {
        const wasVisible = this.visible;
        this.visible = true;

        const angle = this.shooter.getAimAngle();
        const texture = bubbleTexture(this.shooter.currentColor);

        // The scene calls show() every frame. Prediction walks the whole board
        // and allocates a path, so skip it unless the shot has actually changed.
        // Hiding the guide invalidates the cache, which also covers board edits
        // that happen while a bubble is in flight.
        if (wasVisible && angle === this.lastAngle && texture === this.lastTexture) {
            return;
        }

        this.lastAngle = angle;
        this.lastTexture = texture;

        const muzzle = this.shooter.getMuzzlePosition();
        const points = this.collision.predict(muzzle, angle);

        this.draw(points);
    }

    hide(): void {
        if (!this.visible) {
            return;
        }

        this.visible = false;
        this.lastAngle = null;
        this.lastTexture = null;
        this.graphics.clear();
        this.ghost.setVisible(false);
    }

    destroy(): void {
        this.graphics.destroy();
        this.ghost.destroy();
    }

    private draw(points: Point[]): void {
        this.graphics.clear();

        if (points.length === 0) {
            this.ghost.setVisible(false);
            return;
        }

        // The dots are always drawn in the exact colour of the bubble that
        // will launch: the palette is sampled from the loaded bubble's colour
        // on every redraw. The show() cache keys on that colour, so a swap,
        // shot or level change redraws with the new palette immediately.
        const palette = trajectoryPalette(this.shooter.currentColor);

        for (let index = 0; index < points.length - 1; index += 2) {
            const point = points[index];

            this.graphics.fillStyle(palette.halo, 0.22);
            this.graphics.fillCircle(point.x, point.y, 6);
            this.graphics.fillStyle(palette.dot, 0.98);
            this.graphics.fillCircle(point.x, point.y, 4);
            this.graphics.fillStyle(palette.highlight, 0.78);
            this.graphics.fillCircle(point.x - 0.8, point.y - 0.8, 1.2);
        }

        const impact = points[points.length - 1];

        this.graphics.fillStyle(palette.impactFill, 0.12);
        this.graphics.fillCircle(impact.x, impact.y, BUBBLE_RADIUS - 2);
        this.graphics.lineStyle(2, palette.impactStroke, 0.68);
        this.graphics.strokeCircle(impact.x, impact.y, BUBBLE_RADIUS - 2);

        const texture = bubbleTexture(this.shooter.currentColor);

        if (this.ghost.texture.key !== texture) {
            this.ghost.setTexture(texture);
            this.ghost.setDisplaySize(BUBBLE_DIAMETER, BUBBLE_DIAMETER);
        }

        this.ghost.setPosition(impact.x, impact.y).setVisible(true);
    }

}
