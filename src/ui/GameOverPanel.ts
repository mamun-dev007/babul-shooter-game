import { FONT, FONT_DISPLAY, GAME_HEIGHT, GAME_WIDTH } from '../game/config';
import { gameAudio } from '../game/audio/GameAudio';
import { acquireModalInputLock, releaseModalInputLock } from '../game/input/modalInputLock';
import { addCoins, loadProgress } from '../game/utils/storage';
import { showRewardedAd } from '../ads/rewardedAds';
import { addPressFx } from './uiFx';
import { uiFitScale } from '../game/responsive';

export interface GameOverPanelOptions {
    title: string;
    subtitle: string;
    score: number;
    best: number;
    stars?: number;
    win?: boolean;
    newRecord?: boolean;
    primaryLabel: string;
    secondaryLabel: string;
    replayLabel?: string;
    coinReward?: number;
    /** Flat completion reward (+5 Coins) shown as its own animated badge. */
    completionCoinReward?: number;
    continuationEnabled?: boolean;
    onPrimary: () => void;
    onSecondary: () => void;
    onReplay?: () => void;
    /** Rewarded-ad continue (FAIL popup); resolves with the ad outcome. */
    onContinue?: () => Promise<'granted' | 'failed' | 'unavailable' | 'busy'>;
}

export class GameOverPanel {
    private readonly scene: Phaser.Scene;
    private container: Phaser.GameObjects.Container | null = null;
    private tracked: Phaser.GameObjects.GameObject[] = [];
    private actionLocked = false;
    private multiplierClaimed = false;
    private multiplierBusy = false;
    private continueBusy = false;
    private continueStatus: Phaser.GameObjects.Text | null = null;

    get isOpen(): boolean {
        return this.container !== null;
    }

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
    }

    show(options: GameOverPanelOptions): void {
        this.destroyCurrent();
        acquireModalInputLock('gameOver');

        const scene = this.scene;
        const container = scene.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2).setDepth(200);
        container.setScale(uiFitScale());
        this.container = container;
        this.tracked = [container];
        this.actionLocked = false;
        this.multiplierClaimed = false;
        this.multiplierBusy = false;
        this.continueBusy = false;
        this.continueStatus = null;

        const dim = scene.add
            .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x02050d, 0.78)
            .setInteractive();
        dim.on('pointerdown', (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: { stopPropagation: () => void }) => {
            event.stopPropagation();
        });

        const won = options.win === true;
        // Green-to-blue glossy card for a win; red stays for a loss.
        const palette = won
            ? {
                  shadow: 0x123a5e,
                  topLeft: 0x54dba6,
                  topRight: 0x48cba0,
                  bottomLeft: 0x2f62c9,
                  bottomRight: 0x2453b3,
                  border: 0xa8f0dc,
                  accent: 0x145a7a,
                  statsPanel: 0x1f5f92,
                  statsBorder: 0x8fd0e8,
                  starEmpty: 0x3a6ea8,
                  titleStroke: '#1b4f74',
                  subtitle: '#e8f8ff',
                  scoreStroke: '#1f4a63',
              }
            : {
                  shadow: 0x7a2838,
                  topLeft: 0x8d3546,
                  topRight: 0x712b3c,
                  bottomLeft: 0x3d1d2d,
                  bottomRight: 0x301725,
                  border: 0xffb7c0,
                  accent: 0x8e263b,
                  statsPanel: 0x9d3048,
                  statsBorder: 0xffafba,
                  starEmpty: 0x8f4550,
                  titleStroke: '#351824',
                  subtitle: '#ffe8e8',
                  scoreStroke: '#71301f',
              };

        const card = scene.add.graphics();
        // Won card is tall: header, stars, score, coin board and the
        // three-button stack all fit fully inside without spilling.
        const cardBottom = won ? 292 : 268;
        const cardHeight = cardBottom + 210;

        card.fillStyle(palette.shadow, 0.42);
        card.fillRoundedRect(-183, -202, 366, cardHeight + 12, 30);
        card.fillGradientStyle(
            palette.topLeft,
            palette.topRight,
            palette.bottomLeft,
            palette.bottomRight,
            1
        );
        card.fillRoundedRect(-190, -210, 380, cardHeight, 28);
        card.lineStyle(3, palette.border, 0.95);
        card.strokeRoundedRect(-190, -210, 380, cardHeight, 28);
        card.fillStyle(0xffffff, 0.24);
        card.fillRoundedRect(-176, -196, 352, 48, 21);
        card.fillStyle(palette.accent, 0.22);
        card.fillRoundedRect(-176, cardBottom - 26, 352, 14, 8);

        const title = scene.add
            .text(0, -166, options.title, {
                fontFamily: FONT_DISPLAY,
                fontSize: won ? '29px' : '27px',
                color: won ? '#ffe45d' : '#ffffff',
                align: 'center',
                stroke: palette.titleStroke,
                strokeThickness: won ? 6 : 7,
            })
            .setOrigin(0.5);
        title.setRotation(won ? 0 : -0.025);

        const subtitle = scene.add
            .text(0, 12, options.subtitle, {
                fontFamily: FONT,
                fontSize: '11px',
                color: palette.subtitle,
                align: 'center',
                wordWrap: { width: 348 },
            })
            .setVisible(false)
            .setOrigin(0.5);

        container.add([dim, card]);
        if (won) {
            this.addShellDecorations(container);
        } else {
            this.addFailureDecoration(container);
            this.addFailureClose(container, options.onSecondary);
        }

        // Confetti sits above the card but behind every piece of text so the
        // result and score stay readable while the celebration falls.
        if (options.win) {
            this.addCelebration(container);
        }

        container.add([title, subtitle]);

        const showStars = options.win === true || options.stars !== undefined;
        const stars = Math.max(0, Math.min(3, Math.floor(options.stars ?? 0)));
        const starPositions = [-84, 0, 84];

        if (options.win === true) {
            starPositions.forEach((x, index) => {
                const earned = index < stars;
                const star = scene.add
                    .image(x, -106, 'star')
                    .setTint(earned ? 0xffd166 : palette.starEmpty)
                    .setAlpha(earned ? 1 : 0.42);
                star.setDisplaySize(58, 58);

                const base = star.scaleX;
                star.setScale(0);
                star.setAngle(earned ? -22 : 0);

                container.add(star);
                this.tracked.push(star);

                scene.tweens.add({
                    targets: star,
                    scaleX: base,
                    scaleY: base,
                    angle: 0,
                    duration: 360,
                    delay: 170 + index * 130,
                    ease: 'Back.easeOut',
                    onComplete: () => {
                        if (earned && this.container === container && star.active) {
                            gameAudio.playSfx('star');
                        }
                    },
                });
            });
        }

        const scoreLabelY = showStars ? -46 : -76;
        const scoreValueY = showStars ? -18 : -38;
        const bestY = showStars ? 13 : 8;

        const statsPanel = scene.add.graphics();
        statsPanel.fillStyle(palette.statsPanel, 0.82);
        statsPanel.fillRoundedRect(-132, -79, 264, 118, 18);
        statsPanel.lineStyle(2, palette.statsBorder, 0.62);
        statsPanel.strokeRoundedRect(-132, -79, 264, 118, 18);
        statsPanel.fillStyle(0xffffff, 0.09);
        statsPanel.fillRoundedRect(-124, -71, 248, 25, 12);
        container.add(statsPanel);

        const scoreLabel = scene.add
            .text(0, scoreLabelY, 'SCORE', {
                fontFamily: FONT,
                fontSize: '11px',
                color: '#ffdce1',
            })
            .setOrigin(0.5);

        const scoreValue = scene.add
            .text(0, scoreValueY, options.score.toLocaleString('en-US'), {
                fontFamily: FONT_DISPLAY,
                fontSize: '34px',
                color: '#ffe38a',
                stroke: palette.scoreStroke,
                strokeThickness: 5,
            })
            .setOrigin(0.5);

        const best = scene.add
            .text(0, bestY, `BEST  ${options.best.toLocaleString('en-US')}`, {
                fontFamily: FONT,
                fontSize: '13px',
                color: '#9fb7dd',
            })
            .setOrigin(0.5);

        container.add([scoreLabel, scoreValue, best]);

        if (options.newRecord) {
            const record = scene.add
                .text(0, showStars ? 31 : 34, 'NEW BEST!', {
                    fontFamily: FONT_DISPLAY,
                    fontSize: '14px',
                    color: '#ffd166',
                })
                .setOrigin(0.5);

            scene.tweens.add({
                targets: record,
                alpha: 0.45,
                duration: 620,
                yoyo: true,
                repeat: 2,
                ease: 'Sine.easeInOut',
            });

            container.add(record);
            this.tracked.push(record);
        }

        if (won && options.coinReward !== undefined) {
            // Coin Reward Board: matched to the Score Board width (264),
            // compact 52px height — left = coin icon + COINS EARNED (normal
            // reward already credited), right = 3X WATCH AD button.
            const board = scene.add.graphics();
            board.fillStyle(0x020617, 0.28);
            board.fillRoundedRect(-132, 53, 264, 52, 14);
            board.fillGradientStyle(0x2a4a7a, 0x2a4a7a, 0x1c3255, 0x1c3255, 1);
            board.fillRoundedRect(-132, 51, 264, 52, 14);
            board.lineStyle(2, 0xffd166, 0.85);
            board.strokeRoundedRect(-132, 51, 264, 52, 14);
            board.lineStyle(2, 0xffffff, 0.25);
            board.lineBetween(12, 57, 12, 97);
            container.add(board);

            const coinIcon = scene.add.container(-108, 77);
            const coinBg = scene.add.graphics();
            coinBg.fillStyle(0x92400e, 1);
            coinBg.fillEllipse(0, 2, 30, 24);
            coinBg.fillGradientStyle(0xffe38a, 0xffe38a, 0xb45309, 0xb45309, 1);
            coinBg.fillEllipse(0, 0, 28, 22);
            coinBg.lineStyle(2, 0xfff6c9, 0.95);
            coinBg.strokeEllipse(0, 0, 27, 21);
            coinBg.fillStyle(0xffc928, 1);
            coinBg.fillCircle(-2, -1, 5);
            coinBg.fillStyle(0xffffff, 0.85);
            coinBg.fillEllipse(-6, -4, 9, 5);
            coinIcon.add(coinBg);
            container.add(coinIcon);

            const earnedLabel = scene.add.text(-88, 68, 'COINS EARNED', {
                fontFamily: FONT, fontSize: '9px', color: '#bcd6f5',
            }).setOrigin(0, 0.5);
            const earnedValue = scene.add.text(-88, 84, `+${options.coinReward}`, {
                fontFamily: FONT_DISPLAY, fontSize: '16px', color: '#ffe38a',
                stroke: palette.scoreStroke, strokeThickness: 3,
            }).setOrigin(0, 0.5);
            earnedValue.setName('coins-earned-value');
            container.add([earnedLabel, earnedValue]);

            const adW = 120;
            const adH = 30;
            const adX = 72;
            const adY = 77;
            const adBg = scene.add.graphics();
            const drawAd = (hover: boolean, claimed: boolean): void => {
                adBg.clear();
                adBg.fillStyle(0x020617, 0.45);
                adBg.fillRoundedRect(adX - adW / 2, adY - adH / 2 + 3, adW, adH, adH / 2);
                if (claimed) {
                    adBg.fillStyle(0x64748b, 1);
                } else {
                    adBg.fillGradientStyle(hover ? 0x6d28d9 : 0x5b21b6, hover ? 0x6d28d9 : 0x5b21b6, hover ? 0x4c1d95 : 0x3b1270, hover ? 0x4c1d95 : 0x3b1270, 1);
                }
                adBg.fillRoundedRect(adX - adW / 2, adY - adH / 2, adW, adH, adH / 2);
                adBg.lineStyle(2, 0xffffff, 0.9);
                adBg.strokeRoundedRect(adX - adW / 2, adY - adH / 2, adW, adH, adH / 2);
            };
            drawAd(false, false);
            const adText = scene.add.text(adX, adY, '3X WATCH AD', {
                fontFamily: FONT_DISPLAY, fontSize: '11px', color: '#ffffff',
                stroke: '#2e1065', strokeThickness: 3,
            }).setOrigin(0.5);
            adText.setName('ad-multiplier-button');
            const adStatus = scene.add.text(adX + adW / 2, 115, '', {
                fontFamily: FONT, fontSize: '9px', color: '#fde68a', align: 'center',
            }).setOrigin(1, 0.5);
            adStatus.setName('ad-multiplier-status');
            const adHit = scene.add.rectangle(adX, adY, adW, adH, 0xffffff, 0.001)
                .setInteractive({ useHandCursor: true });
            adHit.on('pointerover', () => drawAd(true, this.multiplierClaimed));
            adHit.on('pointerout', () => drawAd(false, this.multiplierClaimed));
            adHit.on('pointerdown', (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: { stopPropagation: () => void }) => {
                event.stopPropagation();
                if (this.multiplierClaimed || this.multiplierBusy) return;
                this.multiplierBusy = true;
                adText.setText('LOADING…');
                adStatus.setText('Watch the ad to triple your reward!');
                void (async (): Promise<void> => {
                    const outcome = await showRewardedAd();
                    this.multiplierBusy = false;
                    // Panel/navigation may have left while the ad played.
                    if (!this.isOpen || this.container !== container) {
                        return;
                    }
                    if (outcome !== 'granted') {
                        adText.setText('3X WATCH AD');
                        adStatus.setText(outcome === 'unavailable' ? 'Ad unavailable — no bonus.' : 'No reward — ad not completed.');
                        drawAd(false, false);
                        return;
                    }
                    // Single grant of the +2x top-up (5 -> 15 total), once.
                    this.multiplierClaimed = true;
                    addCoins(options.coinReward! * 2);
                    gameAudio.playSfx('star');
                    earnedValue.setText(`+${options.coinReward! * 3}`);
                    adText.setText('3X CLAIMED');
                    adStatus.setText(`+${options.coinReward! * 2} Coins Added!`);
                    drawAd(false, true);
                    adHit.disableInteractive();
                })();
            });
            container.add([adBg, adText, adStatus, adHit]);
        }

        if (!won) {
            this.createFailureButton(container, 0, 104, options.replayLabel ?? 'RETRY', 'red', options.onReplay ?? options.onPrimary);
            const continueEnabled = !!options.onContinue && options.continuationEnabled !== false;
            const continueStatus = scene.add.text(0, 298, '', {
                fontFamily: FONT_DISPLAY,
                fontSize: '10px',
                color: '#fde68a',
                align: 'center',
            }).setOrigin(0.5).setVisible(false);
            container.add(continueStatus);
            this.continueStatus = continueStatus;
            const continueBtn = this.createFailureButton(container, 0, 162, 'Continue', 'gold', () => {
                if (!continueEnabled) {
                    return;
                }
                void this.continueWithAd(container, continueBtn, options);
            }, !continueEnabled, true);
            if (!continueEnabled) {
                continueStatus.setText('CONTINUE WITH AD  •  UNAVAILABLE');
                continueStatus.setColor('#718096');
                continueStatus.setVisible(true);
            }
            this.createButton(container, 0, 220, 280, 46, options.secondaryLabel, false, options.onSecondary);
        } else {
            // All three buttons sit fully inside the (taller) card, below
            // the coin board in NEXT LEVEL / REPLAY / LEVEL MAP order.
            // NEXT LEVEL matches REPLAY's size (280x46).
            this.createButton(container, 0, 148, 280, 46, options.primaryLabel, true, options.onPrimary);

            if (options.replayLabel && options.onReplay) {
                this.createButton(container, 0, 206, 280, 46, options.replayLabel, false, options.onReplay);
                this.createButton(container, 0, 262, 280, 46, options.secondaryLabel, false, options.onSecondary);
            } else {
                this.createButton(container, 0, 206, 280, 46, options.secondaryLabel, false, options.onSecondary);
            }
        }

        if (options.win === false && options.continuationEnabled === false) {
            // Legacy disabled note (no onContinue configured).
        }

        container.setAlpha(0);
        container.setScale(0.9);

        scene.tweens.add({
            targets: container,
            alpha: 1,
            scaleX: 1,
            scaleY: 1,
            duration: 260,
            ease: 'Back.easeOut',
        });
    }

    /**
     * FAIL-popup Continue: runs the scene's rewarded-ad flow (which grants
     * exactly 3 balls and resumes the attempt on success) and reports the
     * outcome inline. Repeat clicks and duplicate callbacks are blocked by
     * both the local busy guard and the scene's ad lock.
     */
    private async continueWithAd(container: Phaser.GameObjects.Container, button: Phaser.GameObjects.Container, options: GameOverPanelOptions): Promise<void> {
        if (this.continueBusy || !options.onContinue) {
            return;
        }
        this.continueBusy = true;
        const label = button.getByName('continue-label') as Phaser.GameObjects.Text | null;
        label?.setText('LOADING…');
        const outcome = await options.onContinue();
        this.continueBusy = false;
        if (!this.isOpen || this.container !== container) {
            return;
        }
        label?.setText('CONTINUE');
        if (outcome === 'granted') {
            return;
        }
        this.continueStatus?.setText(
            outcome === 'unavailable' ? 'Ad unavailable — no balls added.' : 'Ad not completed — no balls added.'
        );
        this.continueStatus?.setColor('#fde68a');
        this.continueStatus?.setVisible(true);
    }

    hide(): void {
        releaseModalInputLock('gameOver');
        const container = this.container;

        if (!container) {
            return;
        }

        this.container = null;
        this.actionLocked = true;
        this.scene.tweens.killTweensOf(this.tracked);
        this.tracked = [];

        this.scene.tweens.add({
            targets: container,
            alpha: 0,
            scaleX: 0.95,
            scaleY: 0.95,
            duration: 140,
            ease: 'Quad.easeIn',
            onComplete: () => container.destroy(true),
        });
    }

    /** Removes the panel immediately, including all child tweens. */
    destroy(): void {
        this.destroyCurrent();
    }

    private destroyCurrent(): void {
        releaseModalInputLock('gameOver');
        const container = this.container;

        if (!container) {
            return;
        }

        this.container = null;
        this.actionLocked = true;
        this.scene.tweens.killTweensOf(this.tracked);
        this.tracked = [];
        container.destroy(true);
    }

    private addCelebration(container: Phaser.GameObjects.Container): void {
        const scene = this.scene;
        const quality = loadProgress().graphics ?? 'medium';
        const count = quality === 'low' ? 12 : quality === 'high' ? 26 : 20;
        const colors = [0xff4d6d, 0xff9f1c, 0xffd166, 0x2ec4b6, 0x3a86ff, 0x9b5de5];

        for (let index = 0; index < count; index++) {
            const spark = scene.add
                .image((Math.random() - 0.5) * 360, -225 + Math.random() * 24, 'spark')
                .setTint(colors[index % colors.length])
                .setScale(0.38 + Math.random() * 0.48)
                .setAlpha(0.95);

            container.add(spark);
            this.tracked.push(spark);

            scene.tweens.add({
                targets: spark,
                x: spark.x + (Math.random() - 0.5) * 150,
                y: 185 + Math.random() * 46,
                rotation: (Math.random() - 0.5) * 4,
                alpha: 0,
                duration: 1250 + Math.random() * 500,
                delay: 180 + Math.random() * 180,
                ease: 'Quad.easeIn',
            });
        }
    }

    private addShellDecorations(container: Phaser.GameObjects.Container): void {
            [-44, 0, 44].forEach((x, index) => {
                const shell = this.scene.add.container(x, -218);
                const graphics = this.scene.add.graphics();

                graphics.fillStyle(0xa95a1b, 0.38);
                graphics.fillEllipse(0, 4, 46, 38);
                graphics.fillGradientStyle(0xffdc68, 0xffdc68, 0xe89b2c, 0xe89b2c, 1);
                graphics.fillEllipse(0, 0, 42, 36);
                graphics.lineStyle(2, 0xfff0a3, 0.95);
                graphics.strokeEllipse(0, 0, 42, 36);

                for (let rib = -2; rib <= 2; rib++) {
                    graphics.lineStyle(index === 1 ? 2 : 1.5, 0xfff4ae, 0.78);
                    graphics.beginPath();
                    graphics.moveTo(rib * 2.5, 16);
                    graphics.lineTo(rib * 7, -12);
                    graphics.strokePath();
                }

                shell.add(graphics);
                shell.setScale(index === 1 ? 1.08 : 0.92);
                container.add(shell);
            });
        }

        private addFailureDecoration(container: Phaser.GameObjects.Container): void {
            const face = this.scene.add.text(0, -218, '😢', {
                fontFamily: 'Arial',
                fontSize: '58px',
                align: 'center',
            }).setOrigin(0.5);
            container.add(face);

        }

        private addFailureClose(
            container: Phaser.GameObjects.Container,
            onClose: () => void
        ): void {
            const button = this.scene.add.container(164, -186);
            const shadow = this.scene.add.circle(0, 3, 17, 0x160812, 0.45);
            const body = this.scene.add.circle(0, 0, 17, 0xd94b4f, 1);
            body.setStrokeStyle(2, 0xffa9a9, 0.95);
            const cross = this.scene.add.text(0, -1, '×', {
                fontFamily: FONT_DISPLAY,
                fontSize: '26px',
                color: '#ffffff',
                stroke: '#881d31',
                strokeThickness: 2,
            }).setOrigin(0.5);
            const hit = this.scene.add.circle(0, 0, 21, 0xffffff, 0.001)
                .setInteractive({ useHandCursor: true });

            hit.on('pointerdown', (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: { stopPropagation: () => void }) => {
                event.stopPropagation();
                if (this.actionLocked) return;
                this.actionLocked = true;
                onClose();
            });
            button.add([shadow, body, cross, hit]);
            addPressFx(this.scene, hit, button, { hoverScale: 1.08, pressScale: 0.92 });
            container.add(button);
        }

        private createFailureButton(
            container: Phaser.GameObjects.Container,
            x: number,
            y: number,
            label: string,
            color: 'red' | 'gold',
            onClick: () => void,
            disabled = false,
            repeatable = false
        ): Phaser.GameObjects.Container {
            const width = 280;
            const height = 46;
            const button = this.scene.add.container(x, y);
            const graphics = this.scene.add.graphics();
            const red = color === 'red';
            const top = disabled ? 0xbdb8a0 : red ? 0xf16358 : 0xffd94b;
            const bottom = disabled ? 0x77746a : red ? 0xc93b45 : 0xef8b1b;

            graphics.fillStyle(0x170912, 0.42);
            graphics.fillRoundedRect(-width / 2, -height / 2 + 5, width, height, height / 2);
            graphics.fillGradientStyle(top, top, bottom, bottom, 1);
            graphics.fillRoundedRect(-width / 2, -height / 2, width, height, height / 2);
            graphics.fillStyle(0xffffff, disabled ? 0.08 : 0.22);
            graphics.fillRoundedRect(-width / 2 + 10, -height / 2 + 6, width - 20, 15, 8);
            graphics.lineStyle(2, red ? 0xffaaa1 : 0xffed9a, 0.85);
            graphics.strokeRoundedRect(-width / 2, -height / 2, width, height, height / 2);

            const icon = red ? '↻' : '▶';
            const labelText = this.scene.add.text(10, -1, label.toUpperCase(), {
                fontFamily: FONT_DISPLAY,
                fontSize: '14px',
                color: '#ffffff',
                stroke: red ? '#8f2638' : '#bd6d18',
                strokeThickness: 3,
            }).setOrigin(0.5);
            labelText.setName('continue-label');
            button.add([
                graphics,
                this.scene.add.text(-104, -1, icon, {
                    fontFamily: FONT_DISPLAY,
                    fontSize: '24px',
                    color: '#ffffff',
                }).setOrigin(0.5),
                labelText,
            ]);

            if (!disabled) {
                const hit = this.scene.add.rectangle(0, 0, width, height, 0xffffff, 0.001)
                    .setInteractive({ useHandCursor: true });
                hit.on('pointerdown', (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: { stopPropagation: () => void }) => {
                    event.stopPropagation();
                    if (repeatable) {
                        // Repeat-safe (Continue): never locks the panel, so a
                        // failed ad keeps the button clickable.
                        if (this.continueBusy) return;
                        onClick();
                        return;
                    }
                    if (this.actionLocked) return;
                    this.actionLocked = true;
                    onClick();
                });
                button.add(hit);
                addPressFx(this.scene, hit, button, { hoverScale: 1.03, pressScale: 0.94 });
            } else {
                button.setAlpha(0.72);
            }
            container.add(button);
            return button;
        }

        private createButton(
        container: Phaser.GameObjects.Container,
        x: number,
        y: number,
        width: number,
        height: number,
        label: string,
        primary: boolean,
        onClick: () => void
    ): void {
        const scene = this.scene;
        const button = scene.add.container(x, y);
        const graphics = scene.add.graphics();

        const draw = (hover: boolean): void => {
            graphics.clear();

            if (primary) {
                graphics.fillStyle(0x9b6020, 0.32);
                graphics.fillRoundedRect(-width / 2, -height / 2 + 5, width, height, height / 2);
                graphics.fillGradientStyle(
                    hover ? 0xffed70 : 0xffd94b,
                    hover ? 0xffed70 : 0xffd94b,
                    0xf49a1d,
                    0xe87318,
                    1
                );
                graphics.fillRoundedRect(-width / 2, -height / 2, width, height, height / 2);
                graphics.fillStyle(0xffffff, hover ? 0.34 : 0.22);
                graphics.fillRoundedRect(
                    -width / 2 + 8,
                    -height / 2 + 6,
                    width - 16,
                    height / 2,
                    height / 3
                );
                graphics.lineStyle(2, 0xffed9a, 0.9);
                graphics.strokeRoundedRect(-width / 2, -height / 2, width, height, height / 2);
            } else {
                graphics.fillStyle(0x176272, 0.38);
                graphics.fillRoundedRect(-width / 2, -height / 2 + 5, width, height, height / 2);
                graphics.fillGradientStyle(
                    hover ? 0x35cbd0 : 0x24b7c3,
                    hover ? 0x35cbd0 : 0x24b7c3,
                    0x16879d,
                    0x116e86,
                    1
                );
                graphics.fillRoundedRect(-width / 2, -height / 2, width, height, height / 2);
                graphics.fillStyle(0xffffff, 0.18);
                graphics.fillRoundedRect(-width / 2 + 9, -height / 2 + 6, width - 18, 16, 8);
                graphics.lineStyle(2, 0x8af0ed, 0.82);
                graphics.strokeRoundedRect(-width / 2, -height / 2, width, height, height / 2);
            }
        };

        draw(false);

        const icon = label === 'NEXT LEVEL' || label === 'TRY AGAIN'
            ? '▶'
            : /REPLAY|RETRY/i.test(label)
                ? '↻'
                : '⌂';
        const iconText = scene.add
            .text(-98, -1, icon, {
                fontFamily: FONT_DISPLAY,
                fontSize: '24px',
                color: '#ffffff',
            })
            .setOrigin(0.5);

        const text = scene.add
            .text(0, -1, label, {
                fontFamily: FONT_DISPLAY,
                fontSize: primary ? '22px' : '14px',
                color: '#ffffff',
                stroke: primary ? '#bd6d18' : '#126174',
                strokeThickness: 3,
            })
            .setOrigin(0.5);

        const hit = scene.add
            .rectangle(0, 0, width, height, 0xffffff, 0.001)
            .setInteractive({ useHandCursor: true });

        button.add([graphics, iconText, text, hit]);
        container.add(button);

        hit.on('pointerover', () => draw(true));
        hit.on('pointerout', () => draw(false));
        hit.on('pointerdown', (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: { stopPropagation: () => void }) => {
            event.stopPropagation();
            if (this.actionLocked) {
                return;
            }

            this.actionLocked = true;
            onClick();

            if (this.container) {
                this.actionLocked = false;
            }
        });

        addPressFx(scene, hit, button, {
            hoverScale: primary ? 1.035 : 1.03,
            pressScale: 0.94,
        });
    }
}
