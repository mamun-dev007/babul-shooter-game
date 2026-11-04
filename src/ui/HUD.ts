import { FONT, FONT_DISPLAY, GAME_WIDTH } from '../game/config';
import { addPressFx } from './uiFx';

export interface HudCallbacks {
    onPause: () => void;
    onPowerUp: (powerUp: PowerUpId) => boolean;
}

export type PowerUpId = 'bomb' | 'colorChanger' | 'lightning' | 'fireball';

import {
    CANVAS_TOP_ANCHOR,
    levelX,
    NOTICE_X,
    NOTICE_Y,
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

const POWER_UP_BUTTONS = [
    { id: 'bomb', key: 'powerup-bomb', label: 'BOMB' },
    { id: 'colorChanger', key: 'powerup-color', label: 'COLOR' },
    { id: 'fireball', key: 'icon-fire', label: 'FIREBALL' },
] as const;

export class HUD {
    private readonly scene: Phaser.Scene;
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
    private readonly powerUpCounts = new Map<PowerUpId, Phaser.GameObjects.Text>();
    private readonly powerUpButtons = new Map<PowerUpId, Phaser.GameObjects.Container>();

    private score = 0;
    private targetScore = 0;
    private initialTargetBubbles = 0;
    private remainingTargetBubbles = 0;
    private shotLimits: readonly number[] = [];
    private shotsUsed = 0;
    private lastShots = -1;

    constructor(scene: Phaser.Scene, callbacks: HudCallbacks) {
        this.scene = scene;

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
            const powerStyles = {
                bomb: { outer: 0xd92f4d, middle: 0xff6b5d, inner: 0xffa04f, border: 0xffd4a1 },
                colorChanger: { outer: 0x6754d9, middle: 0x9b63e9, inner: 0xd68cff, border: 0xe8d1ff },
                fireball: { outer: 0xd92f20, middle: 0xff5c1f, inner: 0xffb52d, border: 0xffcf69 },
            } as const;
            const style = powerStyles[item.id];
            card.fillStyle(style.outer, 0.96);
            card.fillCircle(0, 0, 27);
            card.fillStyle(style.middle, 0.98);
            card.fillCircle(0, 1, 23);
            card.fillStyle(style.inner, 0.92);
            card.fillCircle(-2, 4, 17);
            card.fillStyle(0xffffff, 0.14);
            card.fillCircle(-7, -8, 9);
            card.lineStyle(3, style.border, 0.98);
            card.strokeCircle(0, 0, 27);
            card.lineStyle(1, 0xffffff, 0.75);
            card.strokeCircle(0, 0, 22);

            const icon = scene.add
                .image(0, 0, item.key)
                .setDisplaySize(48, 48);

            const status = scene.add
                .text(20, 19, 'x0', {
                    fontFamily: FONT_DISPLAY,
                    fontSize: '9px',
                    color: '#ffffff',
                    backgroundColor: '#ef4f55',
                    padding: { x: 3, y: 1 },
                })
                .setOrigin(0.5);

            const hitArea = scene.add
                .circle(0, 0, 32, 0xffffff, 0.001)
                .setInteractive({ useHandCursor: true });

            hitArea.on('pointerdown', () => {
                // The colour-change button's ad flow locks while its video
                // plays — spurious taps must not stack ad requests.
                if (item.id === 'colorChanger' && this.colorAdActive) {
                    return;
                }
                callbacks.onPowerUp(item.id);
            });
            addPressFx(scene, hitArea, button, { hoverScale: 1.04, pressScale: 0.94 });

            this.powerUpCounts.set(item.id, status);
            this.powerUpButtons.set(item.id, button);
            button.add([card, icon, status, hitArea]);
            toolbarItems.push(button);
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
        this.powerUpButtons.forEach((button, id) => {
            this.scene.tweens.killTweensOf(button);
            button.setScale(id === powerUp ? 1.16 : 1);
            if (id === powerUp) {
                this.scene.tweens.add({ targets: button, scale: 1.22, duration: 280, yoyo: true, repeat: -1 });
            }
        });
    }

    setPowerUpCount(powerUp: PowerUpId, count: number): void {
        const label = this.powerUpCounts.get(powerUp);

        if (!label) {
            return;
        }

        const quantity = Math.max(0, Math.floor(count));
        label.setText(powerUp === 'fireball' ? `${quantity}` : `x${quantity}`)
            .setColor(quantity > 0 ? '#ffd28a' : '#9aabb7');

        if (powerUp === 'fireball') {
            const button = this.powerUpButtons.get(powerUp);
            if (button) {
                button.setAlpha(quantity > 0 ? 1 : 0.72);
                this.scene.tweens.killTweensOf(button);
                if (quantity > 0) {
                    this.scene.tweens.add({ targets: button, scale: 1.05, duration: 420, yoyo: true, repeat: -1 });
                } else {
                    button.setScale(1);
                }
            }
        }
    }

    destroy(): void {
        this.scene.tweens.killTweensOf(this.scoreValue);
        this.scene.tweens.killTweensOf(this.shotsValue);
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

}
