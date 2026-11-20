import { FONT, FONT_DISPLAY } from '../game/config';
import { gameAudio } from '../game/audio/GameAudio';
import { acquireModalInputLock, releaseModalInputLock, suppressPointerRelease } from '../game/input/modalInputLock';
import { attachRelayout, worldHeight, worldWidth } from '../game/layout';
import { addPressFx } from './uiFx';

const LOCK_ID = 'back-confirmation';
const CARD_WIDTH = 560;
const CARD_HEIGHT = 420;
const RED = { top: 0xe05241, bottom: 0x9c2a1e, rim: 0x6f1c14, highlight: 0xffffff, border: 0xffd2c4 };

export interface BackConfirmationPanelOptions {
    title: string;
    description: string;
    confirmLabel: string;
    cancelLabel: string;
    onConfirm: () => void;
    onCancel: () => void;
}

export class BackConfirmationPanel {
    private readonly container: Phaser.GameObjects.Container;
    private readonly dim: Phaser.GameObjects.Rectangle;
    private readonly card: Phaser.GameObjects.Container;
    private readonly unsubscribeRelayout: () => void;
    private fitScale = 1;
    private entranceFrame = 0;
    private destroyed = false;

    constructor(scene: Phaser.Scene, options: BackConfirmationPanelOptions) {
        acquireModalInputLock(LOCK_ID);
        scene.input.topOnly = true;

        this.container = scene.add.container(0, 0).setDepth(300);
        this.dim = scene.add
            .rectangle(0, 0, 1, 1, 0x07152a, 0.72)
            .setInteractive();
        this.dim.on(
            'pointerdown',
            (
                _pointer: Phaser.Input.Pointer,
                _localX: number,
                _localY: number,
                event: Phaser.Types.Input.EventData
            ) => {
                event.stopPropagation();
            }
        );
        this.card = scene.add.container(0, 0);
        this.container.add([this.dim, this.card]);

        const shadow = scene.add.graphics();
        shadow.fillStyle(0x07152a, 0.38);
        shadow.fillRoundedRect(-CARD_WIDTH / 2 + 8, -CARD_HEIGHT / 2 + 14, CARD_WIDTH, CARD_HEIGHT, 38);

        const panel = scene.add.graphics();
        panel.fillGradientStyle(0x4f7fe0, 0x4f7fe0, 0x49308f, 0x49308f, 1);
        panel.fillRoundedRect(-CARD_WIDTH / 2, -CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT, 38);
        panel.lineStyle(3, 0xb7dcff, 0.95);
        panel.strokeRoundedRect(-CARD_WIDTH / 2, -CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT, 38);
        panel.fillStyle(0xffffff, 0.16);
        panel.fillRoundedRect(-CARD_WIDTH / 2 + 22, -CARD_HEIGHT / 2 + 18, CARD_WIDTH - 44, 58, 26);

        const title = scene.add
            .text(0, -145, options.title, {
                fontFamily: FONT_DISPLAY,
                fontSize: '38px',
                color: '#ffffff',
                stroke: '#17235f',
                strokeThickness: 6,
                align: 'center',
            })
            .setOrigin(0.5);

        const description = scene.add
            .text(0, -62, options.description, {
                fontFamily: FONT,
                fontSize: '21px',
                color: '#dbe9ff',
                align: 'center',
                wordWrap: { width: CARD_WIDTH - 96 },
            })
            .setOrigin(0.5);

        const bubbleOne = scene.add.circle(-246, -164, 12, 0x77e4ff, 0.28)
            .setStrokeStyle(2, 0xffffff, 0.42);
        const bubbleTwo = scene.add.circle(246, 156, 15, 0xb58cff, 0.26)
            .setStrokeStyle(2, 0xffffff, 0.38);

        this.card.add([
            shadow,
            panel,
            bubbleOne,
            bubbleTwo,
            title,
            description,
            this.createButton(scene, 45, options.confirmLabel, options.onConfirm),
            this.createButton(scene, 137, options.cancelLabel, options.onCancel),
        ]);

        this.layout();
        this.unsubscribeRelayout = attachRelayout(scene, () => this.layout());
        this.animateEntrance();
        gameAudio.playSfx('popupOpen');
    }

    get isOpen(): boolean {
        return !this.destroyed;
    }

    destroy(): void {
        if (this.destroyed) {
            return;
        }
        this.destroyed = true;
        releaseModalInputLock(LOCK_ID);
        cancelAnimationFrame(this.entranceFrame);
        this.unsubscribeRelayout();
        gameAudio.playSfx('popupClose');
        this.container.destroy(true);
    }

    private layout(): void {
        const width = worldWidth();
        const height = worldHeight();
        this.fitScale = Math.min(
            1,
            (width - 24) / CARD_WIDTH,
            (height - 24) / CARD_HEIGHT
        );
        this.dim.setPosition(width / 2, height / 2).setSize(width, height);
        this.card.setPosition(width / 2, height / 2);
    }

    private animateEntrance(): void {
        this.card.setAlpha(0).setScale(this.fitScale * 0.86);
        const startedAt = performance.now();
        const animate = (now: number): void => {
            if (this.destroyed) {
                return;
            }
            const progress = Math.min(1, (now - startedAt) / 260);
            const overshoot = 1 + 0.12 * Math.sin(progress * Math.PI);
            const eased = 1 - Math.pow(1 - progress, 3);
            this.card
                .setAlpha(eased)
                .setScale(this.fitScale * (0.86 + 0.14 * eased * overshoot));
            if (progress < 1) {
                this.entranceFrame = requestAnimationFrame(animate);
            }
        };
        this.entranceFrame = requestAnimationFrame(animate);
    }

    private createButton(
        scene: Phaser.Scene,
        y: number,
        label: string,
        onPress: () => void
    ): Phaser.GameObjects.Container {
        const button = scene.add.container(0, y);
        const width = 400;
        const height = 64;
        const graphics = scene.add.graphics();
        graphics.fillStyle(0x07152a, 0.3);
        graphics.fillRoundedRect(-width / 2, -height / 2 + 8, width, height, 32);
        graphics.fillGradientStyle(RED.top, RED.top, RED.bottom, RED.bottom, 1);
        graphics.fillRoundedRect(-width / 2, -height / 2, width, height, 32);
        graphics.fillStyle(RED.highlight, 0.3);
        graphics.fillRoundedRect(-width / 2 + 18, -height / 2 + 10, width - 36, 26, 13);
        graphics.fillStyle(RED.rim, 0.8);
        graphics.fillRoundedRect(-width / 2 + 22, height / 2 - 16, width - 44, 11, 6);
        graphics.lineStyle(4, RED.border, 0.55);
        graphics.strokeRoundedRect(-width / 2, -height / 2, width, height, 32);

        const text = scene.add
            .text(0, 0, label, {
                fontFamily: FONT_DISPLAY,
                fontSize: '26px',
                color: '#ffffff',
                stroke: '#7d2417',
                strokeThickness: 5,
            })
            .setOrigin(0.5);

        const hit = scene.add
            .rectangle(0, 0, width, height, 0xffffff, 0.001)
            .setInteractive({ useHandCursor: true });
        hit.on(
            'pointerdown',
            (
                _pointer: Phaser.Input.Pointer,
                _localX: number,
                _localY: number,
                event: Phaser.Types.Input.EventData
            ) => {
                event.stopPropagation();
                suppressPointerRelease(_pointer.id);
                gameAudio.playSfx('click');
                onPress();
            }
        );
        addPressFx(scene, hit, button, { hoverScale: 1.04, pressScale: 0.94 });

        button.add([graphics, text, hit]);
        return button;
    }
}
