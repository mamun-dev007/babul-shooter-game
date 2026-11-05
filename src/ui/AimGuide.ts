import { BUBBLE_DIAMETER, BUBBLE_RADIUS, bubbleTexture } from '../game/config';
import type { Bubble } from '../game/objects/Bubble';
import type { Shooter } from '../game/objects/Shooter';
import type { CollisionSystem } from '../game/systems/CollisionSystem';
import type { Point } from '../game/systems/GridSystem';
import { trajectoryPalette } from './trajectoryColors';

const GUIDE_DEPTH = 5;
const GHOST_DEPTH = 6;
/** Halo layer sits between the trajectory (5) and the bubbles (10), so the
 * glow wraps around each targeted bubble without tinting its own artwork. */
const TARGET_GLOW_DEPTH = 9;
/** Length of one gentle glow pulse, in ms. */
const PULSE_CYCLE_MS = 900;

/**
 * Draws the predicted trajectory and a translucent ghost bubble at the impact
 * point. Uses the same CollisionSystem prediction as the live shot.
 *
 * A soft, gently pulsing halo highlights only the bubbles the current shot is
 * *predicted to destroy* — the live match logic (march → snap → ≥3 colour
 * group) executed in prediction mode against the loaded bubble's colour.
 * Bubbles the shot would never destroy are never touched.
 */
export class AimGuide {
    private readonly graphics: Phaser.GameObjects.Graphics;
    private readonly ghost: Phaser.GameObjects.Image;
    private readonly glow: Phaser.GameObjects.Graphics;
    private readonly shooter: Shooter;
    private readonly collision: CollisionSystem;

    private visible = false;
    private lastAngle: number | null = null;
    private lastTexture: string | null = null;
    /** Bubbles the predicted shot would destroy through a match. */
    private targets: Bubble[] = [];
    private fireMode = false;
    private fireTargetsProvider: ((impact: Point) => Bubble[]) | null = null;

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
        this.glow = scene.add.graphics().setDepth(TARGET_GLOW_DEPTH);
    }

    show(): void {
        const wasVisible = this.visible;
        this.visible = true;

        const angle = this.shooter.getAimAngle();
        const texture = bubbleTexture(this.shooter.currentColor);

        // The scene calls show() every frame. Prediction walks the whole board
        // and allocates a path, so skip it unless the shot has actually
        // changed. Hiding the guide invalidates the cache, which also covers
        // board edits that happen while a bubble is in flight. The glow layer
        // re-pulses every frame so its lighting animation never stalls.
        if (!wasVisible || angle !== this.lastAngle || texture !== this.lastTexture) {
            this.lastAngle = angle;
            this.lastTexture = texture;

            const muzzle = this.shooter.getMuzzlePosition();
            const points = this.collision.predict(muzzle, angle);

            this.draw(points);
            this.refreshTargets(muzzle, angle, points);
        }

        this.pulse();
    }

    hide(): void {
        if (!this.visible) {
            return;
        }

        this.visible = false;
        this.lastAngle = null;
        this.lastTexture = null;
        this.graphics.clear();
        this.glow.clear();
        this.ghost.setVisible(false);
    }

    destroy(): void {
        this.graphics.destroy();
        this.ghost.destroy();
        this.glow.destroy();
        this.targets = [];
    }

    /**
     * Recomputes the highlighted set: the bubbles the loaded colour's shot
     * would actually destroy along this trajectory. Runs the destruction
     * chain live shooting uses — same march, same snap resolution, same ≥3
     * colour-match rule — without mutating the board, so the glow can never
     * disagree with the shot's real outcome.
     */
    private refreshTargets(muzzle: Point, angle: number, points: Point[]): void {
        if (this.fireMode && this.fireTargetsProvider) {
            this.targets = this.fireTargetsProvider(points[points.length - 1] ?? muzzle);
            return;
        }
        this.targets = this.collision.predictedMatch(muzzle, angle, this.shooter.currentColor);
    }

    /**
     * Redraws the glow layer: a soft, gently pulsing halo in the exact colour
     * of each predicted match bubble. Fully cleared each frame, so removed
     * or moved bubbles lose their halo the very next frame for free.
     */
    private pulse(): void {
        this.glow.clear();

        if (this.targets.length === 0) {
            return;
        }

        const now = this.shooter.scene.time.now;
        // A smooth 0..1..0 wave: bubbles appear to breathe at a calm rate.
        const wave = (Math.sin((now % PULSE_CYCLE_MS) / PULSE_CYCLE_MS * Math.PI * 2) + 1) / 2;

        for (const bubble of this.targets) {
            // Sample each bubble's own palette so mixed colours could never
            // bleed: the halo always matches the bubble it wraps.
            const palette = trajectoryPalette(bubble.color);
            // The wave slightly grows the outermost ring and brightens the
            // inner fills; the bubble artwork itself is never touched.
            const ringPad = 1.5 + wave * 2.5;
            if (this.fireMode) {
                this.glow.fillStyle(0xff3d14, 0.14 + wave * 0.14);
                this.glow.fillCircle(bubble.x, bubble.y, BUBBLE_RADIUS + ringPad + 7);
                this.glow.fillStyle(0xfff1a8, 0.22 + wave * 0.18);
                this.glow.fillCircle(bubble.x, bubble.y, BUBBLE_RADIUS + ringPad + 3);
                this.glow.lineStyle(2, 0xff8a1f, 0.78);
                this.glow.strokeCircle(bubble.x, bubble.y, BUBBLE_RADIUS + ringPad);
                continue;
            }

            this.glow.fillStyle(palette.halo, 0.08 + wave * 0.06);
            this.glow.fillCircle(bubble.x, bubble.y, BUBBLE_RADIUS + ringPad + 6);
            this.glow.fillStyle(palette.dot, 0.12 + wave * 0.12);
            this.glow.fillCircle(bubble.x, bubble.y, BUBBLE_RADIUS + ringPad + 2.5);
            this.glow.fillStyle(palette.highlight, 0.18 + wave * 0.18);
            this.glow.fillCircle(bubble.x, bubble.y, BUBBLE_RADIUS + ringPad);
        }
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
        const palette = this.fireMode
            ? { halo: 0xff3d14, dot: 0xff8a1f, highlight: 0xfff1a8, impactFill: 0xff8a1f, impactStroke: 0xfff1a8 }
            : trajectoryPalette(this.shooter.currentColor);

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

        const texture = this.fireMode ? 'icon-fire' : bubbleTexture(this.shooter.currentColor);

        if (this.ghost.texture.key !== texture) {
            this.ghost.setTexture(texture);
            this.ghost.setDisplaySize(BUBBLE_DIAMETER, BUBBLE_DIAMETER);
        }

        this.ghost.setPosition(impact.x, impact.y).setVisible(true);
    }

    setFireMode(active: boolean, targetsProvider: ((impact: Point) => Bubble[]) | null = null): void {
        this.fireMode = active;
        this.fireTargetsProvider = targetsProvider;
        this.lastAngle = null;
        this.lastTexture = null;
    }

}
