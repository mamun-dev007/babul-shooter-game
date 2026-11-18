import { describe, expect, it } from 'vitest';
import {
    LEVEL_BREAKPOINTS,
    cssViewportWidth,
    hidesInGameBackButton,
    hidesInGameBackButtonForSize,
    isMobileLevelWidth,
    levelBreakpointForWidth,
    levelButtonScale,
} from './levelBreakpoints';

describe('Level Section responsive breakpoints', () => {
    it('matches the exact requested phone bands', () => {
        const expected: Array<[number, string, number]> = [
            [320, 'xs-mobile', 1.3],
            [359, 'xs-mobile', 1.3],
            [360, 'small-mobile', 1.42],
            [375, 'small-mobile', 1.42],
            [389, 'small-mobile', 1.42],
            [390, 'standard-mobile', 1.55],
            [414, 'standard-mobile', 1.55],
            [429, 'standard-mobile', 1.55],
            [430, 'large-mobile', 1.58],
            [540, 'large-mobile', 1.58],
            [599, 'large-mobile', 1.58],
        ];

        for (const [width, id, scale] of expected) {
            const band = levelBreakpointForWidth(width);
            expect({ width, id: band.id, scale: band.buttonScale }).toEqual({ width, id, scale });
            expect(levelButtonScale(width)).toBe(scale);
            expect(isMobileLevelWidth(width)).toBe(true);
        }
    });

    it('leaves the existing tablet and desktop layouts at scale 1', () => {
        const expected: Array<[number, string]> = [
            [600, 'small-tablet'],
            [767, 'small-tablet'],
            [768, 'tablet'],
            [1023, 'tablet'],
            [1024, 'desktop'],
            [1440, 'desktop'],
            [2560, 'desktop'],
        ];

        for (const [width, id] of expected) {
            expect(levelBreakpointForWidth(width).id).toBe(id);
            expect(levelButtonScale(width)).toBe(1);
            expect(isMobileLevelWidth(width)).toBe(false);
        }
    });

    it('has no gaps or overlaps between adjacent bands', () => {
        for (let index = 0; index < LEVEL_BREAKPOINTS.length - 1; index++) {
            const current = LEVEL_BREAKPOINTS[index];
            const next = LEVEL_BREAKPOINTS[index + 1];

            expect(next.minWidth).toBe(current.maxWidth ?? Infinity);
            expect(current.maxWidth).not.toBeNull();
            expect(next.maxWidth === null || next.maxWidth > next.minWidth).toBe(true);
        }
    });

    it('rounds fractional CSS widths into the correct band', () => {
        expect(levelBreakpointForWidth(359.9).id).toBe('xs-mobile');
        expect(levelBreakpointForWidth(359.999).id).toBe('xs-mobile');
        expect(levelBreakpointForWidth(360.1).id).toBe('small-mobile');
        expect(levelBreakpointForWidth(429.5).id).toBe('standard-mobile');
        expect(levelBreakpointForWidth(430.5).id).toBe('large-mobile');
        expect(levelBreakpointForWidth(599.9).id).toBe('large-mobile');
        expect(levelBreakpointForWidth(600.1).id).toBe('small-tablet');
    });

    it('keeps a sane fallback for tiny or invalid widths', () => {
        // Narrower than the 320px test floor still uses the smallest phone band.
        expect(levelBreakpointForWidth(0).id).toBe('xs-mobile');
        expect(levelBreakpointForWidth(280).id).toBe('xs-mobile');
        // Invalid values must not resize buttons; desktop baseline is safest.
        expect(levelBreakpointForWidth(Number.NaN).id).toBe('desktop');
        expect(levelBreakpointForWidth(Number.POSITIVE_INFINITY).id).toBe('desktop');
        expect(levelButtonScale(Number.NaN)).toBe(1);
    });

    it('has a live CSS-width reader that works without a DOM', () => {
        // Under Vitest there is no window: fall back to the desktop baseline
        // (1024px, scale 1) so headless builds never inflate the UI.
        expect(cssViewportWidth()).toBe(1024);
        expect(levelButtonScale(cssViewportWidth())).toBe(1);
    });
});

describe('In-game Back button visibility', () => {
    it('hides drawn Back buttons only on phone breakpoints', () => {
        for (const width of [320, 359, 360, 389, 390, 429, 430, 599]) {
            expect(hidesInGameBackButton(width)).toBe(true);
        }
        for (const width of [600, 768, 1024, 1440]) {
            expect(hidesInGameBackButton(width)).toBe(false);
        }
    });

    it('treats landscape phones as mobile and leaves tablets/desktops intact', () => {
        // Common phone sizes in both rotations.
        expect(hidesInGameBackButtonForSize(390, 844)).toBe(true);
        expect(hidesInGameBackButtonForSize(844, 390)).toBe(true);
        expect(hidesInGameBackButtonForSize(430, 932)).toBe(true);
        expect(hidesInGameBackButtonForSize(932, 430)).toBe(true);
        // Landscape width alone exceeds 600px; the shorter side decides.
        expect(hidesInGameBackButton(844)).toBe(false);
        // Tablets and desktops keep their existing Back buttons.
        expect(hidesInGameBackButtonForSize(768, 1024)).toBe(false);
        expect(hidesInGameBackButtonForSize(1024, 768)).toBe(false);
        expect(hidesInGameBackButtonForSize(1920, 1080)).toBe(false);
    });

    it('keeps a non-mobile fallback for invalid viewport readings', () => {
        expect(hidesInGameBackButtonForSize(Number.NaN, 800)).toBe(false);
        expect(hidesInGameBackButtonForSize(0, 0)).toBe(false);
    });
});
