import { Scene, GameObjects } from 'phaser';
import { DesignTokens } from './tokens';
import { drawVectorIcon, VectorIcon } from '../vectorIcons';
import { addPressFx } from '../uiFx';

export interface IconButtonConfig {
    x: number;
    y: number;
    icon: VectorIcon;
    onClick: () => void;
    size?: number;
    enabled?: boolean;
    background?: boolean;
}

export class IconButton {
    private scene: Scene;
    private container: GameObjects.Container;
    private bg: GameObjects.Graphics;
    private icon: GameObjects.Graphics;
    private hit: GameObjects.Arc;
    private config: IconButtonConfig;
    private hovering = false;
    private enabled: boolean;

    constructor(scene: Scene, config: IconButtonConfig) {
        this.scene = scene;
        this.config = config;
        this.enabled = config.enabled ?? true;

        const size = config.size ?? 32;
        this.container = scene.add.container(config.x, config.y);
        this.bg = scene.add.graphics();
        this.icon = scene.add.graphics().setScale(1.2);
        this.hit = scene.add.circle(0, 0, size + 2, 0xffffff, 0.001).setInteractive({ useHandCursor: true });

        this.container.add([this.bg, this.icon, this.hit]);
        this.draw();
        this.setupEvents();
    }

    private draw(): void {
        const size = this.config.size ?? 32;
        this.bg.clear();
        this.icon.clear();

        if (this.config.background === false) {
            drawVectorIcon(
                this.icon,
                this.config.icon,
                this.hovering && this.enabled ? DesignTokens.colors.skyBlue : 0x8FE3FF,
                this.enabled
            );
            return;
        }

        if (!this.enabled) {
            this.bg.fillStyle(0x1e293b, 0.7);
            this.bg.fillCircle(0, 0, size);
            this.bg.lineStyle(2, 0x475569, 0.8);
            this.bg.strokeCircle(0, 0, size);
        } else {
            this.bg.fillStyle(this.hovering ? 0x152747 : DesignTokens.colors.panelBg, this.hovering ? 0.95 : 0.85);
            this.bg.fillCircle(0, 0, size);
            this.bg.lineStyle(2, this.hovering ? DesignTokens.colors.cyanAccent : DesignTokens.colors.panelBorder, this.hovering ? 0.95 : 0.9);
            this.bg.strokeCircle(0, 0, size);
            this.bg.fillStyle(0xffffff, this.hovering ? 0.1 : 0.05);
            this.bg.fillCircle(-4, -8, size * 0.56);
        }

        drawVectorIcon(
            this.icon,
            this.config.icon,
            this.hovering && this.enabled ? DesignTokens.colors.skyBlue : 0x8FE3FF,
            this.enabled
        );
    }

    private setupEvents(): void {
        this.hit.on('pointerover', () => {
            if (!this.enabled) return;
            this.hovering = true;
            this.draw();
        });

        this.hit.on('pointerout', () => {
            if (!this.enabled) return;
            this.hovering = false;
            this.draw();
        });

        this.hit.on('pointerdown', () => {
            if (!this.enabled) return;
            this.config.onClick();
        });

        addPressFx(this.scene, this.hit, this.container, { hoverScale: 1.06, pressScale: 0.92 });
    }

    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
        this.draw();
    }

    getContainer(): GameObjects.Container {
        return this.container;
    }

    destroy(): void {
        this.container.destroy();
    }
}
