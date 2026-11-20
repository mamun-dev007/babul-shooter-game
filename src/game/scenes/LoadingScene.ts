import { Scene } from 'phaser';
import { gameAudio } from '../audio/GameAudio';
import { AssetLoader } from '../assets/AssetLoader';
import { syncBootSplashBarToCanvas, updateBootSplashBarProgress } from '../bootSplashBar';
import { attachRelayout, loadingBarGeometry, worldHeight, worldWidth } from '../layout';
import { advanceProgress, loadingPercent } from '../loadingProgress';
import { goToSceneInstant } from './transitions';

/**
 * Removes the static HTML boot splash (the loading artwork shown before the
 * JS bundle runs). Waiting two frames guarantees Phaser has painted the same
 * artwork on the canvas first, so the hand-off is invisible.
 */
const removeBootSplash = (): void => {
    const splash = document.getElementById('boot-splash');
    if (!splash) {
        return;
    }
    requestAnimationFrame(() => {
        requestAnimationFrame(() => splash.remove());
    });
};

export class LoadingScene extends Scene {
    private progressFill?: Phaser.GameObjects.Graphics;
    private percentText?: Phaser.GameObjects.Text;
    private hasTransitioned = false;
    private loadingBackground?: Phaser.GameObjects.Image;
    private progressTrack?: Phaser.GameObjects.Graphics;

    /** What the player currently sees. Monotonic, never moves backwards. */
    private progressValue = 0;
    /** Time (ms) the bar has been animating, drives the initial start ramp. */
    private elapsedMs = 0;
    /** Latest value reported by Phaser's loader. */
    private loaderProgress = 0;
    /** True once the loader finished and every asset can be used safely. */
    private assetsReady = false;
    private readonly failedFiles: string[] = [];

    constructor() {
        super('LoadingScene');
    }

    preload(): void {
        // BootScene already loaded this artwork, so it can be displayed
        // before the main asset batch begins. Creating it here (instead of
        // in create()) keeps the loading background visible from the very
        // first Phaser frame, with the progress bar drawn on top while the
        // rest of the assets load.
        this.cameras.main.setBackgroundColor('#071c42');
        if (this.textures.exists('loading-background')) {
            this.loadingBackground = this.add
                .image(0, 0, 'loading-background')
                .setOrigin(0.5)
                .setDepth(-20);
            this.layoutArtwork();
        }

        // The HTML splash covers the canvas with the same artwork. Remove it
        // only after this scene has actually rendered a frame (background +
        // bar), so there is never a blank/dark canvas in between.
        this.events.once('render', () => removeBootSplash());

        this.load.on('progress', this.handleLoadProgress, this);
        this.load.on('loaderror', this.handleLoadError, this);
        this.load.on('complete', this.handleLoadComplete, this);
        // Scene UPDATE fires during the LOADING phase too (not only once the
        // scene is running), so the bar animates while files are fetched.
        this.events.on('update', this.tick, this);
        this.events.once('shutdown', this.handleShutdown, this);

        this.createProgressBar();
        // Glue the HTML splash bar onto the canvas' live rect so the DOM bar
        // and the bar this scene is about to render sit pixel-identical —
        // the hand-off (splash removal) becomes invisible.
        syncBootSplashBarToCanvas(this.game.canvas);
        gameAudio.preload();
        new AssetLoader(this).preload();
    }

    create(): void {
        this.layoutArtwork();

        if (this.failedFiles.length > 0) {
            this.showLoadError();
            return;
        }

        // The loader's COMPLETE event fires immediately before create(), so
        // every required asset is now in the cache. The tick loop keeps
        // animating the bar to 100% and only then switches scenes.
        this.assetsReady = true;
        this.loaderProgress = 1;

        attachRelayout(this, () => {
            this.layoutArtwork();
            this.layoutProgressBar();
        });
    }

    private handleLoadProgress(progress: number): void {
        const value = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
        if (value > this.loaderProgress) {
            this.loaderProgress = value;
        }
    }

    private handleLoadError(file: Phaser.Loader.File): void {
        this.failedFiles.push(file.key);
        console.error(
            `[LoadingScene] Failed to load "${file.key}" from ${file.url ?? 'unknown URL'}`
        );
    }

    private handleLoadComplete(): void {
        // A failed file still counts towards the loader's percentage, so only
        // treat the batch as successful when nothing reported an error.
        if (this.failedFiles.length === 0) {
            this.loaderProgress = 1;
        }
    }

    /**
     * Smooths the real loader progress into a monotonic visual value.
     *
     * - During loading the bar chases Phaser's actual progress, never showing
     *   100% and never moving backwards.
     * - Once all assets are ready it completes to 100%; on a fully cached
     *   load that completion still ramps over a short window so the bar does
     *   not jump from a low value straight to the end.
     */
    private tick(_time: number, delta: number): void {
        if (this.hasTransitioned || this.failedFiles.length > 0) {
            return;
        }

        this.elapsedMs += Math.max(0, delta);
        const next = advanceProgress({
            visible: this.progressValue,
            loader: this.loaderProgress,
            assetsReady: this.assetsReady,
            elapsedMs: this.elapsedMs,
            deltaMs: delta,
        });

        if (next > this.progressValue) {
            this.updateProgress(next);
        }

        if (this.assetsReady && this.progressValue >= 1) {
            this.goToMenu();
        }
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
        // The visible value is monotonic; a late/stale event can never drag it
        // backwards.
        if (value <= this.progressValue) {
            return;
        }
        this.progressValue = value;

        // Mirror onto the still-visible HTML splash bar (it covers the canvas
        // until removeBootSplash fires) so the two bars agree.
        updateBootSplashBarProgress(value);

        if (this.percentText) {
            this.percentText.setText(`${loadingPercent(value)}%`);
        }
        this.layoutProgressBar();
    }

    private layoutProgressBar(): void {
        if (!this.progressTrack || !this.progressFill || !this.percentText) {
            return;
        }
        const bar = loadingBarGeometry();

        this.progressTrack.clear();
        this.progressTrack.fillStyle(0x07152f, 0.92);
        this.progressTrack.fillRoundedRect(bar.x, bar.y, bar.width, bar.height, bar.height / 2);
        this.progressTrack.lineStyle(2, 0x79dfff, 0.95);
        this.progressTrack.strokeRoundedRect(bar.x, bar.y, bar.width, bar.height, bar.height / 2);
        this.percentText.setPosition(bar.percentX, bar.percentY);
        this.percentText.setFontSize(bar.percentFontSize);
        this.drawProgress(this.progressValue, bar.x, bar.y, bar.width, bar.height);
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

    /**
     * Reports a genuine loading failure instead of pretending the batch
     * completed. The level selection is not started (its assets may be
     * missing), and the error stays on screen for the player to see.
     */
    private showLoadError(): void {
        this.assetsReady = false;
        this.hasTransitioned = true;
        if (this.percentText) {
            this.percentText.setText('!');
        }

        const bar = loadingBarGeometry();
        this.add
            .text(
                worldWidth() / 2,
                Math.min(worldHeight() - 24, bar.percentY + 34),
                'Failed to load game assets.\nPlease check your connection and reload.',
                {
                    fontFamily: 'Arial Black, Arial, sans-serif',
                    fontSize: '14px',
                    color: '#ffffff',
                    align: 'center',
                    stroke: '#083d67',
                    strokeThickness: 4,
                }
            )
            .setOrigin(0.5)
            .setDepth(103);

        removeBootSplash();
    }

    private handleShutdown(): void {
        this.load.off('progress', this.handleLoadProgress, this);
        this.load.off('loaderror', this.handleLoadError, this);
        this.load.off('complete', this.handleLoadComplete, this);
        this.events.off('update', this.tick, this);

        this.progressFill = undefined;
        this.percentText = undefined;
        this.progressTrack = undefined;
        this.loadingBackground = undefined;
        this.progressValue = 0;
        this.elapsedMs = 0;
        this.loaderProgress = 0;
        this.assetsReady = false;
        this.failedFiles.length = 0;
        this.hasTransitioned = false;
    }

    private goToMenu(): void {
        if (this.hasTransitioned) {
            return;
        }
        this.hasTransitioned = true;
        // Keep the loading artwork on screen until Level Selection renders.
        // Phaser's ScenePlugin.start queues stop(this) + start(target) and
        // both run in the same scene-manager step, so the switch is atomic:
        // no frame renders with the loading scene already torn down.
        goToSceneInstant(this, 'LevelSelectionScene');
    }
}
