import { Scene, GameObjects } from 'phaser';
import { DesignTokens } from './tokens';

export interface PanelConfig {
    x: number;
    y: number;
    width: number;
    height: number;
    depth?: number;
    variant?: 'default' | 'dark' | 'glow';
}

export class Panel {
    private graphics: GameObjects.Graphics;
    private container: GameObjects.Container;

    constructor(scene: Scene, config: PanelConfig) {
        this.container = scene.add.container(config.x, config.y).setDepth(config.depth ?? 0);
        this.graphics = scene.add.graphics();
        this.container.add(this.graphics);
        this.draw(config);
    }

    private draw(config: PanelConfig): void {
        const { width, height, variant = 'default' } = config;
        const radius = DesignTokens.radius.lg;

        this.graphics.clear();

        // Background
        if (variant === 'dark') {
            this.graphics.fillStyle(DesignTokens.colors.panelBgDark, 0.95);
        } else {
            this.graphics.fillStyle(DesignTokens.colors.panelBg, 0.94);
        }
        this.graphics.fillRoundedRect(-width / 2, -height / 2, width, height, radius);

        // Border
        if (variant === 'glow') {
            this.graphics.lineStyle(2, DesignTokens.colors.cyanAccent, 0.9);
            // Glow effect
            this.graphics.lineStyle(1, DesignTokens.colors.violetGlow, 0.4);
            this.graphics.strokeRoundedRect(-width / 2 - 1, -height / 2 - 1, width + 2, height + 2, radius + 1);
            this.graphics.lineStyle(2, DesignTokens.colors.cyanAccent, 0.9);
            this.graphics.strokeRoundedRect(-width / 2, -height / 2, width, height, radius);
        } else {
            this.graphics.lineStyle(1.5, DesignTokens.colors.panelBorder, 0.9);
            this.graphics.strokeRoundedRect(-width / 2, -height / 2, width, height, radius);
        }

        // Inner highlight
        this.graphics.fillStyle(0xffffff, 0.05);
        this.graphics.fillRoundedRect(-width / 2 + 12, -height / 2 + 8, width - 24, height / 4, radius / 2);
    }

    getContainer(): GameObjects.Container {
        return this.container;
    }

    destroy(): void {
        this.container.destroy();
    }
}
