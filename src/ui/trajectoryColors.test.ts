import { describe, expect, it } from 'vitest';
import { COLOR_NAMES } from '../game/config';
import { trajectoryPalette } from './trajectoryColors';

describe('trajectory palette', () => {
    it('matches each bubble artwork colour exactly', () => {
        // Dots must render in the bubble artwork's main body colour, not a
        // fixed guide colour. Values mirror the SVG gradients in
        // public/assets/bubbles/bubble-*.svg.
        expect(trajectoryPalette('red').dot).toBe(0xd73535);
        expect(trajectoryPalette('blue').dot).toBe(0x168bff);
        expect(trajectoryPalette('green').dot).toBe(0x38d94a);
        expect(trajectoryPalette('yellow').dot).toBe(0xffc928);
        expect(trajectoryPalette('purple').dot).toBe(0x692bc2);
        expect(trajectoryPalette('orange').dot).toBe(0xff9f1c);
    });

    it('re-tints the whole indicator per colour (halo, highlight, impact)', () => {
        expect(trajectoryPalette('red').halo).toBe(0xb71c1c);
        expect(trajectoryPalette('red').highlight).toBe(0xff454f);
        expect(trajectoryPalette('red').impactFill).toBe(0xd73535);
        expect(trajectoryPalette('red').impactStroke).toBe(0xb71c1c);

        expect(trajectoryPalette('blue')).toEqual({
            halo: 0x0d47a1,
            dot: 0x168bff,
            highlight: 0x4fc8f5,
            impactFill: 0x168bff,
            impactStroke: 0x0d47a1,
        });
    });

    it('gives every supported colour its own distinct palette', () => {
        const palettes = COLOR_NAMES.map((color) => trajectoryPalette(color));

        for (const palette of palettes) {
            expect(palette.dot).not.toBe(palette.halo);
            expect(palette.dot).not.toBe(palette.highlight);
        }

        const dotColours = new Set(palettes.map((palette) => palette.dot));
        expect(dotColours.size).toBe(palettes.length);
    });

    it('derives a consistent orange fallback from the canonical colour', () => {
        // Orange bubble artwork is not shipped yet; its tones must still
        // follow the canonical orange hue rather than a foreign one.
        const palette = trajectoryPalette('orange');

        expect(palette.highlight).not.toBe(0xff9f1c);
        expect(palette.halo).not.toBe(0xff9f1c);
        expect(palette.dot).toBe(0xff9f1c);
    });
});
