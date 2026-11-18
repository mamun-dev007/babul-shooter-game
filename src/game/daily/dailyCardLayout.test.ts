import { describe, expect, it } from 'vitest';
import { DAILY_CARD_SCALE, dailyCardContentHeight, dailyCardLayout } from './dailyCardLayout';

describe('Daily Task card geometry', () => {
    it('makes cards ~80% larger than the 420x116 original', () => {
        expect(DAILY_CARD_SCALE).toBeGreaterThanOrEqual(1.75);
        expect(DAILY_CARD_SCALE).toBeLessThanOrEqual(1.85);
        const layout = dailyCardLayout(2000);
        expect(layout.width).toBe(Math.round(420 * DAILY_CARD_SCALE));
        expect(layout.height).toBe(Math.round(116 * DAILY_CARD_SCALE));
        expect(layout.gap).toBe(Math.round(16 * DAILY_CARD_SCALE));
    });

    it('keeps every card inside the screen across phones, tablets and desktops', () => {
        // Portrait and landscape world widths produced by computeWorldSize.
        const widths = [
            320, 360, 390, 414, 430, 540, 599, 640, 700, 768, 800, 932, 1024, 1138, 1400, 1920,
        ];
        for (const width of widths) {
            const layout = dailyCardLayout(width);
            expect(layout.width).toBeLessThanOrEqual(width - 40);
            expect(layout.width).toBeGreaterThan(100);
            expect(layout.height).toBeGreaterThan(116);
            expect(layout.gap).toBeGreaterThan(16);
        }
    });

    it('scrolls when the larger cards exceed the available screen height', () => {
        const phone = dailyCardLayout(700);
        const content = dailyCardContentHeight(9, phone);
        const visible = 960 - 150 - 16;
        expect(content).toBeGreaterThan(visible);
        // Spacing between cards is preserved, not collapsed.
        expect(content).toBe(9 * phone.height + 8 * phone.gap);
        expect(phone.gap).toBeGreaterThanOrEqual(29);
    });

    it('falls back safely for invalid world widths', () => {
        expect(dailyCardLayout(Number.NaN).width).toBeGreaterThan(0);
        expect(dailyCardLayout(0).width).toBeGreaterThan(0);
    });
});
