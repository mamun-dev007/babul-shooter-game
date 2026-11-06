import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({
    Input: { Keyboard: { JustDown: vi.fn(() => false) } },
}));

import { AimController } from './AimController';
import {
    acquireModalInputLock,
    isModalInputLocked,
    releaseModalInputLock,
    resetModalInputLock,
} from './modalInputLock';

type PointerLike = {
    id: number;
    x: number;
    y: number;
    button: number;
    isDown: boolean;
};

type Handler = (pointer: PointerLike) => void;

interface FakeScene {
    input: {
        on: (name: string, handler: Handler, context: unknown) => void;
        off: (name: string, handler: Handler, context: unknown) => void;
        hitTestPointer: () => [];
        keyboard: null;
        manager: { pointers: PointerLike[] };
    };
}

const makeHarness = (canAimValue = true, canFireValue = true) => {
    const handlers = new Map<string, { handler: Handler; context: unknown }>();
    const pointer: PointerLike = { id: 1, x: 270, y: 400, button: 0, isDown: false };
    const scene: FakeScene = {
        input: {
            on: vi.fn((name: string, handler: Handler, context: unknown) => {
                handlers.set(name, { handler, context });
            }),
            off: vi.fn((name: string, handler: Handler) => {
                const entry = handlers.get(name);
                if (entry && entry.handler === handler) {
                    handlers.delete(name);
                }
            }),
            hitTestPointer: () => [],
            keyboard: null,
            manager: { pointers: [pointer] },
        },
    };
    const shooter = { setAimAt: vi.fn(), rotateAim: vi.fn() };
    const onFire = vi.fn();
    const onPause = vi.fn();
    let canAim = canAimValue;
    let canFire = canFireValue;
    const controller = new AimController(scene as unknown as Phaser.Scene, {
        shooter: shooter as never,
        canAim: () => canAim,
        canFire: () => canFire,
        onFire,
        onPause,
    });

    const dispatch = (name: string, id: number, x: number, y: number, isDown: boolean) => {
        pointer.id = id;
        pointer.x = x;
        pointer.y = y;
        pointer.isDown = isDown;
        const entry = handlers.get(name);
        entry?.handler.call(entry.context, pointer);
    };

    return {
        scene,
        pointer,
        dispatch,
        markDown: (id: number, x: number, y: number) => {
            pointer.id = id;
            pointer.x = x;
            pointer.y = y;
            pointer.isDown = true;
        },
        shooter,
        onFire,
        controller,
        setCanAim: (v: boolean) => {
            canAim = v;
        },
        setCanFire: (v: boolean) => {
            canFire = v;
        },
    };
};

afterEach(() => {
    resetModalInputLock();
});

describe('modal input lock', () => {
    it('locks and unlocks', () => {
        expect(isModalInputLocked()).toBe(false);
        acquireModalInputLock('pause');
        expect(isModalInputLocked()).toBe(true);
        releaseModalInputLock('pause');
        expect(isModalInputLocked()).toBe(false);
    });
});

describe('AimController with modal lock', () => {
    it('fires a normal playfield press-release', () => {
        const harness = makeHarness();
        harness.dispatch('pointerdown', 1, 270, 400, true);
        harness.dispatch('pointerup', 1, 270, 400, false);
        expect(harness.onFire).toHaveBeenCalledTimes(1);
        expect(harness.shooter.setAimAt).toHaveBeenCalled();
    });

    it('never arms or fires while a modal is open', () => {
        const harness = makeHarness();
        acquireModalInputLock('pause');
        harness.dispatch('pointerdown', 1, 270, 400, true);
        harness.dispatch('pointermove', 1, 270, 300, true);
        harness.dispatch('pointerup', 1, 270, 400, false);
        expect(harness.onFire).not.toHaveBeenCalled();
        expect(harness.shooter.setAimAt).not.toHaveBeenCalled();
    });

    it('does not fire when the same pointer closes the modal (resume case)', () => {
        const harness = makeHarness();
        acquireModalInputLock('pause');
        harness.setCanAim(false);
        harness.setCanFire(false);
        // Resume button gameobject pointerdown runs first: the pointer is
        // already down when it closes the popup and cancels input.
        harness.markDown(1, 270, 400);
        harness.controller.cancelPointerInput();
        releaseModalInputLock('pause');
        harness.setCanAim(true);
        harness.setCanFire(true);
        // The scene-level pointerdown for that same gesture runs next.
        harness.dispatch('pointerdown', 1, 270, 400, true);
        harness.dispatch('pointermove', 1, 270, 300, true);
        // Release must not fire a background bubble.
        harness.dispatch('pointerup', 1, 270, 400, false);
        expect(harness.onFire).not.toHaveBeenCalled();
        expect(harness.shooter.setAimAt).not.toHaveBeenCalled();

        // A fresh press after the release works normally again.
        harness.dispatch('pointerdown', 1, 270, 400, true);
        harness.dispatch('pointerup', 1, 270, 400, false);
        expect(harness.onFire).toHaveBeenCalledTimes(1);
    });

    it('cancels an armed press when pause opens under it', () => {
        const harness = makeHarness();
        harness.dispatch('pointerdown', 1, 270, 400, true);
        // Pause popup opens mid-press; the scene cancels the armed press.
        acquireModalInputLock('pause');
        harness.setCanAim(false);
        harness.setCanFire(false);
        harness.controller.cancelPointerInput();
        harness.dispatch('pointerup', 1, 270, 400, false);
        expect(harness.onFire).not.toHaveBeenCalled();

        releaseModalInputLock('pause');
        harness.setCanAim(true);
        harness.setCanFire(true);
        harness.dispatch('pointerdown', 1, 270, 400, true);
        harness.dispatch('pointerup', 1, 270, 400, false);
        expect(harness.onFire).toHaveBeenCalledTimes(1);
    });
});
