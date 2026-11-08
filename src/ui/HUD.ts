import { FONT, FONT_DISPLAY, GAME_HEIGHT, GAME_WIDTH } from '../game/config';
import { addPressFx } from './uiFx';

export interface HudCallbacks {
    onPause: () => void;
    onPowerUp: (powerUp: PowerUpId) => boolean;
    onPlusButton?: (id: PlusButtonId) => void;
}

export type PowerUpId = 'bomb' | 'colorChanger' | 'lightning' | 'fireball';
export type PlusButtonId = 'bomb' | 'colorChanger' | 'fireball';

import {
    CANVAS_TOP_ANCHOR,
    levelX,
    NOTICE_X,
    NOTICE_Y,
    PLUS_BUTTON_HIT_RADIUS,
    PLUS_BUTTON_RADIUS,
    PLUS_BUTTON_XS,
    PLUS_BUTTON_Y,
    PROGRESS_HEIGHT,
    PROGRESS_WIDTH,
    PROGRESS_X,
    PROGRESS_Y,
    scoreX,
    SHOTS_X,
    SHOTS_Y,
    TOOLBAR_HEIGHT,
    TOOLBAR_BUTTON_XS,
    TOOLBAR_BUTTON_Y,
    TOOLBAR_Y,
} from './hudAnchors';

const PAUSE_RADIUS = 25;
const POWER_BUTTON_RADIUS = 27;

const POWER_UP_BUTTONS = [
    { id: 'bomb', key: 'powerup-bomb', label: 'BOMB' },
    { id: 'colorChanger', key: 'powerup-color', label: 'COLOR' },
    { id: 'fireball', key: 'icon-fire', label: 'FIREBALL' },
] as const;

interface LiquidFillState {
    target: number;
    display: number;
    phase: number;
    readyGlow: number;
    tween: Phaser.Tweens.Tween | null;
    readyTween: Phaser.Tweens.Tween | null;
}

export class HUD {
    private readonly scene: Phaser.Scene;
    private readonly callbacks: HudCallbacks;
    private readonly container: Phaser.GameObjects.Container;
    private readonly scoreValue: Phaser.GameObjects.Text;
    private readonly levelValue: Phaser.GameObjects.Text;
    private readonly objectiveText: Phaser.GameObjects.Text;
    private readonly progressFill: Phaser.GameObjects.Graphics;
    private readonly progressStars: Phaser.GameObjects.Image[];
    private readonly shotsValue: Phaser.GameObjects.Text;
    private readonly shotsCaption: Phaser.GameObjects.Text;
    private extraBallsToast: Phaser.GameObjects.Container | null = null;
    /** True while the color-button's rewarded video is playing. */
    private colorAdActive = false;
    private readonly pauseButton: Phaser.GameObjects.Container;
    private readonly pauseIcon: Phaser.GameObjects.Image;
    private readonly powerUpButtons = new Map<PowerUpId, Phaser.GameObjects.Container>();
    private readonly powerUpHits = new Map<PowerUpId, Phaser.GameObjects.Arc>();
    private readonly powerUpIcons = new Map<PowerUpId, Phaser.GameObjects.Image>();
    private readonly powerUpCards = new Map<PowerUpId, Phaser.GameObjects.Graphics>();
    /**
     * Visual-only plus badges on the upper-right edge of the bomb, color
     * and fire buttons (~50% inside, ~50% outside). All three share the
     * exact same Bomb-badge design via createPlusButton. No purchase,
     * ad, reward or extra-charge behaviour is wired yet — the buttons are
     * interactive only for press feedback and aim filtering. Stored so the
     * future hook can attach without re-laying out the HUD.
     */
    private readonly plusButtons = new Map<PlusButtonId, Phaser.GameObjects.Container>();
    private readonly plusHits = new Map<PlusButtonId, Phaser.GameObjects.Arc>();
    private readonly fireLiquid = this.createLiquidState();
    private readonly bombLiquid = this.createLiquidState();
    private fireLiquidGraphics: Phaser.GameObjects.Graphics | null = null;
    private bombLiquidGraphics: Phaser.GameObjects.Graphics | null = null;
    
    
    private fireLiquidMaskShape: Phaser.GameObjects.Graphics | null = null;
    private bombLiquidMaskShape: Phaser.GameObjects.Graphics | null = null;
    private fireChargeLabel: Phaser.GameObjects.Text | null = null;
    private colorChargeLabel: Phaser.GameObjects.Text | null = null;
    private bombStatusLabel: Phaser.GameObjects.Text | null = null;
    private bombAvailable = false;
    private bombActive = false;
    private bombCount = 0;
    private fireballCount = 0;
    private colorChangerCount = 0;
    private readonly onUpdate = (_time: number, delta: number): void => {
        this.animateLiquid(delta);
    };

    private score = 0;
    private targetScore = 0;
    private initialTargetBubbles = 0;
    private remainingTargetBubbles = 0;
    private shotLimits: readonly number[] = [];
    private shotsUsed = 0;
    private lastShots = -1;

    constructor(scene: Phaser.Scene, callbacks: HudCallbacks) {
        this.scene = scene;
        this.callbacks = callbacks;

        this.levelValue = scene.add.text(levelX(), CANVAS_TOP_ANCHOR, 'Lv. 1', {
            fontFamily: FONT,
            fontSize: '18px',
            color: '#ffffff',
            stroke: '#174873',
            strokeThickness: 4,
        });

        this.scoreValue = scene.add
            .text(scoreX(), CANVAS_TOP_ANCHOR, '0', {
                fontFamily: FONT_DISPLAY,
                fontSize: '20px',
                color: '#ffffff',
                stroke: '#174873',
                strokeThickness: 4,
            })
            .setOrigin(1, 0);

        const progressBg = scene.add.graphics();
        progressBg.fillStyle(0x194f79, 0.44);
        progressBg.fillRoundedRect(
            PROGRESS_X,
            PROGRESS_Y,
            PROGRESS_WIDTH,
            PROGRESS_HEIGHT,
            PROGRESS_HEIGHT / 2
        );
        progressBg.lineStyle(1.5, 0xffffff, 0.88);
        progressBg.strokeRoundedRect(
            PROGRESS_X,
            PROGRESS_Y,
            PROGRESS_WIDTH,
            PROGRESS_HEIGHT,
            PROGRESS_HEIGHT / 2
        );

        this.progressFill = scene.add.graphics();
        this.progressStars = [0, 1, 2].map((index) =>
            scene.add
                .image(PROGRESS_X, PROGRESS_Y + PROGRESS_HEIGHT / 2, 'icon-star')
                .setDisplaySize(19, 19)
                .setOrigin(0.5)
                .setTint(0x9bb7ca)
                .setAlpha(0.72)
                .setData('starIndex', index)
        );

        this.objectiveText = scene.add
            .text(PROGRESS_X + PROGRESS_WIDTH / 2, CANVAS_TOP_ANCHOR + 33, '', {
                fontFamily: FONT,
                fontSize: '9px',
                color: '#ffffff',
                stroke: '#27608a',
                strokeThickness: 2,
                align: 'center',
            })
            .setOrigin(0.5, 0);

        const toolbar = scene.add.graphics();
        this.drawToolbar(toolbar);

        const toolbarItems: Phaser.GameObjects.GameObject[] = [toolbar];

        POWER_UP_BUTTONS.forEach((item, index) => {
            const centerX = TOOLBAR_BUTTON_XS[index];
            const button = scene.add.container(centerX, TOOLBAR_BUTTON_Y + 1);
            const card = scene.add.graphics();
            this.drawPowerCard(card, item.id, false);

            const liquid = (item.id === 'fireball' || item.id === 'bomb') ? scene.add.graphics() : null;
            if (liquid) {
                const maskShape = scene.make.graphics({ x: 0, y: 0 }, false);
                maskShape.setPosition(centerX, TOOLBAR_BUTTON_Y + 1);
                maskShape.fillStyle(0xffffff, 1);
                maskShape.fillCircle(0, 0, POWER_BUTTON_RADIUS - 1);
                const mask = maskShape.createGeometryMask();
                liquid.setMask(mask);
                if (item.id === 'fireball') {
                    this.fireLiquidGraphics = liquid;
                    
                    this.fireLiquidMaskShape = maskShape;
                } else {
                    this.bombLiquidGraphics = liquid;
                    
                    this.bombLiquidMaskShape = maskShape;
                }
            }

            const icon = scene.add
                .image(0, 0, item.key)
                .setDisplaySize(48, 48)
                .setDepth(2);

            const hitArea = scene.add
                .circle(0, 0, 32, 0xffffff, 0.001)
                .setInteractive({ useHandCursor: true })
                .setDepth(4);

            const contents: Phaser.GameObjects.GameObject[] = [card];
            if (liquid) contents.push(liquid);

            if (item.id === 'fireball') {
                // Same badge position/size/style as the Bomb counter.
                this.fireChargeLabel = scene.add
                    .text(0, 24, '0', {
                        fontFamily: FONT_DISPLAY,
                        fontSize: '8px',
                        color: '#ffffff',
                        stroke: '#123a35',
                        strokeThickness: 3,
                    })
                    .setOrigin(0.5)
                    .setDepth(3);
                contents.push(icon, this.fireChargeLabel, hitArea);
            } else if (item.id === 'bomb') {
                this.bombStatusLabel = scene.add
                    .text(0, 24, '0', {
                        fontFamily: FONT_DISPLAY,
                        fontSize: '8px',
                        color: '#f7e8d0',
                        stroke: '#123a35',
                        strokeThickness: 3,
                    })
                    .setOrigin(0.5)
                    .setAlpha(0.72)
                    .setDepth(3);
                contents.push(icon, this.bombStatusLabel, hitArea);
            } else {
                // Color Change counter: same badge position/size/style as the
                // Bomb and Fire counters, showing live inventory quantity.
                this.colorChargeLabel = scene.add
                    .text(0, 24, '0', {
                        fontFamily: FONT_DISPLAY,
                        fontSize: '8px',
                        color: '#ffffff',
                        stroke: '#123a35',
                        strokeThickness: 3,
                    })
                    .setOrigin(0.5)
                    .setDepth(3);
                contents.push(icon, this.colorChargeLabel, hitArea);
            }

            hitArea.on('pointerdown', () => {
                // The colour-change button's ad flow locks while its video
                // plays — spurious taps must not stack ad requests.
                if (item.id === 'colorChanger' && this.colorAdActive) {
                    return;
                }
                if (item.id === 'bomb' && !this.bombAvailable && !this.bombActive) {
                    return;
                }
                callbacks.onPowerUp(item.id);
            });
            addPressFx(scene, hitArea, button, { hoverScale: 1.04, pressScale: 0.94 });

            this.powerUpHits.set(item.id, hitArea);
            this.powerUpIcons.set(item.id, icon);
            this.powerUpCards.set(item.id, card);

            // No on-button multiplier badges (x1/x2/x3): the buttons show
            // only their icons; progress is shown as liquid fill.
            this.powerUpButtons.set(item.id, button);
            button.add(contents);
            toolbarItems.push(button);
        });

        // Plus badges sit on the upper-right edge of the bomb, color and
        // fire buttons (~50% inside the power circle, ~50% outside) at
        // (powerX + 18.5, powerY - 18.5), all identical to the Bomb badge.
        // They are created AFTER the power buttons so the full plus circle
        // renders on top and stays clearly visible over the overlap;
        // derived from the toolbar anchors, so they reflow on every
        // viewport size and stay inside the screen.
        const plusTargets = [
            { id: 'bomb' as const, x: PLUS_BUTTON_XS[0], label: 'Add Bomb' },
            { id: 'colorChanger' as const, x: PLUS_BUTTON_XS[1], label: 'Add Color' },
            { id: 'fireball' as const, x: PLUS_BUTTON_XS[2], label: 'Add Fire' },
        ];
        plusTargets.forEach((target) => {
            const plus = this.createPlusButton(target.x, PLUS_BUTTON_Y, target.id, target.label);
            this.plusButtons.set(target.id, plus);
            toolbarItems.push(plus);
        });

        this.pauseButton = this.createIconButton(
            TOOLBAR_BUTTON_XS[3],
            TOOLBAR_BUTTON_Y + 1,
            PAUSE_RADIUS,
            'Pause',
            () => callbacks.onPause()
        );

        this.pauseIcon = scene.add
            .image(0, 0, 'icon-pause')
            .setDisplaySize(29, 29);
        this.pauseButton.add(this.pauseIcon);
        toolbarItems.push(this.pauseButton);

        const shotsCard = scene.add.graphics();
        shotsCard.fillStyle(0x2d5be8, 0.96);
        shotsCard.fillRoundedRect(SHOTS_X - 37, SHOTS_Y, 74, 34, 15);
        shotsCard.lineStyle(1.5, 0xffffff, 0.9);
        shotsCard.strokeRoundedRect(SHOTS_X - 37, SHOTS_Y, 74, 34, 15);

        const shotsLabel = scene.add
            .text(SHOTS_X - 22, SHOTS_Y + 8, 'SHOTS', {
                fontFamily: FONT,
                fontSize: '8px',
                color: '#dceaff',
            })
            .setOrigin(0, 0.5);

        this.shotsValue = scene.add
            .text(SHOTS_X + 20, SHOTS_Y + 17, '00', {
                fontFamily: FONT_DISPLAY,
                fontSize: '18px',
                color: '#ffffff',
            })
            .setOrigin(0.5);

        this.shotsCaption = scene.add
            .text(SHOTS_X, SHOTS_Y + 40, '', {
                fontFamily: FONT,
                fontSize: '7px',
                color: '#ffffff',
                stroke: '#27608a',
                strokeThickness: 2,
            })
            .setOrigin(0.5, 0);

        this.container = scene.add.container(0, 0, [
            progressBg,
            this.progressFill,
            ...this.progressStars,
            this.levelValue,
            this.scoreValue,
            this.objectiveText,
            ...toolbarItems,
            shotsCard,
            shotsLabel,
            this.shotsValue,
            this.shotsCaption,
        ]);

        this.container.setDepth(90);
        this.container.setAlpha(0).setY(-18);

        scene.tweens.add({
            targets: this.container,
            y: 0,
            alpha: 1,
            duration: 260,
            ease: 'Quad.easeOut',
        });

        this.updateProgress();
        scene.events.on('update', this.onUpdate, this);
        this.setBombState(false, false);
        this.setFireChargeProgress(0);
    }

    setScore(score: number): void {
        this.score = Math.max(0, Math.floor(Number(score) || 0));
        this.scene.tweens.killTweensOf(this.scoreValue);
        this.scoreValue.setText(this.score.toLocaleString('en-US'));
        this.scoreValue.setScale(1);
        this.scene.tweens.add({
            targets: this.scoreValue,
            scaleX: 1.08,
            scaleY: 1.08,
            duration: 90,
            yoyo: true,
            ease: 'Quad.easeOut',
        });
        this.updateProgress();
    }

    setLevel(
        level: number,
        name: string,
        objective: string,
        shotLimits: readonly number[]
    ): void {
        this.targetScore = 0;
        this.shotLimits = shotLimits.map((limit) =>
            Math.max(1, Math.floor(Number(limit) || 0))
        );
        this.levelValue.setText(`Lv. ${level}`);
        this.objectiveText.setText(objective);
        this.levelValue.setData('levelName', name);
        this.updateProgress();
    }

    setTargetProgress(initial: number, remaining: number): void {
        this.initialTargetBubbles = Math.max(0, Math.floor(Number(initial) || 0));
        this.remainingTargetBubbles = Math.max(0, Math.floor(Number(remaining) || 0));
        const cleared = Math.max(0, this.initialTargetBubbles - this.remainingTargetBubbles);
        const progress = this.initialTargetBubbles > 0
            ? Math.max(0, Math.min(1, cleared / this.initialTargetBubbles))
            : 0;
        this.objectiveText.setText(`BUBBLES ${this.remainingTargetBubbles}  ·  ${Math.round(progress * 100)}%`);
        this.updateProgress();
    }

    setShots(
        remaining: number,
        maxShots: number,
        shotsUsed: number,
        untilNextDrop: number
    ): void {
        const left = Math.max(0, Math.floor(Number(remaining) || 0));
        const total = Math.max(0, Math.floor(Number(maxShots) || 0));
        const used = Math.max(0, Math.floor(Number(shotsUsed) || 0));
        const dropIn = Math.max(0, Math.floor(Number(untilNextDrop) || 0));

        this.shotsUsed = used;
        this.shotsValue.setText(String(left).padStart(2, '0'));
        this.shotsValue.setColor(left <= 3 ? '#ffe0a6' : '#ffffff');
        this.shotsCaption.setText(
            dropIn > 0 ? `OF ${total} · DROP ${dropIn}` : `OF ${total} · NO DROPS`
        );
        this.shotsCaption.setColor(left <= 3 ? '#ffe0a6' : '#ffffff');

        if (this.lastShots >= 0 && this.lastShots !== left) {
            this.scene.tweens.killTweensOf(this.shotsValue);
            this.shotsValue.setScale(1);
            this.scene.tweens.add({
                targets: this.shotsValue,
                scaleX: 1.1,
                scaleY: 1.1,
                duration: 90,
                yoyo: true,
                ease: 'Quad.easeOut',
            });
        }

        this.lastShots = left;
        this.updateProgress();
    }

    setPaused(paused: boolean): void {
        this.pauseIcon.setTexture(paused ? 'icon-play' : 'icon-pause');
    }

    /** Disables the color button while its rewarded video is playing. */
    setColorAdLoading(loading: boolean): void {
        this.colorAdActive = loading;
        const button = this.powerUpButtons.get('colorChanger');
        button?.setAlpha(loading ? 0.62 : 1);
    }

    /** Small transient hint above the shooter bar (e.g. "ads unavailable"). */
    showExtraBallsNotice(message: string): void {
        const scene = this.scene;

        this.extraBallsToast?.destroy(true);

        const toast = scene.add.container(NOTICE_X, NOTICE_Y);
        const background = scene.add.graphics();
        background.fillStyle(0x0b1c33, 0.92);
        background.fillRoundedRect(-112, -13, 224, 26, 13);
        background.lineStyle(1.5, 0x7fc3ff, 0.85);
        background.strokeRoundedRect(-112, -13, 224, 26, 13);

        const text = scene.add
            .text(0, 0, message, {
                fontFamily: FONT,
                fontSize: '9px',
                color: '#eaf6ff',
                align: 'center',
                wordWrap: { width: 208 },
            })
            .setOrigin(0.5);

        toast.add([background, text]);
        this.container.add(toast);
        this.extraBallsToast = toast;

        scene.tweens.add({
            targets: toast,
            alpha: 0,
            delay: 1500,
            duration: 420,
            onComplete: () => {
                if (this.extraBallsToast === toast) {
                    this.extraBallsToast = null;
                }
                toast.destroy(true);
            },
        });
    }

    setActivePowerUp(powerUp: PowerUpId | null): void {
        this.bombActive = powerUp === 'bomb';
        this.powerUpButtons.forEach((button, id) => {
            this.scene.tweens.killTweensOf(button);
            button.setScale(id === powerUp ? 1.16 : 1);
            if (id === powerUp) {
                this.scene.tweens.add({ targets: button, scale: 1.22, duration: 280, yoyo: true, repeat: -1 });
            }
        });
        this.refreshBombVisuals();
    }

    setBombState(available: boolean, active = this.bombActive): void {
        this.bombAvailable = available;
        this.bombActive = available ? active : false;
        this.refreshBombVisuals();
    }

    /**
     * Shows shared inventory quantities below the Bomb, Fire and Color
     * Change buttons (digits only, e.g. `3`), with liquid/glow ready while
     * stock lasts.
     */
    setPowerUpCounts(bomb: number, fireball: number, colorChanger = 0): void {
        this.bombCount = Math.max(0, Math.floor(bomb) || 0);
        this.fireballCount = Math.max(0, Math.floor(fireball) || 0);
        this.colorChangerCount = Math.max(0, Math.floor(colorChanger) || 0);
        if (this.bombStatusLabel) {
            this.bombStatusLabel.setText(String(this.bombCount));
            this.bombStatusLabel.setAlpha(1);
        }
        if (this.fireChargeLabel) {
            this.fireChargeLabel.setText(String(this.fireballCount));
            this.fireChargeLabel.setAlpha(1);
        }
        if (this.colorChargeLabel) {
            this.colorChargeLabel.setText(String(this.colorChangerCount));
            this.colorChargeLabel.setAlpha(1);
        }
        const bombOn = this.bombCount > 0;
        const fireOn = this.fireballCount > 0;
        this.setLiquidTarget(this.bombLiquid, bombOn ? 100 : 0, bombOn ? 360 : 420);
        if (bombOn) {
            this.startReadyGlow(this.bombLiquid);
        } else {
            this.stopReadyGlow(this.bombLiquid);
        }
        const fireButton = this.powerUpButtons.get('fireball');
        if (fireButton) {
            this.scene.tweens.killTweensOf(fireButton);
            fireButton.setScale(1);
            if (fireOn) {
                this.scene.tweens.add({ targets: fireButton, scale: 1.05, duration: 420, yoyo: true, repeat: -1 });
            }
        }
        this.setLiquidTarget(this.fireLiquid, fireOn ? 100 : 0, 320);
        if (fireOn) {
            this.startReadyGlow(this.fireLiquid);
        } else {
            this.stopReadyGlow(this.fireLiquid);
        }
    }

    private refreshBombVisuals(): void {
        const button = this.powerUpButtons.get('bomb');
        const hit = this.powerUpHits.get('bomb');
        const icon = this.powerUpIcons.get('bomb');
        if (!button || !hit || !icon) {
            return;
        }

        const enabled = this.bombAvailable || this.bombActive;
        if (enabled) {
            hit.setInteractive({ useHandCursor: true });
        } else {
            hit.disableInteractive();
        }

        button.setAlpha(1);
        icon.setAlpha(enabled ? 1 : 0.72);
        icon.setTint(enabled ? 0xffffff : 0xeceff3);

        if (this.bombStatusLabel) {
            this.bombStatusLabel.setText(String(this.bombCount));
            this.bombStatusLabel.setAlpha(1);
            this.bombStatusLabel.setColor('#ffffff');
        }

        this.setLiquidTarget(this.bombLiquid, enabled ? 100 : 0, enabled ? 360 : 420);
        if (enabled) {
            this.startReadyGlow(this.bombLiquid);
        } else {
            this.stopReadyGlow(this.bombLiquid);
        }
    }

    /**
     * Legacy charge entry (now driven by inventory): liquid fills while
     * stock lasts; the button badge shows the Fire quantity.
     */
    setFireChargeProgress(percent: number): void {
        const target = Math.max(0, Math.min(100, percent));
        const ready = target >= 100;
        if (this.fireChargeLabel) {
            this.fireChargeLabel.setText(String(this.fireballCount));
            this.fireChargeLabel.setAlpha(1);
        }
        const button = this.powerUpButtons.get('fireball');

        if (button) {
            button.setAlpha(1);
            this.scene.tweens.killTweensOf(button);

            if (ready) {
                this.scene.tweens.add({ targets: button, scale: 1.05, duration: 420, yoyo: true, repeat: -1 });
            } else {
                button.setScale(1);
            }
        }

        this.setLiquidTarget(this.fireLiquid, target, 320);
        if (ready) {
            this.startReadyGlow(this.fireLiquid);
        } else {
            this.stopReadyGlow(this.fireLiquid);
        }
    }

    destroy(): void {
        this.scene.events.off('update', this.onUpdate, this);
        this.scene.tweens.killTweensOf(this.scoreValue);
        this.scene.tweens.killTweensOf(this.shotsValue);
        this.fireLiquid.tween?.remove();
        this.fireLiquid.readyTween?.remove();
        this.bombLiquid.tween?.remove();
        this.bombLiquid.readyTween?.remove();
        this.fireLiquidMaskShape?.destroy();
        this.bombLiquidMaskShape?.destroy();
        this.extraBallsToast?.destroy(true);
        this.container.destroy(true);
    }

    private updateProgress(): void {
        this.progressFill.clear();

        const ratio = this.initialTargetBubbles > 0
            ? Math.max(0, Math.min(1, (this.initialTargetBubbles - this.remainingTargetBubbles) / this.initialTargetBubbles))
            : 0;
        const width = PROGRESS_WIDTH * ratio;

        if (width >= 2) {
            const complete = ratio >= 1;
            this.progressFill.fillStyle(complete ? 0x34a979 : 0x28a6d8, 1);
            this.progressFill.fillRoundedRect(
                PROGRESS_X,
                PROGRESS_Y,
                width,
                PROGRESS_HEIGHT,
                Math.min(PROGRESS_HEIGHT / 2, width / 2)
            );
            this.progressFill.fillStyle(0xffffff, 0.32);
            this.progressFill.fillRoundedRect(
                PROGRESS_X + 2,
                PROGRESS_Y + 2,
                Math.max(1, width - 4),
                2,
                1
            );
        }

        const maxLimit = this.shotLimits[2] ?? Math.max(1, this.targetScore);
        this.progressStars.forEach((star, index) => {
            const limit = this.shotLimits[index];
            const onTrack = limit !== undefined && this.shotsUsed <= limit;
            const markerRatio =
                maxLimit > 0 && limit !== undefined
                    ? Math.max(0, Math.min(1, limit / maxLimit))
                    : (index + 1) / 3;

            star.setX(PROGRESS_X + PROGRESS_WIDTH * markerRatio);
            star.setTint(onTrack ? 0xffdc5c : 0x547b98);
            star.setAlpha(onTrack ? 1 : 0.78);
        });
    }

    private drawToolbar(graphics: Phaser.GameObjects.Graphics): void {
        graphics.fillStyle(0xdff3ff, 0.72);
        graphics.fillRoundedRect(12, TOOLBAR_Y, GAME_WIDTH - 24, TOOLBAR_HEIGHT, 22);
        graphics.lineStyle(1.5, 0xffffff, 0.96);
        graphics.strokeRoundedRect(14, TOOLBAR_Y, GAME_WIDTH - 28, TOOLBAR_HEIGHT, 24);
        graphics.fillStyle(0xffffff, 0.24);
        graphics.fillRoundedRect(24, TOOLBAR_Y + 5, GAME_WIDTH - 48, 3, 2);
    }

    private createIconButton(
        x: number,
        y: number,
        radius: number,
        label: string,
        onPress: () => void
    ): Phaser.GameObjects.Container {
        const button = this.scene.add.container(x, y);
        const graphics = this.scene.add.graphics();

        graphics.fillStyle(0x174873, 0.35);
        graphics.fillCircle(0, 3, radius + 2);
        graphics.fillStyle(0x2775dc, 0.98);
        graphics.fillCircle(0, 0, radius);
        graphics.lineStyle(1.5, 0xffffff, 0.92);
        graphics.strokeCircle(0, 0, radius);
        graphics.fillStyle(0xffffff, 0.18);
        graphics.fillCircle(-4, -7, radius - 9);

        const hit = this.scene.add
            .circle(0, 0, radius + 6, 0xffffff, 0.001)
            .setInteractive({ useHandCursor: true });

        hit.on('pointerdown', onPress);
        addPressFx(this.scene, hit, button, { hoverScale: 1.06, pressScale: 0.92 });

        button.add([graphics, hit]);
        button.setSize(radius * 2 + 12, radius * 2 + 12);
        button.setData('label', label);

        return button;
    }

    /** Future hook point for the visual-only plus badges. */
    getPlusButton(id: PlusButtonId): Phaser.GameObjects.Container | undefined {
        return this.plusButtons.get(id);
    }

    /**
     * Scaled duplicate of the middle Color Change button: identical
     * background layers, gradient, rings, highlight and overall styling,
     * with only the icon replaced by a white plus. Interactive with a
     * 44px hit circle for touch, but the press is intentionally a no-op
     * — no purchase/ad/reward logic is wired. The original Color Change
     * button itself is untouched.
     */
    private createPlusButton(
        x: number,
        y: number,
        id: PlusButtonId,
        label: string
    ): Phaser.GameObjects.Container {
        // Clamp so the touch target can never overflow outside the game
        // screen at any viewport size (anchors already keep it inside;
        // this is a defensive bound for narrow/wide layouts).
        const clampedX = Math.min(
            Math.max(x, PLUS_BUTTON_HIT_RADIUS + 2),
            Math.max(PLUS_BUTTON_HIT_RADIUS + 2, GAME_WIDTH - PLUS_BUTTON_HIT_RADIUS - 2)
        );
        const clampedY = Math.min(
            Math.max(y, PLUS_BUTTON_HIT_RADIUS + 2),
            Math.max(PLUS_BUTTON_HIT_RADIUS + 2, GAME_HEIGHT - PLUS_BUTTON_HIT_RADIUS - 2)
        );
        const button = this.scene.add.container(clampedX, clampedY);
        const graphics = this.scene.add.graphics().setDepth(1);

        // Exact Color Change button card, scaled to the plus radius — same
        // colors, gradient and borders, no new palette or style invented.
        this.drawColorChangerCard(graphics, PLUS_BUTTON_RADIUS);
        // Plus icon in place of the Color Change icon: the same white used
        // for the button's rings/highlight, drawn as two rounded bars like
        // the plus badge inside the Color Change artwork.
        graphics.fillStyle(0xffffff, 1);
        graphics.fillRoundedRect(-6, -1.5, 12, 3, 1.5);
        graphics.fillRoundedRect(-1.5, -6, 3, 12, 1.5);

        const hit = this.scene.add
            .circle(0, 0, PLUS_BUTTON_HIT_RADIUS, 0xffffff, 0.001)
            .setInteractive({ useHandCursor: true })
            // Above the power buttons' hit depth (4) to match the visual
            // layering: taps on the overlapping ~50% resolve to the plus
            // badge that is drawn there. The power centre itself lies
            // outside this circle, so power taps still work.
            .setDepth(5);

        // Plus badges open the Coin Store instantly (handled by the scene);
        // no press-scale animation so navigation feels immediate.
        hit.on('pointerdown', () => {
            this.callbacks.onPlusButton?.(id);
        });
        addPressFx(this.scene, hit, button, { hoverScale: 1, pressScale: 1 });

        button.add([graphics, hit]);
        button.setSize(PLUS_BUTTON_HIT_RADIUS * 2, PLUS_BUTTON_HIT_RADIUS * 2);
        button.setData('label', label);
        button.setData('plusButton', true);
        button.setData('powerUp', id);
        button.setData('plusButtonId', id);

        this.plusHits.set(id, hit);
        return button;
    }

    private createLiquidState(): LiquidFillState {
        return { target: 0, display: 0, phase: Math.random() * Math.PI * 2, readyGlow: 0, tween: null, readyTween: null };
    }

    /**
     * The Color Change button's card, parameterized by radius so the plus
     * badges are an exact scaled duplicate of it. Every layer (outer
     * 0x6754d9 disc, mid 0x9b63e9 disc, inner 0xd68cff disc, white
     * highlight, 0xe8d1ff outer ring and white inner ring) uses the same
     * colors, alphas and proportions — offsets and ring widths scale with
     * the radius, so at POWER_BUTTON_RADIUS this draws exactly the
     * original button and at PLUS_BUTTON_RADIUS it draws its smaller
     * duplicate.
     */
    private drawColorChangerCard(card: Phaser.GameObjects.Graphics, radius: number): void {
        const s = radius / POWER_BUTTON_RADIUS;
        card.clear();
        card.fillStyle(0x6754d9, 0.96);
        card.fillCircle(0, 0, radius);
        card.fillStyle(0x9b63e9, 0.98);
        card.fillCircle(0, 1 * s, radius - 4 * s);
        card.fillStyle(0xd68cff, 0.92);
        card.fillCircle(-2 * s, 4 * s, radius - 10 * s);
        card.fillStyle(0xffffff, 0.14);
        card.fillCircle(-7 * s, -8 * s, 9 * s);
        card.lineStyle(3 * s, 0xe8d1ff, 0.98);
        card.strokeCircle(0, 0, radius);
        card.lineStyle(1 * s, 0xffffff, 0.75);
        card.strokeCircle(0, 0, radius - 5 * s);
    }

    private drawPowerCard(card: Phaser.GameObjects.Graphics, id: PowerUpId, active: boolean): void {
        card.clear();
        if (id === 'colorChanger') {
            this.drawColorChangerCard(card, POWER_BUTTON_RADIUS);
            return;
        }

        // Transparent container look: unfilled area stays pale/disabled.
        card.fillStyle(active ? 0xf8fbff : 0xf3f6f9, active ? 0.34 : 0.92);
        card.fillCircle(0, 0, POWER_BUTTON_RADIUS);
        card.lineStyle(active ? 2.5 : 2, active ? 0xffffff : 0xdbe4ec, active ? 0.92 : 0.95);
        card.strokeCircle(0, 0, POWER_BUTTON_RADIUS);
        card.lineStyle(1, 0xffffff, active ? 0.36 : 0.7);
        card.strokeCircle(0, 0, POWER_BUTTON_RADIUS - 4);
        card.fillStyle(0xffffff, active ? 0.08 : 0.22);
        card.fillCircle(-7, -10, 8);
    }

    private setLiquidTarget(state: LiquidFillState, target: number, duration = 320): void {
        const next = Math.max(0, Math.min(100, target));
        if (Math.abs(state.target - next) < 0.01 && Math.abs(state.display - next) < 0.01) {
            state.target = next;
            state.display = next;
            return;
        }
        state.target = next;
        state.tween?.remove();
        state.tween = this.scene.tweens.add({
            targets: state,
            display: next,
            duration,
            ease: 'Sine.easeInOut',
        });
    }

    private startReadyGlow(state: LiquidFillState): void {
        if (state.readyTween) return;
        state.readyTween = this.scene.tweens.add({
            targets: state,
            readyGlow: 1,
            duration: 520,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });
    }

    private stopReadyGlow(state: LiquidFillState): void {
        state.readyTween?.remove();
        state.readyTween = null;
        state.readyGlow = 0;
    }

    private animateLiquid(delta: number): void {
        const dt = Math.min(60, Math.max(0, delta));
        this.fireLiquid.phase += dt * 0.0032;
        this.bombLiquid.phase += dt * 0.0028;

        const fireCard = this.powerUpCards.get('fireball');
        if (fireCard) this.drawPowerCard(fireCard, 'fireball', this.fireLiquid.display > 0.5);
        const bombCard = this.powerUpCards.get('bomb');
        if (bombCard) this.drawPowerCard(bombCard, 'bomb', this.bombLiquid.display > 0.5 || this.bombAvailable || this.bombActive);

        this.drawLiquid(this.fireLiquidGraphics, this.fireLiquid, 'fire');
        this.drawLiquid(this.bombLiquidGraphics, this.bombLiquid, 'bomb');

        const fireReady = this.fireLiquid.display >= 99.5;
        this.powerUpIcons.get('fireball')?.setAlpha(fireReady ? 1 : this.fireLiquid.display > 0 ? 0.92 : 0.72);
        this.powerUpIcons.get('fireball')?.setTint(fireReady ? 0xffffff : this.fireLiquid.display > 0 ? 0xfff5ea : 0xeceff3);
        this.fireChargeLabel?.setText(`${Math.floor(this.fireLiquid.display)}%`);
        this.fireChargeLabel?.setAlpha(this.fireLiquid.display > 0 ? 1 : 0.72);
    }

    private drawLiquid(
        graphics: Phaser.GameObjects.Graphics | null,
        state: LiquidFillState,
        type: 'fire' | 'bomb'
    ): void {
        if (!graphics) return;
        graphics.clear();

        const percent = Math.max(0, Math.min(100, state.display));
        if (percent <= 0.01 && type === 'bomb') return;

        const radius = POWER_BUTTON_RADIUS - 2;
        if (type === 'fire') {
            this.drawFireSegmentFill(graphics, radius, percent, state);
            return;
        }

        const fillHeight = (percent / 100) * radius * 2;
        const surfaceY = radius - fillHeight;
        const ready = percent >= 99.5;
        const waveAmp = ready ? 1.5 : Math.max(1.1, 2.1 * (percent / 100));
        const glow = ready ? 0.14 + state.readyGlow * 0.12 : 0;

        this.drawWaveFill(graphics, radius, surfaceY, waveAmp, state.phase, 0xd92f4d, 0.92);
        this.drawWaveFill(graphics, radius, surfaceY - 1.5, waveAmp * 0.82, state.phase + 0.8, 0xff6b5d, 0.9);
        this.drawWaveFill(graphics, radius, surfaceY - 3.2, waveAmp * 0.64, state.phase + 1.7, 0xffa04f, 0.88);

        graphics.lineStyle(2, 0xffffff, 0.28);
        graphics.beginPath();
        for (let x = -radius; x <= radius; x += 2) {
            const yLimit = Math.sqrt(Math.max(0, radius * radius - x * x));
            const y = surfaceY + Math.sin(x * 0.28 + state.phase) * waveAmp;
            if (Math.abs(y) > yLimit) continue;
            if (x === -radius) graphics.moveTo(x, y);
            else graphics.lineTo(x, y);
        }
        graphics.strokePath();

        for (let i = 0; i < 3; i++) {
            const bx = Math.sin(state.phase * 0.8 + i * 1.37) * (radius * 0.45);
            const rise = ((state.phase * 10 + i * 18) % (fillHeight + 10));
            const by = radius - rise;
            if (by < surfaceY + 2) continue;
            if (bx * bx + by * by > (radius - 3) * (radius - 3)) continue;
            graphics.fillStyle(0xffffff, 0.14);
            graphics.fillCircle(bx, by, 1.4 + (i % 2) * 0.6);
        }

        if (glow > 0) {
            graphics.fillStyle(0xffc46b, glow);
            graphics.fillCircle(0, 0, radius);
            graphics.lineStyle(2, 0xffffff, 0.35 + state.readyGlow * 0.25);
            graphics.strokeCircle(0, 0, radius + 0.5);
        }
    }

    private drawWaveFill(
        graphics: Phaser.GameObjects.Graphics,
        radius: number,
        surfaceY: number,
        amplitude: number,
        phase: number,
        color: number,
        alpha: number
    ): void {
        graphics.fillStyle(color, alpha);
        graphics.beginPath();
        let started = false;
        for (let x = -radius; x <= radius; x += 2) {
            const yLimit = Math.sqrt(Math.max(0, radius * radius - x * x));
            const waveY = Math.max(-yLimit, Math.min(yLimit, surfaceY + Math.sin(x * 0.24 + phase) * amplitude));
            const y = Math.min(yLimit, waveY);
            if (y >= yLimit) {
                started = false;
                continue;
            }
            if (!started) {
                graphics.moveTo(x, yLimit);
                graphics.lineTo(x, y);
                started = true;
            } else {
                graphics.lineTo(x, y);
            }
        }
        for (let x = radius; x >= -radius; x -= 2) {
            const yLimit = Math.sqrt(Math.max(0, radius * radius - x * x));
            const waveY = Math.max(-yLimit, Math.min(yLimit, surfaceY + Math.sin(x * 0.24 + phase) * amplitude));
            if (waveY < yLimit) {
                graphics.lineTo(x, yLimit);
            }
        }
        graphics.closePath();
        graphics.fillPath();
    }

    private drawFireSegmentFill(
        graphics: Phaser.GameObjects.Graphics,
        radius: number,
        percent: number,
        state: LiquidFillState
    ): void {
        const segments = 100;
        const segmentHeight = (radius * 2) / segments;
        const filledExact = Math.max(0, Math.min(segments, percent));
        const fullyFilled = Math.floor(filledExact + 0.0001);
        const partial = filledExact - fullyFilled;
        const ready = percent >= 99.5;
        const waveAmp = ready ? 1.1 : Math.max(0.6, 1.3 * (percent / 100));
        const waveY = (x: number): number => Math.sin(x * 0.22 + state.phase) * waveAmp;

        // Exact 100-segment colour fill: every segment is first the Disabled
        // Button colour, then the charged 1% slices are painted with the
        // original Fire Button colour. No glow effect is used for unfilled
        // segments; the charged colour area therefore matches the charge %.
        for (let i = 0; i < segments; i++) {
            const yBottom = radius - i * segmentHeight;
            const yTop = yBottom - segmentHeight;
            this.fillSegmentClipped(
                graphics,
                radius,
                yBottom,
                yTop,
                1,
                0xf3f6f9,
                1,
                (x) => Math.min(yBottom, waveY(x) + yBottom - segmentHeight * 0.15)
            );

            let coverage = 0;
            if (i < fullyFilled) coverage = 1;
            else if (i === fullyFilled && partial > 0.001) coverage = partial;
            if (coverage <= 0) {
                continue;
            }

            // Original Fire Button colour for the charged portion.
            this.fillSegmentClipped(graphics, radius, yBottom, yTop, coverage, 0xff5c1f, 1, waveY);
        }

        if (ready) {
            // Ready state is the subtle button pulse in setFireChargeProgress;
            // at 100% every segment is already the original Fire colour, so
            // no overlay colour is added here.
            graphics.lineStyle(2, 0xfff1c0, 0.3 + state.readyGlow * 0.35);
            graphics.strokeCircle(0, 0, radius + 0.5);
        }
    }

    private fillSegmentClipped(
        graphics: Phaser.GameObjects.Graphics,
        radius: number,
        yBottom: number,
        yTop: number,
        coverage: number,
        color: number,
        alpha: number,
        surface: (x: number) => number
    ): void {
        const clampedCoverage = Math.max(0, Math.min(1, coverage));
        if (clampedCoverage <= 0) return;
        graphics.fillStyle(color, alpha);
        graphics.beginPath();
        let started = false;
        for (let x = -radius; x <= radius; x += 2) {
            const yLimit = Math.sqrt(Math.max(0, radius * radius - x * x));
            const bottom = Math.min(yLimit, yBottom);
            const fillTop = yBottom - (yBottom - yTop) * clampedCoverage;
            const top = Math.max(-yLimit, Math.max(yTop, Math.min(yBottom, Math.max(fillTop, surface(x)))));
            if (top >= bottom) {
                started = false;
                continue;
            }
            if (!started) {
                graphics.moveTo(x, bottom);
                graphics.lineTo(x, top);
                started = true;
            } else {
                graphics.lineTo(x, top);
            }
        }
        for (let x = radius; x >= -radius; x -= 2) {
            const yLimit = Math.sqrt(Math.max(0, radius * radius - x * x));
            graphics.lineTo(x, Math.min(yLimit, yBottom));
        }
        graphics.closePath();
        graphics.fillPath();
    }

}
