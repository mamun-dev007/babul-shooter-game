import { describe, expect, it } from 'vitest';
import {
    advanceProgress,
    COMPLETION_RAMP_MS,
    loadingPercent,
    PRE_COMPLETE_CAP,
    START_RAMP_CAP,
    START_RAMP_MS,
} from './loadingProgress';

const runUntilComplete = (
    startVisible: number,
    loader: number,
    assetsReady: boolean,
    stepMs = 16
): { visible: number; elapsedMs: number; frames: number } => {
    let visible = startVisible;
    let elapsedMs = 0;
    let frames = 0;

    while (visible < 1 && frames < 2000) {
        visible = advanceProgress({ visible, loader, assetsReady, deltaMs: stepMs });
        elapsedMs += stepMs;
        frames += 1;
    }

    return { visible, elapsedMs, frames };
};

describe('smooth loading progress', () => {
    it('starts moving on the first frames even before the loader reports', () => {
        let visible = 0;
        let elapsedMs = 0;

        for (let frame = 0; frame < 6; frame += 1) {
            elapsedMs += 16;
            visible = advanceProgress({
                visible,
                loader: 0,
                assetsReady: false,
                elapsedMs,
                deltaMs: 16,
            });
        }

        expect(visible).toBeGreaterThan(0);
    });

    it('ramps to the small start cap on its own without pretending to finish', () => {
        let visible = 0;
        let elapsedMs = 0;

        for (let frame = 0; frame < 120; frame += 1) {
            elapsedMs += 16;
            visible = advanceProgress({
                visible,
                loader: 0,
                assetsReady: false,
                elapsedMs,
                deltaMs: 16,
            });

            expect(visible).toBeLessThan(1);
        }

        expect(visible).toBeCloseTo(START_RAMP_CAP, 2);
        expect(elapsedMs).toBeGreaterThanOrEqual(START_RAMP_MS);
    });

    it('lets real loader progress overtake the initial ramp', () => {
        let visible = START_RAMP_CAP;
        let elapsedMs = START_RAMP_MS * 4;

        for (let frame = 0; frame < 120; frame += 1) {
            visible = advanceProgress({
                visible,
                loader: 0.6,
                assetsReady: false,
                elapsedMs,
                deltaMs: 16,
            });
            elapsedMs += 16;
        }

        expect(visible).toBeCloseTo(0.6, 1);
    });

    it('never shows 100% while assets are still loading', () => {
        let visible = 0;
        for (let frame = 0; frame < 240; frame += 1) {
            visible = advanceProgress({
                visible,
                loader: 1,
                assetsReady: false,
                deltaMs: 16,
            });

            expect(visible).toBeLessThan(1);
            expect(loadingPercent(visible)).toBeLessThanOrEqual(99);
        }

        expect(visible).toBeCloseTo(PRE_COMPLETE_CAP, 5);
    });

    it('never moves backwards even when the loader reports less', () => {
        let visible = 0.42;
        for (const loader of [0.1, 0.3, 0.2, 0.5, 0.4, 0.8]) {
            const next = advanceProgress({
                visible,
                loader,
                assetsReady: false,
                deltaMs: 16,
            });

            expect(next).toBeGreaterThanOrEqual(visible);
            visible = next;
        }
    });

    it('ramps evenly to 100% on an instant load instead of jumping', () => {
        const result = runUntilComplete(0, 1, true);

        expect(result.visible).toBe(1);
        expect(result.elapsedMs).toBeGreaterThanOrEqual(COMPLETION_RAMP_MS);
        expect(result.elapsedMs).toBeLessThan(2000);
        expect(result.frames).toBeGreaterThan(10);
    });

    it('is roughly halfway through the visual completion at half the ramp', () => {
        let visible = 0;
        let elapsedMs = 0;

        while (elapsedMs < COMPLETION_RAMP_MS / 2) {
            visible = advanceProgress({
                visible,
                loader: 1,
                assetsReady: true,
                deltaMs: 16,
            });
            elapsedMs += 16;
        }

        expect(visible).toBeCloseTo(0.5, 1);
    });

    it('finishes a slow load smoothly without a late snap', () => {
        // The loader completes while the bar already shows 90%.
        const result = runUntilComplete(0.9, 1, true);

        expect(result.visible).toBe(1);
        expect(result.frames).toBeGreaterThanOrEqual(2);
        expect(result.elapsedMs).toBeLessThan(COMPLETION_RAMP_MS);
    });

    it('keeps every intermediate value monotonic and within bounds', () => {
        let visible = 0;
        let previous = 0;

        for (let frame = 0; frame < 300; frame += 1) {
            visible = advanceProgress({
                visible,
                loader: Math.min(1, frame / 60),
                assetsReady: frame >= 120,
                deltaMs: 16,
            });

            expect(visible).toBeGreaterThanOrEqual(previous);
            expect(visible).toBeLessThanOrEqual(1);
            if (frame < 120) {
                expect(visible).toBeLessThan(1);
            }
            previous = visible;
        }

        expect(visible).toBe(1);
    });

    it('formats 100 only once genuinely complete', () => {
        expect(loadingPercent(0)).toBe(0);
        expect(loadingPercent(0.1)).toBe(10);
        expect(loadingPercent(0.99)).toBe(99);
        expect(loadingPercent(0.999)).toBe(99);
        expect(loadingPercent(1)).toBe(100);
    });
});
