import { FONT_DISPLAY, GAME_HEIGHT, GAME_WIDTH } from '../game/config';
import { gameAudio } from '../game/audio/GameAudio';
import { loadProgress } from '../game/utils/storage';
import { addPressFx } from './uiFx';
import { uiFitScale } from '../game/responsive';

export interface SettingsPanelOptions {
    soundEnabled: boolean;
    musicEnabled?: boolean;
    onSoundToggle: () => void;
    onMusicToggle?: () => void;
    onBack: () => void;
}

interface ToggleRow {
    setEnabled: (enabled: boolean) => void;
}

export class SettingsPanel {
    private readonly scene: Phaser.Scene;
    private container: Phaser.GameObjects.Container | null = null;
    private tracked: Phaser.GameObjects.GameObject[] = [];

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
    }

    /** True while the popup is visible (used to guard duplicate popups). */
    get isOpen(): boolean {
        return this.container !== null;
    }

    show(options: SettingsPanelOptions): void {
        this.destroy();

        const scene = this.scene;
        const container = scene.add
            .container(GAME_WIDTH / 2, GAME_HEIGHT / 2)
            .setDepth(220)
            .setScale(uiFitScale());
        this.container = container;
        this.tracked = [container];

        const dim = scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x02050d, 0.86);
        dim.setInteractive();
        dim.on('pointerdown', () => undefined);

        const card = scene.add.graphics();
        card.fillStyle(0x0c1730, 0.985);
        card.fillRoundedRect(-200, -230, 400, 460, 26);
        card.lineStyle(2, 0x31507f, 0.95);
        card.strokeRoundedRect(-200, -230, 400, 460, 26);
        card.fillStyle(0xffffff, 0.035);
        card.fillRoundedRect(-198, -228, 396, 76, 22);

        const title = scene.add
            .text(0, -190, 'SETTINGS', {
                fontFamily: FONT_DISPLAY,
                fontSize: '30px',
                color: '#ffffff',
                align: 'center',
                stroke: '#071023',
                strokeThickness: 5,
            })
            .setOrigin(0.5);

        container.add([dim, card, title]);

        this.createToggleRow(container, -62, 'SOUND EFFECTS', options.soundEnabled, () => {
            options.onSoundToggle();
            const enabled = loadProgress().sound;
            if (enabled) {
                gameAudio.playSfx('click');
            }
            return enabled;
        });

        if (options.onMusicToggle) {
            this.createToggleRow(
                container,
                18,
                'MUSIC',
                options.musicEnabled ?? loadProgress().music,
                () => {
                    options.onMusicToggle?.();
                    return loadProgress().music;
                }
            );
        }

        const back = scene.add.container(0, 180);
        const backBg = scene.add.graphics();
        backBg.fillStyle(0x29a9e0, 1);
        backBg.fillRoundedRect(-90, -24, 180, 48, 24);
        backBg.fillStyle(0xffffff, 0.14);
        backBg.fillRoundedRect(-80, -18, 160, 20, 10);

        const backText = scene.add
            .text(0, -1, 'BACK', {
                fontFamily: FONT_DISPLAY,
                fontSize: '16px',
                color: '#041324',
            })
            .setOrigin(0.5);

        const backHit = scene.add
            .rectangle(0, 0, 180, 48, 0xffffff, 0.001)
            .setInteractive({ useHandCursor: true });

        back.add([backBg, backText, backHit]);
        container.add(back);

        backHit.on('pointerdown', () => options.onBack());
        addPressFx(scene, backHit, back, { hoverScale: 1.04, pressScale: 0.94 });

        // The game scene pauses all tweens while the settings popup is open.
        // Keep this popup immediately visible in that paused state.
        container.setAlpha(1).setScale(1);
    }

    hide(): void {
        const container = this.container;

        if (!container) {
            return;
        }

        this.container = null;
        this.scene.tweens.killTweensOf(this.tracked);
        this.tracked = [];
        container.destroy(true);
    }

    destroy(): void {
        const container = this.container;

        if (!container) {
            return;
        }

        this.container = null;
        this.scene.tweens.killTweensOf(this.tracked);
        this.tracked = [];
        container.destroy(true);
    }

    private createToggleRow(
        container: Phaser.GameObjects.Container,
        y: number,
        label: string,
        initial: boolean,
        onToggle: () => boolean
    ): ToggleRow {
        const scene = this.scene;
        const row = scene.add.container(0, y);
        const bg = scene.add.graphics();
        bg.fillStyle(0xffffff, 0.035);
        bg.fillRoundedRect(-174, -30, 348, 60, 16);

        const text = scene.add
            .text(-150, 0, label, {
                fontFamily: FONT_DISPLAY,
                fontSize: '15px',
                color: '#dff4ff',
            })
            .setOrigin(0, 0.5);

        const track = scene.add.graphics();
        const knob = scene.add.circle(0, 0, 13, 0xffffff, 1);
        let enabled = initial;

        const draw = (): void => {
            track.clear();
            track.fillStyle(enabled ? 0x1f9d6b : 0x1b2540, 1);
            track.fillRoundedRect(-32, -16, 64, 32, 16);
            track.lineStyle(1.5, enabled ? 0x5cf2b4 : 0x3b5077, 0.95);
            track.strokeRoundedRect(-32, -16, 64, 32, 16);
            knob.setPosition(enabled ? 16 : -16, 0);
        };

        draw();

        const hit = scene.add
            .rectangle(0, 0, 348, 60, 0xffffff, 0.001)
            .setInteractive({ useHandCursor: true });

        row.add([bg, text, track, knob, hit]);
        container.add(row);
        this.tracked.push(row, knob);

        hit.on('pointerover', () => {
            scene.tweens.killTweensOf(row);
            scene.tweens.add({ targets: row, scaleX: 1.015, scaleY: 1.015, duration: 110 });
        });
        hit.on('pointerout', () => {
            scene.tweens.killTweensOf(row);
            scene.tweens.add({ targets: row, scaleX: 1, scaleY: 1, duration: 130 });
        });
        hit.on('pointerdown', () => {
            enabled = onToggle();
            draw();
            knob.setScale(1.2);
            scene.tweens.add({
                targets: knob,
                scaleX: 1,
                scaleY: 1,
                duration: 140,
                ease: 'Back.easeOut',
            });
        });

        return {
            setEnabled: (value: boolean) => {
                enabled = value;
                draw();
            },
        };
    }
}
