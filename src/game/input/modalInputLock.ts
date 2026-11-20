/**
 * Centralized modal/gameplay input lock.
 *
 * Every modal popup (pause, settings, game-over, level select, -) registers
 * itself here while it is visible; gameplay input (aim / shoot) is locked
 * for as long as any modal is open. AimController checks
 * `isModalInputLocked()` before arming, aiming or firing, so popup clicks
 * can never leak through to the bubble launcher - no matter which modal
 * opened or which control (mouse or touchscreen) was used. The lock is a
 * pure, scene-independent state holder: GameScene resets it on create and
 * shutdown so a stale modal from a previous attempt can never wedge the
 * next one.
 */

const openModals = new Set<string>();

export const acquireModalInputLock = (id: string): void => {
    openModals.add(id);
};

export const releaseModalInputLock = (id: string): void => {
    openModals.delete(id);
};

export const isModalInputLocked = (): boolean => openModals.size > 0;

/** Clears every registered modal (scene boot / shutdown). */
export const resetModalInputLock = (): void => {
    openModals.clear();
    suppressedPointerId = null;
};

/**
 * Pointer ownership for popup close actions.
 *
 * A Phaser popup that closes on `pointerdown` is destroyed before the same
 * touch's `pointerup` arrives. Without a guard that release falls through to
 * whatever interactive object is now underneath (a level node, a side
 * button, ...) and activates it. Every popup action therefore registers the
 * closing pointer here; background handlers ask `isPointerReleaseSuppressed`
 * and ignore that one release. The suppression is cleared by the next fresh
 * `pointerdown`, so a brand new tap works normally.
 */
let suppressedPointerId: number | null = null;

export const suppressPointerRelease = (pointerId: number): void => {
    suppressedPointerId = pointerId;
};

export const isPointerReleaseSuppressed = (pointerId: number): boolean =>
    suppressedPointerId === pointerId;

export const clearPointerSuppression = (pointerId: number): void => {
    if (suppressedPointerId === pointerId) {
        suppressedPointerId = null;
    }
};