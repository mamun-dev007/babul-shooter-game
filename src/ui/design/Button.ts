import { Scene, GameObjects } from 'phaser';
import { DesignTokens } from './tokens';
import { addPressFx } from '../uiFx';

export type ButtonVariant = 'play' | 'primary' | 'gold' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonConfig {
    x: number;
    y: number;
    text: string;
    variant?: ButtonVariant;
    size?: ButtonSize;
    width?: number;
    onClick: () => void;
    disabled?: boolean;
}

const SIZES = {
    sm: { width: 200, height: 48, fontSize: '16px', radius: 24 },
    md: { width: 280, height: 62, fontSize: '21px', radius: 31 },
    lg: { width: 320, height: 86, fontSize: '38px', radius: 43 },
};

const VARIANTS = {
    play: { fill: [0x67D9FF, 0x1E9FE8], stroke: 0x0878B9, textColor: '#083C67' },
    primary: { fill: [0x4FC8F5, 0x168BFF], stroke: 0x0a3d91, textColor: '#ffffff' },
    gold: { fill: [0xFFE38A, 0xFFC928], stroke: 0x92400e, textColor: '#312e81' },
    danger: { fill: [0xFF6B6B, 0xFF454F], stroke: 0x7f1d1d, textColor: '#ffffff' },
    ghost: { fill: [0x0B1730, 0x0B1730], stroke: 0x31507F, textColor: '#9FB7DD' },
};

export class Button {
    private scene: Scene;
    private container: GameObjects.Container;
    private graphics: GameObjects.Graphics;
    private text: GameObjects.Text;
    private hit: GameObjects.Rectangle;
    private config: ButtonConfig;
    private hovering = false;
    private disabled = false;

    constructor(scene: Scene, config: ButtonConfig) {
        this.scene = scene;
        this.config = config;
        this.disabled = config.disabled ?? false;

        const size = SIZES[config.size ?? 'md'];
        const width = config.width ?? size.width;

        this.container = scene.add.container(config.x, config.y);
        this.graphics = scene.add.graphics();
        this.text = scene.add
            .text(0, -1, config.text, {
                fontFamily: DesignTokens.typography.fontDisplay,
                fontSize: size.fontSize,
                color: this.disabled ? '#64748b' : VARIANTS[config.variant ?? 'primary'].textColor,
            })
            .setOrigin(0.5);

        this.hit = scene.add
            .rectangle(0, 0, width, size.height, 0xffffff, 0.001)
            .setInteractive({ useHandCursor: !this.disabled });

        this.container.add([this.graphics, this.text, this.hit]);

        this.draw();
        this.setupEvents();
    }

    private draw(): void {
        const size = SIZES[this.config.size ?? 'md'];
        const width = this.config.width ?? size.width;
        const variant = VARIANTS[this.config.variant ?? 'primary'];
        const height = size.height;
        const radius = size.radius;

        this.graphics.clear();

        if (this.disabled) {
            this.graphics.fillStyle(0x1e293b, 0.7);
            this.graphics.fillRoundedRect(-width / 2, -height / 2, width, height, radius);
            this.graphics.lineStyle(2, 0x475569, 0.8);
            this.graphics.strokeRoundedRect(-width / 2, -height / 2, width, height, radius);
            this.graphics.fillStyle(0xffffff, 0.05);
            this.graphics.fillRoundedRect(-width / 2 + 12, -height / 2 + 6, width - 24, height / 2, radius / 2);
            return;
        }

        // Shadow
        this.graphics.fillStyle(0x02050D, 0.5);
        this.graphics.fillRoundedRect(-width / 2, -height / 2 + 6, width, height, radius);

        // Button fill
        const fillColor = this.hovering ? this.lighten(variant.fill[0], 10) : variant.fill[0];
        this.graphics.fillStyle(fillColor, 1);
        this.graphics.fillRoundedRect(-width / 2, -height / 2, width, height, radius);

        // Highlight
        this.graphics.fillStyle(0xffffff, this.hovering ? 0.32 : 0.22);
        this.graphics.fillRoundedRect(-width / 2 + 12, -height / 2 + 6, width - 24, height / 2, radius / 2);

        // Border
        this.graphics.lineStyle(2, variant.stroke, 0.9);
        this.graphics.strokeRoundedRect(-width / 2, -height / 2, width, height, radius);
    }

    private lighten(color: number, amount: number): number {
        const r = Math.min(255, ((color >> 16) & 0xff) + amount);
        const g = Math.min(255, ((color >> 8) & 0xff) + amount);
        const b = Math.min(255, (color & 0xff) + amount);
        return (r << 16) | (g << 8) | b;
    }

    private setupEvents(): void {
        if (this.disabled) return;

        this.hit.on('pointerover', () => {
            this.hovering = true;
            this.draw();
        });

        this.hit.on('pointerout', () => {
            this.hovering = false;
            this.draw();
        });

        this.hit.on('pointerdown', () => {
            if (this.disabled) return;
            this.config.onClick();
        });

        addPressFx(this.scene, this.hit, this.container, {
            hoverScale: 1.04,
            pressScale: 0.96,
        });
    }

    setText(text: string): void {
        this.text.setText(text);
    }

    setDisabled(disabled: boolean): void {
        this.disabled = disabled;
        if (disabled) {
            this.hit.disableInteractive();
        } else {
            this.hit.setInteractive({ useHandCursor: true });
        }
        const variant = VARIANTS[this.config.variant ?? 'primary'];
        this.text.setColor(disabled ? '#64748b' : variant.textColor);
        this.draw();
    }

    getContainer(): GameObjects.Container {
        return this.container;
    }

    destroy(): void {
        this.container.destroy();
    }
}
