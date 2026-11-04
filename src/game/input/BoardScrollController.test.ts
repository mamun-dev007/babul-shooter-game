import { describe, expect, it, vi } from 'vitest';
import {
    BoardScrollController,
    decayedVelocity,
    shouldStartBoardScroll,
} from './BoardScrollController';

type Handler = (pointer: FakePointer) => void;

interface FakePointer {
    id: number;
    x: number;
    y: number;
}

interface FakeScene {
    input: {
        on: (name: string, handler: Handler, context: unknown) => void;
        off: (name: string, handler: Handler, context: unknown) => void;
    };
}

const makeHarness = (canScroll = true): {
    scene: FakeScene;
    dispatch: (name: string, pointer: FakePointer) => void;
    grid: { scrollBy: (delta: number) => void; moves: number[] };
    onScrollStart: () => void;
    controller: BoardScrollController;
} => {
    const handlers = new Map<string, { handler: Handler; context: unknown }>();
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
        },
    };
    const moves: number[] = [];
    const grid = { scrollBy: (delta: number) => moves.push(delta), moves };
    const onScrollStart = vi.fn();
    const controller = new BoardScrollController(scene as unknown as Phaser.Scene, {
        grid: grid as never,
        canScroll: () => canScroll,
        onScrollStart,
    });

    return {
        scene,
        dispatch: (name, pointer) => {
            const entry = handlers.get(name);
            entry?.handler.call(entry.context, pointer);
        },
        grid,
        onScrollStart,
        controller,
    };
};

const at = (id: number, x: number, y: number): FakePointer => ({ id, x, y });

describe('board scroll gesture', () => {
    it('requires a vertical-dominant drag past the threshold', () => {
        expect(shouldStartBoardScroll(0, 14)).toBe(true);
        expect(shouldStartBoardScroll(-6, 16)).toBe(true);
        expect(shouldStartBoardScroll(40, 14)).toBe(false);
        expect(shouldStartBoardScroll(0, 6)).toBe(false);
    });

    it('decays inertia below the stop speed', () => {
        expect(decayedVelocity(300, 16)).toBeCloseTo(300 * Math.exp(-0.0031 * 16), 5);
        expect(decayedVelocity(20, 16)).toBe(0);
        expect(decayedVelocity(-50, 2000)).toBe(0);
    });

    it('scrolls the existing board on a vertical drag, never before the threshold', () => {
        const harness = makeHarness();

        harness.dispatch('pointerdown', at(1, 270, 400));
        harness.dispatch('pointermove', at(1, 270, 406));
        expect(harness.grid.moves).toEqual([]);
        expect(harness.onScrollStart).not.toHaveBeenCalled();

        harness.dispatch('pointermove', at(1, 270, 422));
        expect(harness.grid.moves).toEqual([16]);
        expect(harness.onScrollStart).toHaveBeenCalledTimes(1);
        expect(harness.controller.isDragging).toBe(true);
    });

    it('ignores horizontal drags and moves the drag amount 1:1', () => {
        const harness = makeHarness();

        harness.dispatch('pointerdown', at(1, 270, 400));
        harness.dispatch('pointermove', at(1, 320, 404));
        expect(harness.grid.moves).toEqual([]);
        expect(harness.controller.isDragging).toBe(false);
    });

    it('tracks a second pointer only from its own press id', () => {
        const harness = makeHarness();

        harness.dispatch('pointerdown', at(1, 270, 400));
        harness.dispatch('pointermove', at(2, 270, 430));
        expect(harness.grid.moves).toEqual([]);

        harness.dispatch('pointermove', at(1, 270, 415));
        expect(harness.grid.moves).toEqual([15]);
    });

    it('ends the drag on pointer-up and glides with tracked velocity through update()', () => {
        const harness = makeHarness();

        harness.dispatch('pointerdown', at(1, 270, 400));
        harness.dispatch('pointermove', at(1, 270, 420));
        harness.dispatch('pointerup', at(1, 270, 420));

        expect(harness.controller.isDragging).toBe(false);
        expect(harness.controller.isEngaged).toBe(true);

        harness.controller.update(50);
        expect(harness.grid.moves.length).toBeGreaterThan(1);

        // The glide always settles to a complete stop.
        for (let step = 0; step < 400; step++) {
            harness.controller.update(16);
        }

        expect(harness.controller.isEngaged).toBe(false);
    });

    it('stops cleanly when scrolling is disallowed', () => {
        const harness = makeHarness(false);

        harness.dispatch('pointerdown', at(1, 270, 400));
        harness.dispatch('pointermove', at(1, 270, 430));
        harness.dispatch('pointerup', at(1, 270, 430));
        harness.controller.update(16);

        expect(harness.grid.moves).toEqual([]);
        expect(harness.controller.isEngaged).toBe(false);
    });
});
