import type { Scene } from 'phaser';

const FADE_OUT_EVENT = 'camerafadeoutcomplete';
const DEFAULT_FADE = 200;
const DEFAULT_RGB: [number, number, number] = [5, 10, 25];

/** Tracks scenes that are already mid-transition so taps cannot double-start them. */
const transitionsInFlight = new WeakSet<Scene>();

const beginTransition = (scene: Scene, duration: number): boolean => {
    if (transitionsInFlight.has(scene)) {
        return false;
    }

    transitionsInFlight.add(scene);
    scene.cameras.main.fadeOut(duration, ...DEFAULT_RGB);
    return true;
};

const finishTransition = (scene: Scene): void => {
    transitionsInFlight.delete(scene);
};

/**
 * Fades the camera out and starts another scene once the fade has actually
 * completed. Using the camera event (instead of a timer) keeps the transition
 * safe when a scene is paused, restarted or destroyed.
 */
export const goToScene = (
    scene: Scene,
    key: string,
    data?: object,
    duration = DEFAULT_FADE
): void => {
    if (!beginTransition(scene, duration)) {
        return;
    }

    scene.cameras.main.once(FADE_OUT_EVENT, () => {
        finishTransition(scene);
        scene.scene.start(key, data);
    });
};

export const restartScene = (
    scene: Scene,
    data?: object,
    duration = 180
): void => {
    if (!beginTransition(scene, duration)) {
        return;
    }

    scene.cameras.main.once(FADE_OUT_EVENT, () => {
        finishTransition(scene);
        scene.scene.restart(data);
    });
};

/** Resets the guard and fades in. Call at the start of every scene's create(). */
export const fadeInScene = (
    scene: Scene,
    duration = 240,
    rgb: [number, number, number] = DEFAULT_RGB
): void => {
    finishTransition(scene);
    scene.cameras.main.fadeIn(duration, ...rgb);
};

/** Call from shutdown so a scene instance can be reused safely. */
export const clearTransition = (scene: Scene): void => {
    transitionsInFlight.delete(scene);
};
