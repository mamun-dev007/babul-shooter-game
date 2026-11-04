import { describe, expect, it } from 'vitest';
import {
    boardScrollMetrics,
    clampScrollOffset,
    offsetForRatio,
    scrollRatio,
} from './gridScroll';

const metricsFor = (contentBottom: number, contentTop = 100, viewTop = 100, viewBottom = 700) =>
    boardScrollMetrics(contentTop, contentBottom, viewTop, viewBottom);

describe('board scroll math', () => {
    it('never scrolls when the formation already ends above the viewport middle', () => {
        // Content bottom (300) is above the viewport middle (400): the
        // formation stays ceiling-aligned.
        const metrics = metricsFor(300);

        expect(metrics.minOffset).toBe(0);
        expect(clampScrollOffset(-50, metrics)).toBe(0);
        expect(scrollRatio(-50, metrics)).toBe(0);
        expect(offsetForRatio(1, metrics)).toBe(0);
    });

    it('anchors a formation that reaches below the middle at the middle', () => {
        const metrics = metricsFor(600);

        // The frontier may rise exactly to the viewport middle (400), keeping
        // the lower half open for the shooter.
        expect(metrics.minOffset).toBe(-200);
        expect(clampScrollOffset(-999, metrics)).toBe(-200);
        expect(clampScrollOffset(20, metrics)).toBe(0);
    });

    it('raises tall content until its frontier sits at the viewport middle', () => {
        const metrics = metricsFor(1000);

        expect(metrics.contentHeight).toBe(900);
        expect(metrics.viewHeight).toBe(600);
        expect(metrics.minOffset).toBe(-600);

        // Frontier = contentBottom + minOffset = 1000 - 600 = 400 (middle).
        expect(clampScrollOffset(-999, metrics)).toBe(-600);
        expect(clampScrollOffset(20, metrics)).toBe(0);
    });

    it('maps scroll offsets to a 0..1 ratio and back', () => {
        const metrics = metricsFor(1000);

        expect(scrollRatio(0, metrics)).toBe(0);
        expect(scrollRatio(-300, metrics)).toBe(0.5);
        expect(scrollRatio(-600, metrics)).toBe(1);
        expect(offsetForRatio(0, metrics)).toBe(0);
        expect(offsetForRatio(0.5, metrics)).toBe(-300);
        expect(offsetForRatio(1, metrics)).toBe(-600);
        expect(offsetForRatio(5, metrics)).toBe(-600);
        expect(offsetForRatio(-5, metrics)).toBe(0);
    });

    it('treats non-finite values as the safe top position', () => {
        const metrics = metricsFor(1000);

        expect(clampScrollOffset(Number.NaN, metrics)).toBe(0);
        expect(offsetForRatio(Number.NaN, metrics)).toBe(0);
    });
});
