import { Scene } from 'phaser';
import { FONT, FONT_DISPLAY, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { loadProgress, toggleMusic, toggleSound } from '../utils/storage';
import { gameAudio, installUiAudio } from '../audio/GameAudio';
import { fadeInScene, goToScene, goToSceneInstant } from './transitions';
import { addPressFx } from '../../ui/uiFx';
import { drawVectorIcon, type VectorIcon } from '../../ui/vectorIcons';
import { attachRelayout, menuCoinX, menuPlayY, menuSettingsY, menuUtilityY } from '../layout';

export class MenuScene extends Scene {
    private transitioning = false;
    private relayouting = false;

    constructor() {
        super('MenuScene');
    }

    create(): void {
        this.transitioning = false;
        const progress = loadProgress();
        installUiAudio(this);
        this.createBackground();
        this.createCoinButton(progress.coins);
        this.createPlayButton();
        this.createSettingsButton();
        this.createUtilityButtons(progress);
        attachRelayout(this, () => {
            if (this.relayouting || this.transitioning) {
                return;
            }
            this.relayouting = true;
            this.time.delayedCall(50, () => this.scene.restart());
        });
        fadeInScene(this, 260, [0, 98, 154]);
    }

    private createBackground(): void {
        const background = this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'bg-menu');
        const coverScale = Math.max(GAME_WIDTH / background.width, GAME_HEIGHT / background.height);
        background.setScale(coverScale).setDepth(-100);
    }

    private createCoinButton(coins: number): void {
        const x = menuCoinX();
        const y = 52;
        const width = 158;
        const height = 54;
        const container = this.add.container(x, y).setDepth(30);

        const shadow = this.add.graphics();
        shadow.fillStyle(0x075a8f, 0.55);
        shadow.fillRoundedRect(-width / 2 + 4, -height / 2 + 7, width, height, 27);
        const panel = this.add.graphics();
        panel.fillStyle(0x07558a, 0.96);
        panel.fillRoundedRect(-width / 2, -height / 2, width, height, 27);
        panel.fillStyle(0x54c8ef, 0.95);
        panel.fillRoundedRect(-width / 2 + 4, -height / 2 + 4, width - 8, 24, 20);
        panel.lineStyle(4, 0xe7fbff, 1);
        panel.strokeRoundedRect(-width / 2, -height / 2, width, height, 27);
        panel.lineStyle(2, 0x0b3b67, 1);
        panel.strokeRoundedRect(-width / 2 + 4, -height / 2 + 4, width - 8, height - 8, 23);

        const coin = this.textures.exists('icon-coin')
            ? this.add.image(-58, 0, 'icon-coin').setDisplaySize(48, 48)
            : this.add.circle(-58, 0, 21, 0xffd32a, 1);
        const coinSymbol = this.textures.exists('icon-coin')
            ? null
            : this.add.text(-58, 0, '¢', { fontFamily: FONT_DISPLAY, fontSize: '22px', color: '#8a5300' }).setOrigin(0.5);

        const amount = this.add.text(-31, 1, coins.toLocaleString('en-US'), {
            fontFamily: FONT_DISPLAY,
            fontSize: '21px',
            color: '#ffffff',
            stroke: '#064b78',
            strokeThickness: 4,
        }).setOrigin(0, 0.5);

        const addButton = this.add.circle(width / 2 - 8, 0, 18, 0xffcf32, 1);
        const plus = this.add.text(width / 2 - 8, -1, '+', {
            fontFamily: FONT_DISPLAY,
            fontSize: '27px',
            color: '#ffffff',
            stroke: '#a96512',
            strokeThickness: 4,
        }).setOrigin(0.5);

        const objects = [shadow, panel, coin, amount, addButton, plus];
        if (coinSymbol) objects.push(coinSymbol);
        container.add(objects);

        const hit = this.add.circle(width / 2 - 8, 0, 21, 0xffffff, 0.001)
            .setInteractive({ useHandCursor: true });
        container.add(hit);
        addPressFx(this, hit, container, { hoverScale: 1.06, pressScale: 0.94 });
        hit.on('pointerdown', () => {
            if (this.transitioning) return;
            this.transitioning = true;
            gameAudio.playSfx('click');
            goToScene(this, 'CoinStoreScene', { returnTo: 'MenuScene' }, 180);
        });
    }

    private createPlayButton(): void {
        this.createPillButton(GAME_WIDTH / 2, menuPlayY(), 258, 72, 'PLAY', 'play', () => {
            goToSceneInstant(this, 'LevelSelectionScene', { instant: true });
        }, true);
    }

    private createSettingsButton(): void {
        this.createPillButton(GAME_WIDTH / 2, menuSettingsY(), 258, 64, 'Setting', 'gear', () => {
            goToScene(this, 'SettingsScene', undefined, 200);
        });
    }

    private createUtilityButtons(progress: { sound: boolean; music: boolean }): void {
        let soundEnabled = progress.sound;
        let musicEnabled = progress.music;
        this.createRoundButton(GAME_WIDTH / 2 - 54, menuUtilityY(), 'sound', soundEnabled ? 'SOUND ON' : 'SOUND OFF', () => {
            if (this.transitioning) return soundEnabled;
            soundEnabled = toggleSound();
            if (soundEnabled) gameAudio.playSfx('click');
            return soundEnabled;
        }, soundEnabled);
        this.createRoundButton(GAME_WIDTH / 2 + 54, menuUtilityY(), 'music', musicEnabled ? 'MUSIC ON' : 'MUSIC OFF', () => {
            if (this.transitioning) return musicEnabled;
            musicEnabled = toggleMusic();
            return musicEnabled;
        }, musicEnabled);
    }

    private createPillButton(
        x: number,
        y: number,
        width: number,
        height: number,
        labelText: string,
        icon: VectorIcon,
        action: () => void,
        instant = false
    ): void {
        const radius = height / 2;
        const shadow = this.add.graphics().setDepth(20);
        const button = this.add.graphics().setDepth(21);
        const draw = (hovered: boolean): void => {
            button.clear();
            shadow.clear();
            shadow.fillStyle(0x06386b, 0.58);
            shadow.fillRoundedRect(x - width / 2 + 3, y - height / 2 + 9, width, height, radius);
            if (labelText === 'PLAY') {
                button.fillGradientStyle(hovered ? 0x63d9ff : 0x4fc8f5, hovered ? 0x2b9fff : 0x168bff, 0x1686e8, 0x1686e8, 1);
            } else {
                button.fillGradientStyle(hovered ? 0x63d9ff : 0x4fc8f5, hovered ? 0x2b9fff : 0x168bff, hovered ? 0x1686e8 : 0x168bff, hovered ? 0x1686e8 : 0x168bff, 1);
            }
            button.fillRoundedRect(x - width / 2, y - height / 2, width, height, radius);
            button.fillStyle(labelText === 'PLAY' ? 0xcffff2 : 0xe8faff, hovered ? 0.34 : 0.25);
            button.fillRoundedRect(x - width / 2 + 16, y - height / 2 + 8, width - 32, height * 0.34, radius);
            button.lineStyle(4, 0xe9fff2, 0.96);
            button.strokeRoundedRect(x - width / 2, y - height / 2, width, height, radius);
            button.lineStyle(2, 0x0a3d91, 0.92);
            button.strokeRoundedRect(x - width / 2 + 4, y - height / 2 + 4, width - 8, height - 8, radius - 2);
        };
        draw(false);

        const iconGraphics = this.add.graphics().setScale(labelText === 'PLAY' ? 1.15 : 0.9).setDepth(23);
        drawVectorIcon(iconGraphics, icon, 0xffffff, true);
        const label = this.add.text(x, y - 1, labelText, {
            fontFamily: FONT_DISPLAY,
            fontSize: labelText === 'PLAY' ? '36px' : '29px',
            color: '#ffffff',
            stroke: '#0a5ca8',
            strokeThickness: 5,
        }).setOrigin(0.5).setDepth(24);

        const iconWidth = labelText === 'PLAY' ? 30 : 24;
        const groupWidth = iconWidth + 12 + label.width;
        iconGraphics.setPosition(x - groupWidth / 2 + iconWidth / 2, y);
        label.setX(x - groupWidth / 2 + iconWidth + 12 + label.width / 2);

        const hit = this.add.rectangle(x, y, width, height, 0xffffff, 0.001)
            .setInteractive({ useHandCursor: true })
            .setDepth(25);
        hit.on('pointerover', () => { if (!this.transitioning) draw(true); });
        hit.on('pointerout', () => { if (!this.transitioning) draw(false); });
        hit.on('pointerdown', () => {
            if (this.transitioning) return;
            this.transitioning = true;
            if (instant) {
                // No scale tween or delay — navigate straight away.
                action();
                return;
            }
            this.tweens.add({ targets: [button, shadow, label, iconGraphics], scaleX: 0.95, scaleY: 0.95, duration: 70, yoyo: true });
            this.time.delayedCall(80, () => action());
        });
        if (instant) {
            // Instant navigation has no press-scale animation either.
            addPressFx(this, hit, label, { hoverScale: 1, pressScale: 1 });
        } else {
            addPressFx(this, hit, label, { hoverScale: 1.04, pressScale: 0.96 });
        }
    }

    private createRoundButton(
        x: number,
        y: number,
        icon: VectorIcon,
        initialLabel: string,
        toggle: () => boolean,
        enabled: boolean
    ): void {
        let isEnabled = enabled;
        const container = this.add.container(x, y).setDepth(25);
        const bg = this.add.graphics();
        const iconGraphics = this.add.graphics().setScale(1.05);
        const label = this.add.text(0, 58, initialLabel, {
            fontFamily: FONT,
            fontSize: '13px',
            color: '#ffffff',
            stroke: '#075a8a',
            strokeThickness: 4,
        }).setOrigin(0.5);

        const draw = (hovered = false): void => {
            bg.clear();
            bg.fillStyle(0x073766, 0.62);
            bg.fillCircle(4, 7, 38);
            bg.fillStyle(hovered ? 0x63d9ff : 0x32aef3, 1);
            bg.fillCircle(0, 0, 38);
            bg.fillStyle(0xe8faff, 0.28);
            bg.fillCircle(-7, -12, 24);
            bg.lineStyle(4, 0xeafff5, 1);
            bg.strokeCircle(0, 0, 38);
            bg.lineStyle(2, 0x0870b8, 1);
            bg.strokeCircle(0, 0, 34);
            iconGraphics.clear();
            drawVectorIcon(iconGraphics, icon, 0xffffff, isEnabled);
        };
        draw();
        container.add([bg, iconGraphics, label]);

        const hit = this.add.circle(0, 0, 40, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
        container.add(hit);
        hit.on('pointerover', () => draw(true));
        hit.on('pointerout', () => draw(false));
        hit.on('pointerdown', () => {
            if (this.transitioning) return;
            isEnabled = toggle();
            label.setText(isEnabled ? (icon === 'sound' ? 'SOUND ON' : 'MUSIC ON') : (icon === 'sound' ? 'SOUND OFF' : 'MUSIC OFF'));
            draw(false);
        });
        addPressFx(this, hit, container, { hoverScale: 1.06, pressScale: 0.93 });
    }
}
