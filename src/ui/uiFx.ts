import type { GameObjects, Scene } from 'phaser';

export interface PressFxOptions {
    hoverScale?: number;
    pressScale?: number;
    hoverDuration?: number;
    releaseDuration?: number;
}

/**
 * Lightweight hover/press animation that always cancels the previous scale
 * tween first. Cancellation makes it safe to tap rapidly or leave the scene
 * while a button is animating.
 */
type FxTarget = GameObjects.GameObject & GameObjects.Components.Transform;

export const addPressFx = (
    scene: Scene,
    hit: GameObjects.GameObject,
    target: FxTarget,
    options: PressFxOptions = {}
): void => {
    const hoverScale = options.hoverScale ?? 1.05;
    const pressScale = options.pressScale ?? 0.95;
    const hoverDuration = options.hoverDuration ?? 120;
    const releaseDuration = options.releaseDuration ?? 140;
    let hovering = false;

    const animate = (scale: number, duration: number): void => {
        if (!target.active) {
            return;
        }

        scene.tweens.killTweensOf(target);
        scene.tweens.add({
            targets: target,
            scaleX: scale,
            scaleY: scale,
            duration,
            ease: 'Quad.easeOut',
        });
    };

    hit.on('pointerover', () => {
        hovering = true;
        animate(hoverScale, hoverDuration);
    });

    hit.on('pointerout', () => {
        hovering = false;
        animate(1, releaseDuration);
    });

    hit.on('pointerdown', () => {
        animate(pressScale, 60);
    });

    hit.on('pointerup', () => {
        animate(hovering ? hoverScale : 1, 90);
    });
};
