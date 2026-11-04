import { Scene } from 'phaser';
import {
    BUBBLE_COLORS,
    COLOR_NAMES,
    GAME_HEIGHT,
    GAME_WIDTH,
    bubbleTexture,
    shade,
    toCssColor,
    type BubbleColorName,
} from '../config';

export class BootScene extends Scene {
    constructor() {
        super('BootScene');
    }

    preload(): void {
        this.load.on('loaderror', (file: Phaser.Loader.File) => {
            console.warn(`[BootScene] Failed to load: ${file.key} from ${file.url}`);
        });

    }

    create(): void {
        this.createBackgroundTexture();

        for (const color of COLOR_NAMES) {
            this.createBubbleTexture(color);
        }

        this.createSparkTexture();
        this.createRingTexture();
        this.createStarTexture();

        this.scene.start('LoadingScene');
    }

    private createBackgroundTexture(): void {
        if (this.textures.exists('bg')) {
            return;
        }

        const texture = this.textures.createCanvas('bg', GAME_WIDTH, GAME_HEIGHT);

        if (!texture) {
            return;
        }

        const ctx = texture.getContext();
        const gradient = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
        gradient.addColorStop(0, '#050915');
        gradient.addColorStop(0.33, '#0b1734');
        gradient.addColorStop(0.68, '#10264d');
        gradient.addColorStop(1, '#050a19');

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

        this.drawGlow(ctx, GAME_WIDTH * 0.16, GAME_HEIGHT * 0.16, 340, 'rgba(58, 134, 255, 0.22)');
        this.drawGlow(ctx, GAME_WIDTH * 0.88, GAME_HEIGHT * 0.34, 300, 'rgba(155, 93, 229, 0.18)');
        this.drawGlow(ctx, GAME_WIDTH * 0.48, GAME_HEIGHT * 0.88, 380, 'rgba(46, 196, 182, 0.1)');

        for (let i = 0; i < 110; i++) {
            const x = Math.random() * GAME_WIDTH;
            const y = Math.random() * GAME_HEIGHT;
            const radius = Math.random() * 1.5 + 0.3;

            ctx.beginPath();
            ctx.fillStyle = `rgba(255, 255, 255, ${0.06 + Math.random() * 0.22})`;
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
        }

        texture.refresh();
    }

    private drawGlow(
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        radius: number,
        color: string
    ): void {
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    }

    private createBubbleTexture(color: BubbleColorName): void {
        const key = bubbleTexture(color);

        if (this.textures.exists(key)) {
            return;
        }

        const size = 96;
        const texture = this.textures.createCanvas(key, size, size);

        if (!texture) {
            return;
        }

        const ctx = texture.getContext();
        const center = size / 2;
        const radius = center - 2;
        const base = BUBBLE_COLORS[color];
        const light = shade(base, 78);
        const brighter = shade(base, 126);
        const dark = shade(base, -66);
        const deepest = shade(base, -102);

        ctx.beginPath();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.24)';
        ctx.ellipse(center + 1, center + 8, radius * 0.88, radius * 0.86, 0, 0, Math.PI * 2);
        ctx.fill();

        const gradient = ctx.createRadialGradient(
            center - radius * 0.38,
            center - radius * 0.44,
            radius * 0.04,
            center,
            center,
            radius
        );
        gradient.addColorStop(0, '#ffffff');
        gradient.addColorStop(0.14, toCssColor(brighter));
        gradient.addColorStop(0.42, toCssColor(light));
        gradient.addColorStop(0.78, toCssColor(base));
        gradient.addColorStop(0.96, toCssColor(dark));
        gradient.addColorStop(1, toCssColor(deepest));

        ctx.beginPath();
        ctx.fillStyle = gradient;
        ctx.arc(center, center, radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(3, 8, 20, 0.42)';
        ctx.arc(center, center, radius - 1, 0, Math.PI * 2);
        ctx.stroke();

        ctx.beginPath();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
        ctx.arc(center, center, radius - 4, 0, Math.PI * 2);
        ctx.stroke();

        ctx.beginPath();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
        ctx.ellipse(
            center - radius * 0.33,
            center - radius * 0.43,
            radius * 0.27,
            radius * 0.16,
            -0.62,
            0,
            Math.PI * 2
        );
        ctx.fill();

        ctx.beginPath();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.ellipse(
            center - radius * 0.42,
            center - radius * 0.49,
            radius * 0.08,
            radius * 0.05,
            -0.62,
            0,
            Math.PI * 2
        );
        ctx.fill();

        ctx.beginPath();
        ctx.lineWidth = radius * 0.12;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
        ctx.arc(center, center + radius * 0.2, radius * 0.62, 0.34, Math.PI - 0.34);
        ctx.stroke();

        ctx.beginPath();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.34)';
        ctx.arc(
            center + radius * 0.34,
            center + radius * 0.38,
            radius * 0.055,
            0,
            Math.PI * 2
        );
        ctx.fill();

        texture.refresh();
    }

    private createSparkTexture(): void {
        if (this.textures.exists('spark')) {
            return;
        }

        const size = 20;
        const texture = this.textures.createCanvas('spark', size, size);

        if (!texture) {
            return;
        }

        const ctx = texture.getContext();
        const center = size / 2;
        const gradient = ctx.createRadialGradient(center, center, 0, center, center, center);

        gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
        gradient.addColorStop(0.45, 'rgba(255, 255, 255, 0.9)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(center, center, center, 0, Math.PI * 2);
        ctx.fill();

        texture.refresh();
    }

    private createRingTexture(): void {
        if (this.textures.exists('ring')) {
            return;
        }

        const size = 64;
        const texture = this.textures.createCanvas('ring', size, size);

        if (!texture) {
            return;
        }

        const ctx = texture.getContext();
        const center = size / 2;

        const glow = ctx.createRadialGradient(center, center, 18, center, center, 30);
        glow.addColorStop(0, 'rgba(255, 255, 255, 0)');
        glow.addColorStop(0.72, 'rgba(255, 255, 255, 0.16)');
        glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, size, size);

        ctx.beginPath();
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.arc(center, center, 24, 0, Math.PI * 2);
        ctx.stroke();

        ctx.beginPath();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.arc(center, center, 29, 0, Math.PI * 2);
        ctx.stroke();

        texture.refresh();
    }

    private createStarTexture(): void {
        if (this.textures.exists('star')) {
            return;
        }

        const size = 64;
        const texture = this.textures.createCanvas('star', size, size);

        if (!texture) {
            return;
        }

        const ctx = texture.getContext();
        const center = size / 2;
        const outer = 25;
        const inner = 10.5;

        const glow = ctx.createRadialGradient(center, center, 2, center, center, 31);
        glow.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
        glow.addColorStop(0.5, 'rgba(255, 255, 255, 0.18)');
        glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, size, size);

        ctx.beginPath();

        for (let index = 0; index < 10; index++) {
            const radius = index % 2 === 0 ? outer : inner;
            const angle = -Math.PI / 2 + (index * Math.PI) / 5;
            const x = center + Math.cos(angle) * radius;
            const y = center + Math.sin(angle) * radius;

            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }

        ctx.closePath();
        ctx.fillStyle = 'rgba(255, 215, 92, 0.96)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.stroke();

        texture.refresh();
    }
}
