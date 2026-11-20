import { describe, expect, it } from 'vitest';
import { paymentPopupLayout } from './paymentPopupLayout';

describe('payment selection popup layout', () => {
    const viewports: Array<[string, number, number]> = [
        ['small phone', 700, 640],
        ['phone', 700, 960],
        ['tablet', 853, 1024],
        ['desktop', 1138, 960],
        ['landscape', 1385, 640],
    ];

    it('keeps the card centred and on-screen at every viewport', () => {
        for (const [label, world, height] of viewports) {
            const layout = paymentPopupLayout(world, height);
            expect(layout.cardW, label).toBeLessThanOrEqual(world - 28 + 1);
            expect(layout.cardH, label).toBeLessThanOrEqual(height - 28 + 1);
            expect(layout.cardX, label).toBeCloseTo(world / 2);
            expect(layout.cardY, label).toBeCloseTo(height / 2);
            expect(layout.cardX - layout.cardW / 2, label).toBeGreaterThanOrEqual(13);
            expect(layout.cardY - layout.cardH / 2, label).toBeGreaterThanOrEqual(13);
        }
    });

    it('scales the card without inverting its proportions', () => {
        const phone = paymentPopupLayout(700, 960);
        const desktop = paymentPopupLayout(1138, 960);
        expect(phone.scale).toBe(1);
        expect(desktop.scale).toBeGreaterThan(phone.scale);
        expect(desktop.cardW).toBeGreaterThan(phone.cardW);
    });

    it('falls back safely for invalid viewport readings', () => {
        const fallback = paymentPopupLayout(Number.NaN, Number.NaN);
        expect(fallback.width).toBe(700);
        expect(fallback.height).toBe(960);
        expect(fallback.cardW).toBeGreaterThan(0);
        expect(fallback.cardH).toBeGreaterThan(0);
    });
});
