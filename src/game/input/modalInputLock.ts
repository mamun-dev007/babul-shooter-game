/**
 * Centralized modal/gameplay input lock.
 *
 * Every modal popup (pause, settings, game-over, level select, …) registers
 * itself here while it is visible; gameplay input (aim / shoot) is locked
 * for as long as any modal is open. AimController checks
 * `isModalInputLocked()` before arming, aiming or firing, so popup clicks
 * can never leak through to the bubble launcher — no matter which modal
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
};
