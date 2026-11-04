import { Scene } from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { AssetLoader } from '../assets/AssetLoader';
import { attachRelayout, worldHeight, worldWidth } from '../layout';

export class LoadingScene extends Scene {
    private progressFill?: Phaser.GameObjects.Graphics;
    private percentText?: Phaser.GameObjects.Text;
    private hasTransitioned = false;
    private loadingBackground?: Phaser.GameObjects.Image;
    private progressTrack?: Phaser.GameObjects.Graphics;
    private progressValue = 0;

    constructor() {
        super('LoadingScene');
    }

    preload(): void {
        this.load.on('progress', (progress: number) => {
            this.updateProgress(progress);
        });
        this.load.on('loaderror', (file: Phaser.Loader.File) => {
            console.warn(`[LoadingScene] Failed to load: ${file.key} from ${file.url}`);
        });

        this.createProgressBar();
        new AssetLoader(this).preload();
    }

    create(): void {
        this.updateProgress(1);
        this.cameras.main.setBackgroundColor('#071c42');
        this.loadingBackground = this.add
            .image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'loading-background')
            .setOrigin(0.5)
            .setDepth(-20);
        this.layoutArtwork();
        attachRelayout(this, () => {
            this.layoutArtwork();
            this.layoutProgressBar();
        });
        this.time.delayedCall(3000, () => this.goToMenu());
    }

    private createProgressBar(): void {
        this.progressTrack = this.add.graphics().setDepth(100);
        this.progressFill = this.add.graphics().setDepth(101);
        this.percentText = this.add.text(0, 0, '0%', {
            fontFamily: 'Arial Black, Arial, sans-serif',
            fontSize: '15px',
            color: '#ffffff',
            stroke: '#083d67',
            strokeThickness: 4,
        }).setOrigin(0.5).setDepth(102);
        this.layoutProgressBar();
    }

    private layoutArtwork(): void {
        if (!this.loadingBackground) {
            return;
        }
        const width = worldWidth();
        const height = worldHeight();
        const coverScale = Math.max(
            width / this.loadingBackground.width,
            height / this.loadingBackground.height
        );
        this.loadingBackground
            .setPosition(width / 2, height / 2)
            .setScale(coverScale);
    }

    private updateProgress(progress: number): void {
        const value = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
        this.progressValue = value;

        if (this.percentText) {
            this.percentText.setText(`${Math.round(value * 100)}%`);
        }
        this.layoutProgressBar();
    }

    private layoutProgressBar(): void {
        if (!this.progressTrack || !this.progressFill || !this.percentText) {
            return;
        }
        const width = worldWidth();
        const height = worldHeight();
        const barWidth = Math.min(390, width * 0.76);
        const barHeight = Math.max(14, Math.min(18, height * 0.01875));
        const barX = (width - barWidth) / 2;
        const barY = height - Math.max(52, Math.min(height * 0.19, width * 0.34));

        this.progressTrack.clear();
        this.progressTrack.fillStyle(0x07152f, 0.92);
        this.progressTrack.fillRoundedRect(barX, barY, barWidth, barHeight, barHeight / 2);
        this.progressTrack.lineStyle(2, 0x79dfff, 0.95);
        this.progressTrack.strokeRoundedRect(barX, barY, barWidth, barHeight, barHeight / 2);
        this.percentText.setPosition(width / 2, barY + barHeight + 16);
        this.percentText.setFontSize(Math.round(Math.max(13, Math.min(15, width * 0.028))));
        this.drawProgress(this.progressValue, barX, barY, barWidth, barHeight);
    }

    private drawProgress(progress: number, barX: number, barY: number, barWidth: number, barHeight: number): void {
        if (!this.progressFill) {
            return;
        }
        this.progressFill.clear();
        if (progress <= 0) {
            return;
        }
        const innerWidth = Math.max(0, Math.min(barWidth - 6, (barWidth - 6) * progress));
        this.progressFill.fillGradientStyle(0x8ef5ff, 0x8ef5ff, 0x29a9df, 0x1672bc, 1);
        this.progressFill.fillRoundedRect(barX + 3, barY + 3, innerWidth, barHeight - 6, (barHeight - 6) / 2);
    }

    private goToMenu(): void {
        if (this.hasTransitioned) {
            return;
        }
        this.hasTransitioned = true;
        this.loadingBackground?.setVisible(false);
        this.cameras.main.fadeOut(350, 4, 18, 42);
        this.time.delayedCall(400, () => {
            this.scene.stop('LoadingScene');
            this.scene.start('MenuScene');
        });
    }
}