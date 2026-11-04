import type { Bubble } from '../game/objects/Bubble';
import { BUBBLE_COLORS, BUBBLE_RADIUS, type BubbleColorName } from '../game/config';
import { loadProgress } from '../game/utils/storage';

type Emitter = Phaser.GameObjects.Particles.ParticleEmitter;

/**
 * Shared gameplay effects with hard caps. Particle counts scale with the
 * player's graphics preference so low-end phones stay at a stable frame rate.
 */
export class GameEffects {
    private readonly scene: Phaser.Scene;
    private readonly emitters = new Map<BubbleColorName, Emitter>();
    private readonly quality: number;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;

        const setting = loadProgress().graphics ?? 'medium';
        this.quality = setting === 'low' ? 0.55 : setting === 'high' ? 1.3 : 1;

        for (const color of Object.keys(BUBBLE_COLORS) as BubbleColorName[]) {
            this.emitters.set(color, this.createEmitter(color));
        }
    }

    burst(x: number, y: number, color: number, count: number): void {
        const name = this.colorName(color);
        const emitter = name ? this.emitters.get(name) : null;

        if (!emitter || !emitter.active) {
            return;
        }

        const amount = Math.max(2, Math.round(count * this.quality));
        emitter.emitParticleAt(x, y, amount);
    }

    ring(x: number, y: number, color: number): void {
        const ring = this.scene.add
            .image(x, y, 'ring')
            .setDepth(72)
            .setTint(color)
            .setAlpha(0.8)
            .setScale(0.5);

        this.scene.tweens.add({
            targets: ring,
            scaleX: 1.75,
            scaleY: 1.75,
            alpha: 0,
            duration: 230,
            ease: 'Cubic.easeOut',
            onComplete: () => ring.destroy(),
        });
    }

    muzzleFlash(x: number, y: number, color: number): void {
        this.burst(x, y, color, 3);
        this.ring(x, y, color);
    }

    popBubble(bubble: Bubble, delay: number, onComplete: () => void): void {
        const base = bubble.baseScale;
        const { x, y, colorValue } = bubble;

        this.scene.tweens.add({
            targets: bubble,
            scaleX: base * 1.16,
            scaleY: base * 0.9,
            duration: 52,
            delay,
            ease: 'Quad.easeOut',
            onComplete: () => {
                if (!bubble.active) {
                    onComplete();
                    return;
                }

                this.ring(x, y, colorValue);
                this.burst(x, y, colorValue, 7);

                this.scene.tweens.add({
                    targets: bubble,
                    scaleX: base * 1.5,
                    scaleY: base * 1.5,
                    alpha: 0,
                    duration: 155,
                    ease: 'Cubic.easeOut',
                    onComplete: () => {
                        bubble.destroy();
                        onComplete();
                    },
                });
            },
        });
    }

    floatAway(bubble: Bubble, delay: number, onComplete: () => void): void {
        const base = bubble.baseScale;
        const drift = (Math.random() - 0.5) * 52;

        this.burst(bubble.x, bubble.y, bubble.colorValue, 3);

        this.scene.tweens.add({
            targets: bubble,
            x: bubble.x + drift,
            y: bubble.y + 230 + Math.random() * 80,
            rotation: (Math.random() - 0.5) * 2.4,
            scaleX: base * 0.82,
            scaleY: base * 0.82,
            alpha: 0,
            duration: 520 + Math.random() * 140,
            delay,
            ease: 'Quad.easeIn',
            onComplete: () => {
                bubble.destroy();
                onComplete();
            },
        });
    }

    destroy(): void {
        for (const emitter of this.emitters.values()) {
            if (emitter.active) {
                emitter.destroy();
            }
        }

        this.emitters.clear();
    }

    private createEmitter(color: BubbleColorName): Emitter {
        const value = BUBBLE_COLORS[color];
        const speed = BUBBLE_RADIUS * (2.4 + this.quality * 0.6);

        return this.scene.add
            .particles(0, 0, 'spark', {
                emitting: false,
                quantity: 1,
                maxParticles: Math.round(28 * this.quality),
                tint: value,
                speed: { min: speed * 0.6, max: speed * 1.8 },
                angle: { min: 0, max: 360 },
                gravityY: 120,
                lifespan: { min: 220, max: 430 },
                scale: { start: 0.5 * this.quality, end: 0 },
                alpha: { start: 0.95, end: 0 },
                blendMode: 'ADD',
            })
            .setDepth(74);
    }

    private colorName(value: number): BubbleColorName | null {
        for (const [name, color] of Object.entries(BUBBLE_COLORS) as Array<
            [BubbleColorName, number]
        >) {
            if (color === value) {
                return name;
            }
        }

        return null;
    }
}
