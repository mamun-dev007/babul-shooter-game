import { describe, expect, it } from 'vitest';
import { STARTER_POPUP_SCALE, starterPopupGeometry } from './starterPopupLayout';

describe('Starter Popup geometry', () => {
    it('enlarges the 340x470 popup by ~80%', () => {
        expect(STARTER_POPUP_SCALE).toBeGreaterThanOrEqual(1.75);
        expect(STARTER_POPUP_SCALE).toBeLessThanOrEqual(1.85);
        const phone = starterPopupGeometry(700, 960);
        expect(phone.designWidth).toBe(612);
        expect(phone.designHeight).toBe(846);
        expect(phone.width).toBe(612);
        expect(phone.height).toBe(846);
        expect(phone.scrollable).toBe(false);
    });

    it('fits the screen in portrait and landscape without clipping', () => {
        const viewports: Array<[string, number, number]> = [
            ['small phone portrait', 700, 800],
            ['phone portrait', 700, 960],
            ['large phone portrait', 700, 1180],
            ['phone landscape', 1385, 640],
            ['tablet portrait', 700, 1024],
            ['tablet landscape', 853, 640],
            ['desktop', 1138, 960],
        ];

        for (const [label, world, height] of viewports) {
            const geo = starterPopupGeometry(world, height);
            expect(geo.width, label).toBeLessThanOrEqual(world - 32 + 1);
            expect(geo.height, label).toBeLessThanOrEqual(height - 1);
            expect(geo.width, label).toBeGreaterThan(160);
            expect(geo.height, label).toBeGreaterThan(200);
            // Horizontally centred with equal margins.
            expect((world - geo.width) / 2, label).toBeGreaterThanOrEqual(15);
        }
    });

    it('uses internal scrolling when the enlarged card cannot fit vertically', () => {
        const landscape = starterPopupGeometry(1385, 640);
        expect(landscape.scrollable).toBe(true);
        expect(landscape.height).toBeLessThan(landscape.designHeight);
        expect(landscape.width).toBe(612);
        // Portrait keeps the full design; no scrolling layer needed.
        expect(starterPopupGeometry(700, 960).scrollable).toBe(false);
    });

    it('falls back safely for invalid viewport readings', () => {
        const fallback = starterPopupGeometry(Number.NaN, Number.NaN);
        expect(fallback.width).toBeGreaterThan(0);
        expect(fallback.height).toBeGreaterThan(0);
    });
});
