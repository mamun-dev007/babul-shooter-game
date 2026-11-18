import type { GameObjects } from 'phaser';
import {
    LAUNCHER_BASE_RADIUS,
    LAUNCHER_SCALE,
    LAUNCHER_SIDE_CONTROL_RADIUS,
    SHOOTER_TOP_CLEARANCE,
} from '../game/layout';

interface GradientStop {
    readonly at: number;
    readonly color: number;
}

interface DiscPalette {
    readonly glow: number;
    readonly shadow: number;
    readonly rim: number;
    readonly stops: readonly GradientStop[];
}

const mixColor = (from: number, to: number, t: number): number => {
    const fr = (from >> 16) & 0xff;
    const fg = (from >> 8) & 0xff;
    const fb = from & 0xff;
    const tr = (to >> 16) & 0xff;
    const tg = (to >> 8) & 0xff;
    const tb = to & 0xff;

    return (
        (Math.round(fr + (tr - fr) * t) << 16) |
        (Math.round(fg + (tg - fg) * t) << 8) |
        Math.round(fb + (tb - fb) * t)
    );
};

const sampleGradient = (stops: readonly GradientStop[], t: number): number => {
    for (let index = 1; index < stops.length; index += 1) {
        const previous = stops[index - 1];
        const next = stops[index];

        if (t <= next.at) {
            const span = Math.max(0.0001, next.at - previous.at);
            return mixColor(previous.color, next.color, (t - previous.at) / span);
        }
    }

    return stops[stops.length - 1].color;
};

const drawPremiumDisc = (
    graphics: GameObjects.Graphics,
    radius: number,
    palette: DiscPalette
): void => {
    graphics.fillStyle(palette.glow, 0.13);
    graphics.fillCircle(0, 0, radius + 6);

    graphics.fillStyle(palette.shadow, 0.36);
    graphics.fillCircle(0, 4, radius + 3);

    const steps = 24;
    for (let index = 0; index <= steps; index += 1) {
        const t = index / steps;
        graphics.fillStyle(sampleGradient(palette.stops, t), 1);
        graphics.fillCircle(
            -radius * 0.16 * t,
            -radius * 0.2 * t,
            radius * (1 - 0.74 * t)
        );
    }

    graphics.lineStyle(Math.max(1.5, radius * 0.045), palette.rim, 0.92);
    graphics.strokeCircle(0, 0, radius - 1.5);
    graphics.lineStyle(Math.max(1, radius * 0.02), 0xffffff, 0.22);
    graphics.strokeCircle(0, 0, radius * 0.78);
    graphics.fillStyle(0xffffff, 0.24);
    graphics.fillCircle(-radius * 0.28, -radius * 0.38, radius * 0.17);
};

export const drawLauncherDisc = (graphics: GameObjects.Graphics): void => {
    drawPremiumDisc(graphics, LAUNCHER_BASE_RADIUS, {
        glow: 0x53ff9a,
        shadow: 0x082f1f,
        rim: 0xd7ffe7,
        stops: [
            { at: 0, color: 0x0b5a37 },
            { at: 0.45, color: 0x1d8c56 },
            { at: 0.78, color: 0x36c174 },
            { at: 1, color: 0x9affc2 },
        ],
    });
};

export const drawSideControlDisc = (graphics: GameObjects.Graphics): void => {
    drawPremiumDisc(graphics, LAUNCHER_SIDE_CONTROL_RADIUS, {
        glow: 0x63a8ff,
        shadow: 0x071b45,
        rim: 0xcfe5ff,
        stops: [
            { at: 0, color: 0x102a6b },
            { at: 0.45, color: 0x1a43c2 },
            { at: 0.78, color: 0x2c5ceb },
            { at: 1, color: 0x8bb8ff },
        ],
    });
};

export const drawLauncherBarrel = (graphics: GameObjects.Graphics): void => {
    const scale = LAUNCHER_SCALE;
    const width = 18 * scale;
    const height = 80 * scale;
    const radius = 9 * scale;
    const top = -SHOOTER_TOP_CLEARANCE * scale;

    graphics.fillStyle(0x062f22, 0.28);
    graphics.fillRoundedRect(
        -width / 2 + 2 * scale,
        top + 3 * scale,
        width,
        height,
        radius
    );

    graphics.fillGradientStyle(0x76e69f, 0x4ed283, 0x1d7b4f, 0x135c3c, 1);
    graphics.fillRoundedRect(-width / 2, top, width, height, radius);
    graphics.lineStyle(2 * scale, 0xcaffd9, 0.9);
    graphics.strokeRoundedRect(-width / 2, top, width, height, radius);

    graphics.fillStyle(0xd8ffe6, 0.3);
    graphics.fillRoundedRect(
        -4 * scale,
        top + 6 * scale,
        4 * scale,
        height - 18 * scale,
        2 * scale
    );

    graphics.fillGradientStyle(0xb5ffd2, 0x7bf0a1, 0x45c878, 0x2fa865, 1);
    graphics.fillRoundedRect(-width / 2, top, width, 8 * scale, 4 * scale);
    graphics.lineStyle(1.5 * scale, 0xffffff, 0.5);
    graphics.strokeRoundedRect(-width / 2, top, width, 8 * scale, 4 * scale);
};
