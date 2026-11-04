import { Scene } from 'phaser';

/**
 * Generates the BUBBLE SHOOTER 3D cartoon logo as a canvas texture.
 *
 * - Rounded, inflated letters (Baloo 2 ExtraBold when available).
 * - Per-letter playful rotation, baked into the artwork.
 * - Thick dark-purple outer stroke (#431078).
 * - Dark navy extrusion (#17145A) with a deep soft drop shadow.
 * - Per-line gradients: BUBBLE gold->orange, SHOOTER cyan->blue.
 * - Inner shading + glossy top highlights.
 *
 * The texture is transparent-background and drawn at 2x supersampling,
 * then displayed scaled down, so it stays crisp on any screen size.
 */

export const LOGO_TEXTURE_KEY = 'logo-3d';

const BUBBLE_STOPS: Array<[number, string]> = [
    [0, '#FFF69A'],
    [0.42, '#FFD52A'],
    [1, '#FF9200']
];

const SHOOTER_STOPS: Array<[number, string]> = [
    [0, '#A5FFFF'],
    [0.42, '#16DFFF'],
    [1, '#087BFF']
];

// Slightly irregular, playful letter tilts (radians) and vertical jitter.
const ROT_BUBBLE = [-0.055, 0.045, -0.03, 0.05, -0.04, 0.035];
const ROT_SHOOTER = [0.045, -0.05, 0.03, -0.04, 0.05, -0.03, 0.025];
const JITTER_BUBBLE = [0, 4, -3, 3, -2, 3];
const JITTER_SHOOTER = [3, -4, 2, -3, 4, -2, 1];

const OUTLINE_COLOR = '#431078';
const EXTRUDE_COLOR = '#17145A';

interface LineSpec {
    text: string;
    stops: Array<[number, string]>;
    rots: number[];
    jitters: number[];
    targetWidth: number;
    y: number;
}

/**
 * Waits (briefly) for the rounded display font so the logo renders with
 * cartoon letterforms. Falls back to Arial Black when offline.
 */
export async function ensureLogoFont(): Promise<string> {
    const fallback = '"Arial Black", "Trebuchet MS", sans-serif';
    if (typeof document === 'undefined' || !('fonts' in document)) {
        return fallback;
    }
    try {
        await Promise.race([
            document.fonts.load('800 100px "Baloo 2"'),
            new Promise((resolve) => setTimeout(resolve, 2000))
        ]);
        return '"Baloo 2", "Arial Black", sans-serif';
    } catch {
        return fallback;
    }
}

function drawLetter(
    ctx: CanvasRenderingContext2D,
    ch: string,
    cx: number,
    cy: number,
    rotation: number,
    fontSize: number,
    stops: Array<[number, string]>,
    fontFamily: string
): void {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.font = `800 ${fontSize}px ${fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.miterLimit = 2;

    const gradTop = -fontSize * 0.52;
    const gradBottom = fontSize * 0.58;

    // 1) Deep soft drop shadow behind everything.
    ctx.save();
    ctx.shadowColor = 'rgba(6, 4, 28, 0.5)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 18;
    ctx.fillStyle = EXTRUDE_COLOR;
    ctx.fillText(ch, 0, 0);
    ctx.restore();

    // 2) Navy extrusion steps (lower-right diagonal depth).
    ctx.fillStyle = EXTRUDE_COLOR;
    for (let i = 6; i >= 1; i--) {
        ctx.fillText(ch, i * 1.6, i * 1.6);
    }

    // 3) Thick dark-purple outer stroke.
    ctx.lineWidth = fontSize * 0.2;
    ctx.strokeStyle = OUTLINE_COLOR;
    ctx.strokeText(ch, 0, 0);

    // 4) Gradient fill.
    const fill = ctx.createLinearGradient(0, gradTop, 0, gradBottom);
    stops.forEach(([offset, color]) => fill.addColorStop(offset, color));
    ctx.fillStyle = fill;
    ctx.fillText(ch, 0, 0);

    // 5) Inner lower shading (inflated, rounded look).
    const shade = ctx.createLinearGradient(0, gradTop, 0, gradBottom);
    shade.addColorStop(0.5, 'rgba(50, 12, 92, 0)');
    shade.addColorStop(1, 'rgba(50, 12, 92, 0.32)');
    ctx.fillStyle = shade;
    ctx.fillText(ch, 0, 0);

    // 6) Glossy top highlight.
    const gloss = ctx.createLinearGradient(0, gradTop, 0, gradBottom);
    gloss.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
    gloss.addColorStop(0.42, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gloss;
    ctx.fillText(ch, 0, 0);

    ctx.restore();
}

export function buildLogoTexture(scene: Scene, fontFamily: string): void {
    if (scene.textures.exists(LOGO_TEXTURE_KEY)) {
        return;
    }

    const S = 2; // supersample factor for crisp downscaling
    const W = 520;
    const H = 340;
    const canvasTex = scene.textures.createCanvas(LOGO_TEXTURE_KEY, W * S, H * S);
    if (!canvasTex) {
        return;
    }

    const ctx = canvasTex.getContext();
    ctx.scale(S, S);
    ctx.clearRect(0, 0, W, H);

    const lines: LineSpec[] = [
        { text: 'BUBBLE', stops: BUBBLE_STOPS, rots: ROT_BUBBLE, jitters: JITTER_BUBBLE, targetWidth: 430, y: 105 },
        { text: 'SHOOTER', stops: SHOOTER_STOPS, rots: ROT_SHOOTER, jitters: JITTER_SHOOTER, targetWidth: 455, y: 235 }
    ];

    for (const line of lines) {
        // Fit the font size so the line fills its target width.
        const measure = (fs: number): number => {
            ctx.font = `800 ${fs}px ${fontFamily}`;
            let total = 0;
            for (const ch of line.text) {
                total += ctx.measureText(ch).width + fs * 0.03;
            }
            return total - fs * 0.03;
        };
        const fontSize = Math.min(150, 150 * (line.targetWidth / measure(150)));
        ctx.font = `800 ${fontSize}px ${fontFamily}`;

        const widths = [...line.text].map((ch) => ctx.measureText(ch).width);
        const tracking = fontSize * 0.03;
        const total = widths.reduce((sum, w) => sum + w, 0) + tracking * (line.text.length - 1);

        let x = (W - total) / 2;
        for (let i = 0; i < line.text.length; i++) {
            drawLetter(ctx, line.text[i], x + widths[i] / 2, line.y + line.jitters[i], line.rots[i], fontSize, line.stops, fontFamily);
            x += widths[i] + tracking;
        }
    }

    canvasTex.refresh();
}

/** Display width/height for the logo at the game's logical resolution. */
export function logoDisplaySize(scene: Scene, maxWidth = 470): { width: number; height: number } {
    const frame = scene.textures.get(LOGO_TEXTURE_KEY).get();
    const width = maxWidth;
    const height = width * (frame.height / frame.width);
    return { width, height };
}
