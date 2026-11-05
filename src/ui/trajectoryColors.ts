import { BUBBLE_COLORS, shade, type BubbleColorName } from '../game/config';

/**
 * Per-colour trajectory palette sampled from the real bubble artwork
 * gradients (public/assets/bubbles/bubble-*.svg, 0/60/85/100 % stops). The
 * three sampled tones mirror each bubble's own gradient so the dotted guide
 * always renders in the exact colours of the bubble that will launch:
 *
 * - `dot`       = main body colour (the 85 % gradient stop, i.e. what the
 *                 bubble itself reads as on screen),
 * - `halo`      = deep edge colour (100 % stop — the dark rim),
 * - `highlight` = bright inner colour (60 % stop — the glossy top light),
 * - `impact`    = main body colour for the impact marker, plus its deep edge
 *                 for the outline.
 *
 * `dot` is never a fixed colour — it changes with the shooter's loaded
 * bubble, and `AimGuide` re-samples it whenever the loaded colour changes.
 */
interface ArtworkStops {
    /** Bright inner gradient stop (glossy highlight tone). */
    bright: number;
    /** Main body gradient stop (the bubble's perceived colour). */
    main: number;
    /** Deep edge gradient stop (dark rim tone). */
    deep: number;
}

/** Deep rim of the orange fallback, derived from the canonical config hue. */
const ORANGE_DEEP = shade(BUBBLE_COLORS.orange, -64);
/** Bright gloss of the orange fallback, derived from the canonical config hue. */
const ORANGE_BRIGHT = shade(BUBBLE_COLORS.orange, 48);

const ARTWORK_STOPS: Record<BubbleColorName, ArtworkStops> = {
    red: { bright: 0xff454f, main: 0xd73535, deep: 0xb71c1c },
    // No dedicated orange artwork is shipped yet; the tones are derived from
    // the canonical config orange so dots stay consistent if it is served.
    orange: { bright: ORANGE_BRIGHT, main: BUBBLE_COLORS.orange, deep: ORANGE_DEEP },
    yellow: { bright: 0xffe38a, main: 0xffc928, deep: 0xf57f17 },
    green: { bright: 0x66bb6a, main: 0x38d94a, deep: 0x2e7d32 },
    blue: { bright: 0x4fc8f5, main: 0x168bff, deep: 0x0d47a1 },
    purple: { bright: 0xb39ddb, main: 0x692bc2, deep: 0x4a148c },
};

export interface TrajectoryPalette {
    /** Outer halo dot — the bubble's deep edge colour, drawn at low alpha. */
    halo: number;
    /** Core dot — exactly the loaded bubble's colour. */
    dot: number;
    /** Specular highlight — the bubble's bright inner colour. */
    highlight: number;
    /** Impact-marker fill — the loaded bubble's colour, drawn at low alpha. */
    impactFill: number;
    /** Impact-marker stroke — the bubble's deep edge colour. */
    impactStroke: number;
}

export const trajectoryPalette = (color: BubbleColorName): TrajectoryPalette => {
    const stops = ARTWORK_STOPS[color];

    return {
        halo: stops.deep,
        dot: stops.main,
        highlight: stops.bright,
        impactFill: stops.main,
        impactStroke: stops.deep,
    };
};
