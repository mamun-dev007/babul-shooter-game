import { describe, expect, it } from 'vitest';
import { GIFT_CARD_SCALE, giftCardLayout, giftListContentHeight, giftPreferredColumns } from './giftCardLayout';

describe('Gift Item card geometry', () => {
    it('enlarges the canonical 420x210 card by ~80% in both dimensions', () => {
        expect(GIFT_CARD_SCALE).toBeGreaterThanOrEqual(1.75);
        expect(GIFT_CARD_SCALE).toBeLessThanOrEqual(1.85);
        expect(Math.round(420 * GIFT_CARD_SCALE)).toBe(756);
        expect(Math.round(210 * GIFT_CARD_SCALE)).toBe(378);
        expect(Math.round(16 * GIFT_CARD_SCALE)).toBe(29);
        // A single-column wide world hosts the full, unclamped design size.
        const wide = giftCardLayout(1200, 390);
        expect(wide.cardW).toBe(756);
        expect(wide.cardH).toBe(378);
        expect(wide.gap).toBe(29);
    });

    it('fits cards inside every supported screen without clipping or overlap', () => {
        // (label, world width, CSS device width)
        const viewports: Array<[string, number, number]> = [
            ['small phone portrait', 700, 360],
            ['phone portrait', 700, 390],
            ['large phone portrait', 700, 430],
            ['phone landscape', 1385, 844],
            ['iPad portrait', 700, 768],
            ['iPad landscape', 853, 1024],
            ['small desktop', 1138, 1440],
            ['desktop', 1138, 1920],
        ];

        for (const [label, world, device] of viewports) {
            const layout = giftCardLayout(world, device);
            expect(layout.cols, label).toBeGreaterThanOrEqual(1);
            expect(layout.listW, label).toBeLessThanOrEqual(world - 40 + 1);
            expect(layout.cardW, label).toBeGreaterThanOrEqual(120);
            expect(layout.cardH, label).toBe(378);
            expect(layout.gap, label).toBe(29);
            // Grid width is exactly the cards + gaps: no overlapping cards.
            expect(layout.listW, label).toBe(
                layout.cols * layout.cardW + (layout.cols - 1) * layout.gap
            );
            // Internal controls scale with the card, not the whole screen.
            expect(layout.scale, label).toBeCloseTo(layout.cardW / 420, 5);
        }
    });

    it('keeps every gift reachable via vertical scrolling', () => {
        const phone = giftCardLayout(700, 390);
        const content = giftListContentHeight(15, phone);
        expect(content).toBeGreaterThan(960 - 150 - 16);
        expect(content).toBe(15 * phone.cardH + 14 * phone.gap);

        const desktop = giftCardLayout(1138, 1440);
        expect(giftListContentHeight(15, desktop)).toBeGreaterThan(0);
        expect(giftPreferredColumns(390)).toBe(1);
        expect(giftPreferredColumns(768)).toBe(2);
        expect(giftPreferredColumns(1024)).toBe(3);
        expect(giftPreferredColumns(1440)).toBe(4);
    });

    it('uses safe fallbacks for invalid viewport readings', () => {
        const fallback = giftCardLayout(Number.NaN, Number.NaN);
        expect(fallback.cardW).toBeGreaterThan(0);
        expect(fallback.cols).toBeGreaterThanOrEqual(1);
    });
});
