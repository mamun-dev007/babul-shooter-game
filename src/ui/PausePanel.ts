import { FONT_DISPLAY, GAME_HEIGHT, GAME_WIDTH } from '../game/config';
import { gameAudio } from '../game/audio/GameAudio';
import { addPressFx } from './uiFx';
import { drawVectorIcon, isVectorIcon, type VectorIcon } from './vectorIcons';
import { uiFitScale } from '../game/responsive';

export interface PausePanelCallbacks {
    onResume: () => void;
    /** Fired only after the in-panel confirmation was accepted. */
    onRestart: () => void;
    onSettings: () => void;
    onLevelMap: () => void;
    onClose: () => void;
}

const RED = { top: 0xe05241, bottom: 0x9c2a1e, rim: 0x6f1c14, highlight: 0xffffff, border: 0xffd2c4 };

export class PausePanel {
    private readonly container: Phaser.GameObjects.Container;
    private readonly menuView: Phaser.GameObjects.Container;
    private readonly confirmView: Phaser.GameObjects.Container;
    private entranceFrame = 0;

    constructor(scene: Phaser.Scene, callbacks: PausePanelCallbacks) {
        this.container = scene.add
            .container(GAME_WIDTH / 2, GAME_HEIGHT / 2)
            .setDepth(200)
            .setScale(uiFitScale());

        const dim = scene.add
            .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x07152a, 0.66)
            .setInteractive();
        dim.on('pointerdown', () => undefined);

        // Compact blue rounded popup with a soft drop shadow.
        const shadow = scene.add.graphics();
        shadow.fillStyle(0x07152a, 0.38);
        shadow.fillRoundedRect(-186, -155, 380, 310, 26);

        const panel = scene.add.graphics();
        panel.fillGradientStyle(0x4f7fe0, 0x4f7fe0, 0x49308f, 0x49308f, 1);
        panel.fillRoundedRect(-198, -155, 380, 310, 26);
        panel.lineStyle(3, 0xb7dcff, 0.95);
        panel.strokeRoundedRect(-198, -155, 380, 310, 26);
        // Glossy top sheen.
        panel.fillStyle(0xffffff, 0.16);
        panel.fillRoundedRect(-184, -141, 352, 42, 18);

        const title = scene.add
            .text(0, -124, 'PAUSED', {
                fontFamily: FONT_DISPLAY,
                fontSize: '25px',
                color: '#ffffff',
                stroke: '#17235f',
                strokeThickness: 5,
                align: 'center',
            })
            .setOrigin(0.5);

        const bubbleOne = scene.add.circle(-158, -128, 8, 0x77e4ff, 0.28)
            .setStrokeStyle(2, 0xffffff, 0.42);
        const bubbleTwo = scene.add.circle(158, 98, 10, 0xb58cff, 0.26)
            .setStrokeStyle(2, 0xffffff, 0.38);

        this.container.add([dim, shadow, panel, bubbleOne, bubbleTwo, title]);

        this.menuView = scene.add.container(0, 0);
        this.menuView.add([
            this.createButton(scene, 0, -50, 'RESUME', '▶', callbacks.onResume),
            this.createButton(scene, 0, 0, 'RESTART LEVEL', '↻', () => {
                this.menuView.setVisible(false);
                this.confirmView.setVisible(true);
            }),
            this.createButton(scene, 0, 50, 'SETTINGS', '⚙', callbacks.onSettings),
            this.createButton(scene, 0, 100, 'LEVEL MAP', 'shell', callbacks.onLevelMap),
        ]);
        this.container.add(this.menuView);

        this.confirmView = scene.add.container(0, 0).setVisible(false);
        this.confirmView.add([
            scene.add
                .text(0, -56, 'RESTART THIS LEVEL?', {
                    fontFamily: FONT_DISPLAY,
                    fontSize: '21px',
                    color: '#ffffff',
                    stroke: '#17235f',
                    strokeThickness: 4,
                    align: 'center',
                })
                .setOrigin(0.5),
            scene.add
                .text(0, -22, 'Level progress will be lost.', {
                    fontFamily: FONT_DISPLAY,
                    fontSize: '14px',
                    color: '#dbe9ff',
                    align: 'center',
                })
                .setOrigin(0.5),
            this.createButton(scene, 0, 34, 'YES, RESTART', '↻', callbacks.onRestart),
            this.createButton(scene, 0, 110, 'CANCEL', '✕', () => {
                this.confirmView.setVisible(false);
                this.menuView.setVisible(true);
            }),
        ]);
        this.container.add(this.confirmView);

        this.createCloseButton(scene, 152, -130, callbacks.onClose);

        this.container.setAlpha(0).setScale(0.86);
        const startedAt = performance.now();
        const animateEntrance = (now: number): void => {
            const progress = Math.min(1, (now - startedAt) / 260);
            const overshoot = 1 + 0.12 * Math.sin(progress * Math.PI);
            const eased = 1 - Math.pow(1 - progress, 3);
            this.container.setAlpha(eased).setScale(0.86 + 0.14 * eased * overshoot);
            if (progress < 1) {
                this.entranceFrame = requestAnimationFrame(animateEntrance);
            }
        };
        this.entranceFrame = requestAnimationFrame(animateEntrance);
    }

    destroy(): void {
        cancelAnimationFrame(this.entranceFrame);
        this.container.destroy(true);
    }

    private createCloseButton(
        scene: Phaser.Scene,
        x: number,
        y: number,
        onClose: () => void
    ): void {
        const button = scene.add.container(x, y);

        const body = scene.add.graphics();
        body.fillStyle(0x07152a, 0.32);
        body.fillCircle(0, 2, 18);
        body.fillGradientStyle(0xe8564a, 0xe8564a, 0x9c2a1e, 0x9c2a1e, 1);
        body.fillCircle(0, 0, 17);
        body.lineStyle(2, 0xffffff, 0.85);
        body.strokeCircle(0, 0, 17);
        body.fillStyle(0xffffff, 0.28);
        body.fillRoundedRect(-9, -11, 18, 10, 5);

        const cross = scene.add
            .text(0, 1, '✕', {
                fontFamily: FONT_DISPLAY,
                fontSize: '18px',
                color: '#ffffff',
            })
            .setOrigin(0.5);

        const hit = scene.add
            .circle(0, 0, 21, 0xffffff, 0.001)
            .setInteractive({ useHandCursor: true });

        hit.on('pointerdown', () => {
            gameAudio.playSfx('click');
            onClose();
        });
        addPressFx(scene, hit, button, { hoverScale: 1.06, pressScale: 0.92 });

        button.add([body, cross, hit]);
        this.container.add(button);
    }

    private createButton(
        scene: Phaser.Scene,
        x: number,
        y: number,
        label: string,
        icon: string | VectorIcon,
        onPress: () => void
    ): Phaser.GameObjects.Container {
        const button = scene.add.container(x, y);
        const graphics = scene.add.graphics();
        const width = 262;
        const height = 44;

        // Pill shadow, glossy red gradient body, top highlight and lower rim.
        graphics.fillStyle(0x07152a, 0.3);
        graphics.fillRoundedRect(-width / 2, -height / 2 + 5, width, height, 29);
        graphics.fillGradientStyle(RED.top, RED.top, RED.bottom, RED.bottom, 1);
        graphics.fillRoundedRect(-width / 2, -height / 2, width, height, 29);
        graphics.fillStyle(RED.highlight, 0.3);
        graphics.fillRoundedRect(-width / 2 + 12, -height / 2 + 6, width - 24, 17, 9);
        graphics.fillStyle(RED.rim, 0.8);
        graphics.fillRoundedRect(-width / 2 + 14, height / 2 - 11, width - 28, 8, 4);
        graphics.lineStyle(2, RED.border, 0.55);
        graphics.strokeRoundedRect(-width / 2, -height / 2, width, height, 29);

        let iconObject: Phaser.GameObjects.GameObject;

        // Strings that name a real vector icon (e.g. 'shell' for LEVEL MAP)
        // render the crisp drawn glyph; all other strings are glyphs such as
        // '▶', '↻', '⚙' and go through the text path.
        if (!isVectorIcon(icon)) {
            iconObject = scene.add
                .text(-104, 0, icon, {
                    fontFamily: FONT_DISPLAY,
                    fontSize: '20px',
                    color: '#ffffff',
                })
                .setOrigin(0.5);
        } else {
            // Crisp white vector icon (e.g. the level-map shell), engraved with
            // the button's own red so details read on the glossy surface.
            const vector = scene.add.graphics();
            drawVectorIcon(vector, icon, 0xffffff, true, RED.bottom);
            vector.setPosition(-104, 0);
            iconObject = vector;
        }

        const text = scene.add
            .text(10, 0, label, {
                fontFamily: FONT_DISPLAY,
                fontSize: '16px',
                color: '#ffffff',
                stroke: '#7d2417',
                strokeThickness: 3,
            })
            .setOrigin(0.5);

        const hit = scene.add
            .rectangle(0, 0, width, height, 0xffffff, 0.001)
            .setInteractive({ useHandCursor: true });

        hit.on('pointerdown', () => {
            gameAudio.playSfx('click');
            onPress();
        });
        addPressFx(scene, hit, button, { hoverScale: 1.04, pressScale: 0.94 });

        button.add([graphics, iconObject, text, hit]);
        return button;
    }
}
