import type { GameObjects } from 'phaser';

export type VectorIcon =
    | 'gear'
    | 'sound'
    | 'music'
    | 'bomb'
    | 'color'
    | 'light'
    | 'fire'
    | 'play'
    | 'info'
    | 'back'
    | 'shell';

/** Runtime list of all drawable vector icon kinds. */
const VECTOR_ICON_KINDS: readonly VectorIcon[] = [
    'gear',
    'sound',
    'music',
    'bomb',
    'color',
    'light',
    'fire',
    'play',
    'info',
    'back',
    'shell',
];

const ICON_HOLE = 0x0b1730;
const MUTED = 0x6f86a8;
const OFF_SLASH = 0xff8fa3;

const drawOffSlash = (graphics: GameObjects.Graphics): void => {
    graphics.lineStyle(2.5, OFF_SLASH, 0.95);
    graphics.lineBetween(-12, 12, 12, -12);
};

/**
 * Small original vector icons drawn with Phaser Graphics. Using vectors keeps
 * the icons crisp at every DPR and avoids adding image assets to the bundle.
 */
/** Runtime check: whether a value names a drawable vector icon. */
export const isVectorIcon = (kind: string | VectorIcon): kind is VectorIcon =>
    VECTOR_ICON_KINDS.includes(kind as VectorIcon);

export const drawVectorIcon = (
    graphics: GameObjects.Graphics,
    kind: VectorIcon,
    color: number,
    enabled = true,
    /** Color for engraved details (e.g. the gear's axle hole) on light backgrounds. */
    detailColor: number = ICON_HOLE
): void => {
    graphics.clear();

    const tint = enabled ? color : MUTED;

    switch (kind) {
        case 'gear': {
            for (let index = 0; index < 8; index++) {
                const angle = (index * Math.PI) / 4;
                graphics.lineStyle(4.5, tint, 1);
                graphics.lineBetween(
                    Math.cos(angle) * 6.5,
                    Math.sin(angle) * 6.5,
                    Math.cos(angle) * 12,
                    Math.sin(angle) * 12
                );
            }

            graphics.lineStyle(3, tint, 1);
            graphics.strokeCircle(0, 0, 8.5);
            graphics.fillStyle(detailColor, 1);
            graphics.fillCircle(0, 0, 4);
            break;
        }

        case 'shell': {
            // Scallop shell: dome facing up with a flat hinge base and ribs.
            graphics.fillStyle(tint, 1);
            graphics.slice(0, 5, 11, Math.PI, Math.PI * 2);
            graphics.fillPath();
            graphics.fillRoundedRect(-11, 3, 22, 5, 2.5);
            graphics.fillStyle(tint, 1);
            graphics.fillCircle(-10, 5.5, 2.5);
            graphics.fillCircle(10, 5.5, 2.5);

            graphics.lineStyle(2, detailColor, 0.55);
            graphics.lineBetween(0, 9.5, 0, -5.5);
            graphics.lineBetween(-1.5, 9, -6.5, -2.5);
            graphics.lineBetween(1.5, 9, 6.5, -2.5);
            break;
        }

        case 'sound': {
            graphics.fillStyle(tint, 1);
            graphics.fillRect(-10, -4.5, 7, 9);
            graphics.fillTriangle(-3, -9, 5, 0, -3, 9);

            graphics.lineStyle(2, tint, 1);
            graphics.arc(4, 0, 6, -0.72, 0.72);
            graphics.strokePath();
            graphics.arc(4, 0, 10.5, -0.72, 0.72);
            graphics.strokePath();

            if (!enabled) {
                drawOffSlash(graphics);
            }
            break;
        }

        case 'music': {
            graphics.fillStyle(tint, 1);
            graphics.fillCircle(-5.5, 5.5, 4.6);
            graphics.fillCircle(5.5, 3.5, 4.6);
            graphics.fillRect(-2.9, -7.5, 2.6, 14.5);
            graphics.fillRect(8.1, -9.5, 2.6, 14.5);
            graphics.fillRect(-2.9, -9.5, 13.6, 3.2);

            if (!enabled) {
                drawOffSlash(graphics);
            }
            break;
        }

        case 'bomb': {
            graphics.fillStyle(tint, 1);
            graphics.fillCircle(0, 2, 8.5);
            graphics.lineStyle(2.5, tint, 1);
            graphics.lineBetween(4, -5, 8, -11);
            graphics.fillStyle(enabled ? 0xffe38a : MUTED, 1);
            graphics.fillCircle(9.5, -12.5, 2.4);
            graphics.fillStyle(0xffffff, enabled ? 0.55 : 0.2);
            graphics.fillCircle(-3, -1.5, 2.2);
            break;
        }

        case 'color': {
            graphics.fillStyle(enabled ? 0xff4d6d : MUTED, 1);
            graphics.fillCircle(-5.5, 4, 6);
            graphics.fillStyle(enabled ? 0xffd166 : MUTED, 1);
            graphics.fillCircle(5.5, 4, 6);
            graphics.fillStyle(enabled ? 0x3a86ff : MUTED, 1);
            graphics.fillCircle(0, -5, 6);
            break;
        }

        case 'light': {
            graphics.lineStyle(4.5, tint, 1);
            graphics.beginPath();
            graphics.moveTo(2.5, -12);
            graphics.lineTo(-5, -1);
            graphics.lineTo(1, -1);
            graphics.lineTo(-3, 12);
            graphics.strokePath();
            break;
        }

        case 'fire': {
            graphics.fillStyle(tint, 1);
            graphics.fillTriangle(-8, 4, 8, 4, 0, -13);
            graphics.fillCircle(0, 4, 8);

            if (enabled) {
                graphics.fillStyle(0xffe38a, 1);
                graphics.fillTriangle(-3.5, 5, 3.5, 5, 0, -3);
                graphics.fillCircle(0, 5, 3.5);
            }
            break;
        }

        case 'play': {
            // Solid rounded play triangle pointing right.
            graphics.fillStyle(tint, 1);
            graphics.fillTriangle(-8, -11, -8, 11, 11, 0);
            break;
        }

        case 'info': {
            graphics.lineStyle(2.4, tint, 1);
            graphics.strokeCircle(0, 0, 11);
            graphics.fillStyle(tint, 1);
            graphics.fillCircle(0, -5.5, 2);
            graphics.fillRect(-1.2, -1.5, 2.4, 10);
            break;
        }

        case 'back': {
            graphics.lineStyle(3.2, tint, 1);
            graphics.beginPath();
            graphics.moveTo(6, -8);
            graphics.lineTo(-6, 0);
            graphics.lineTo(6, 8);
            graphics.strokePath();
            break;
        }
    }
};
