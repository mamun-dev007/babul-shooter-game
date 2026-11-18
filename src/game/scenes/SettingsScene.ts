import { GameObjects, Scene } from 'phaser';
import { FONT, FONT_DISPLAY } from '../config';
import { loadProgress, saveProgress, toggleMusic, toggleSound, resetProgress, setMasterVolume, setMusicVolume, setSfxVolume } from '../utils/storage';
import { gameAudio, installUiAudio } from '../audio/GameAudio';
import { fadeInScene, goToSceneInstant } from './transitions';
import { addPressFx } from '../../ui/uiFx';
import { attachRelayout, measureViewport, worldHeight, worldWidth } from '../layout';
import {
    SETTINGS_CONTENT_CENTER_X,
    SETTINGS_CONTENT_CENTER_Y,
    SETTINGS_POPUP_SCALE,
    settingsCameraScroll,
    settingsFitScale,
} from '../responsive';
import { createVolumeSlider } from '../../ui/VolumeSlider';

export class SettingsScene extends Scene {
    private locked = false;
    private returnTo = 'MenuScene';
    private returnLevel = 0;
    private contentScale = 1;
    private background: Phaser.GameObjects.Image | null = null;
    private backdrop!: Phaser.GameObjects.Rectangle;
    private modalLayer: Phaser.GameObjects.Container | null = null;
    private modalDim: Phaser.GameObjects.Rectangle | null = null;
    private modalCard: Phaser.GameObjects.Container | null = null;
    /** All popup artwork/controls scaled uniformly by SETTINGS_POPUP_SCALE. */
    private contentLayer!: Phaser.GameObjects.Container;

    constructor() { super('SettingsScene'); }

    init(data?: { returnTo?: string; level?: number }): void {
        this.returnTo = data?.returnTo ?? 'MenuScene';
        this.returnLevel = Number.isFinite(data?.level) ? (data?.level ?? 0) : 0;
    }

    create(): void {
        this.locked = false;
        this.contentScale = 1;
        this.background = null;
        this.modalLayer = null;
        this.modalDim = null;
        this.modalCard = null;
        this.input.topOnly = true;
        this.contentLayer = this.add.container(0, 0);
        this.applyViewportFit();
        installUiAudio(this);
        gameAudio.setMusicMode('menu');
        const backgroundKey = this.returnTo === 'LevelSelectionScene' ? 'bg-level-map' : 'bg-menu';
        if (this.textures.exists(backgroundKey)) {
            this.background = this.add.image(
                SETTINGS_CONTENT_CENTER_X,
                SETTINGS_CONTENT_CENTER_Y,
                backgroundKey
            ).setDepth(-30);
        }
        this.backdrop = this.add.rectangle(
            SETTINGS_CONTENT_CENTER_X,
            SETTINGS_CONTENT_CENTER_Y,
            1,
            1,
            0x02050d,
            0.72
        ).setDepth(-20);
        this.layoutBackdrop();
        const before = new Set(this.children.list);
        this.createPanel();
        this.createHeader();
        this.createRows();
        // Reparent only the popup content (background/backdrop stay scene-level
        // so they still cover the whole screen). Sorting by the original depth
        // preserves the exact visual stacking of the unscaled design.
        const popupChildren = this.children.list.filter((child) => !before.has(child));
        popupChildren.sort((left, right) =>
            (left as GameObjects.GameObject & { depth: number }).depth -
            (right as GameObjects.GameObject & { depth: number }).depth
        );
        this.contentLayer.add(popupChildren);
        const scale = SETTINGS_POPUP_SCALE;
        this.contentLayer.setScale(scale);
        this.contentLayer.setPosition(
            SETTINGS_CONTENT_CENTER_X * (1 - scale),
            SETTINGS_CONTENT_CENTER_Y * (1 - scale)
        );
        // Render text at 2x so the enlarged popup stays sharp.
        popupChildren.forEach((child) => {
            if (child instanceof GameObjects.Text) {
                child.setResolution(2);
            }
        });
        attachRelayout(this, () => {
            requestAnimationFrame(() => {
                if (this.scene.isActive()) {
                    this.applyViewportFit();
                    this.layoutBackdrop();
                    this.layoutModalLayers();
                }
            });
        });
        fadeInScene(this, 240, [5, 57, 91]);
    }

    /** Modal layers live inside the scaled content layer. */
    private get overlayWidth(): number {
        return this.cameras.main.width / this.contentScale / SETTINGS_POPUP_SCALE;
    }

    private get overlayHeight(): number {
        return this.cameras.main.height / this.contentScale / SETTINGS_POPUP_SCALE;
    }

    /** The backdrop is scene-level and must cover the full viewport. */
    private get viewportWidth(): number {
        return this.cameras.main.width / this.contentScale;
    }

    private get viewportHeight(): number {
        return this.cameras.main.height / this.contentScale;
    }

    private applyViewportFit(): void {
        const viewport = measureViewport();
        this.contentScale = settingsFitScale(
            viewport.width,
            viewport.height,
            worldWidth(),
            worldHeight()
        );
        const camera = this.cameras.main;
        camera.setZoom(this.contentScale);
        // Phaser's camera centre is `scroll + size / 2` in *unzoomed* pixels;
        // dividing by the zoom here shifts the popup off-screen when zoom < 1.
        camera.setScroll(
            settingsCameraScroll(SETTINGS_CONTENT_CENTER_X, camera.width),
            settingsCameraScroll(SETTINGS_CONTENT_CENTER_Y, camera.height)
        );
    }

    private layoutBackdrop(): void {
        const width = this.viewportWidth;
        const height = this.viewportHeight;
        this.backdrop
            .setPosition(SETTINGS_CONTENT_CENTER_X, SETTINGS_CONTENT_CENTER_Y)
            .setSize(width, height);

        if (this.background) {
            this.background
                .setPosition(SETTINGS_CONTENT_CENTER_X, SETTINGS_CONTENT_CENTER_Y)
                .setScale(Math.max(width / this.background.width, height / this.background.height));
        }
    }

    private createModalLayer(depth: number): {
        layer: Phaser.GameObjects.Container;
        card: Phaser.GameObjects.Container;
    } {
        const layer = this.add.container(0, 0).setDepth(depth);
        const dim = this.add.rectangle(
            SETTINGS_CONTENT_CENTER_X,
            SETTINGS_CONTENT_CENTER_Y,
            this.overlayWidth,
            this.overlayHeight,
            0x02050d,
            0.82
        ).setInteractive();
        dim.on(
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
        const card = this.add.container(SETTINGS_CONTENT_CENTER_X, SETTINGS_CONTENT_CENTER_Y);
        layer.add([dim, card]);
        this.contentLayer.add(layer);
        this.modalLayer = layer;
        this.modalDim = dim;
        this.modalCard = card;
        return { layer, card };
    }

    private layoutModalLayers(): void {
        if (!this.modalDim || !this.modalCard) {
            return;
        }
        this.modalDim
            .setPosition(SETTINGS_CONTENT_CENTER_X, SETTINGS_CONTENT_CENTER_Y)
            .setSize(this.overlayWidth, this.overlayHeight);
        this.modalCard.setPosition(SETTINGS_CONTENT_CENTER_X, SETTINGS_CONTENT_CENTER_Y);
    }

    private sharpenTexts(root: GameObjects.Container): void {
        root.list.forEach((child) => {
            if (child instanceof GameObjects.Text) {
                child.setResolution(2);
            } else if (child instanceof GameObjects.Container) {
                this.sharpenTexts(child);
            }
        });
    }

    private closeModalLayer(): void {
        const layer = this.modalLayer;
        if (!layer) {
            return;
        }
        this.modalLayer = null;
        this.modalDim = null;
        this.modalCard = null;
        gameAudio.playSfx('popupClose');
        layer.destroy(true);
    }

    private createPanel(): void {
        const x = 34, y = 220, width = 472, height = 520, radius = 28;
        const shadow = this.add.graphics().setDepth(-10);
        shadow.fillStyle(0x022238, 0.75).fillRoundedRect(x + 7, y + 12, width, height, radius);
        const panel = this.add.graphics().setDepth(-9);
        panel.fillGradientStyle(0x47b9c8, 0x47b9c8, 0x1b91a8, 0x157a9b, 1);
        panel.fillRoundedRect(x, y, width, height, radius);
        panel.lineStyle(5, 0x9de7e6, 0.95);
        panel.strokeRoundedRect(x, y, width, height, radius);
        panel.lineStyle(2, 0x176d86, 0.9);
        panel.strokeRoundedRect(x + 7, y + 7, width - 14, height - 14, radius - 5);
        panel.fillStyle(0xffffff, 0.16).fillRoundedRect(x + 18, y + 12, width - 36, 35, 17);
    }

    private createHeader(): void {
        const shell = this.add.graphics().setDepth(5);
        shell.fillStyle(0xf2fbff, 1);
        shell.lineStyle(2, 0x73cdd7, 1);
                shell.beginPath().moveTo(74, 258); shell.lineTo(66, 246);
                shell.lineTo(72, 234); shell.lineTo(84, 227); shell.lineTo(96, 234);
                shell.lineTo(102, 246); shell.lineTo(94, 258); shell.closePath(); shell.fillPath(); shell.strokePath();
        shell.lineStyle(2, 0x4ab0c4, 0.8);
                shell.lineBetween(84, 229, 84, 255);
                shell.lineBetween(75, 234, 84, 248);
                shell.lineBetween(93, 234, 84, 248);

                this.add.text(112, 242, 'Settings', {
            fontFamily: FONT_DISPLAY, fontSize: '31px', color: '#ffffff',
            stroke: '#176d86', strokeThickness: 4,
        }).setOrigin(0, 0.5).setDepth(5);

        // Always visible: this is the popup's Close (X) control, including on
        // mobile where the drawn in-game Back buttons are hidden.
        const close = this.add.container(470, 238).setDepth(6);
        close.setName('settings-close-button');
        const closeBg = this.add.graphics();
        closeBg.fillStyle(0xef5c60, 1).fillRoundedRect(-18, -18, 36, 36, 11);
        closeBg.lineStyle(3, 0xff9a9b, 1).strokeRoundedRect(-18, -18, 36, 36, 11);
        closeBg.lineStyle(5, 0xffffff, 1).lineBetween(-9, -9, 9, 9).lineBetween(9, -9, -9, 9);
        close.add(closeBg);
        const hit = this.add.circle(0, 0, 30, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
        hit.setName('settings-close-hit');
        close.add(hit);
        hit.on('pointerdown', () => this.goBack());
        addPressFx(this, hit, close, { hoverScale: 1, pressScale: 0.94 });
    }

    private createRows(): void {
        const startY = 285;
        let y = startY;
        this.addToggleRow(y, 'Music', 'music', loadProgress().music, () => {
            const enabled = toggleMusic();
            return enabled;
        }); y += 44;
        this.addToggleRow(y, 'Sound Effects', 'sound', loadProgress().sound, () => {
            const enabled = toggleSound(); if (enabled) gameAudio.playSfx('click'); return enabled;
        }); y += 44;
        this.addToggleRow(y, 'Vibration', 'phone', loadProgress().vibration !== false, () => {
            const p = loadProgress(); p.vibration = p.vibration === false; saveProgress(p);
            if (p.vibration && (navigator as Navigator & { vibrate?: (v: number) => void }).vibrate) {
                navigator.vibrate?.(30);
            }
            return p.vibration !== false;
        }); y += 44;
        this.addDropdownRow(y, 'Language', 'globe', (loadProgress().language || 'en').toLowerCase() === 'en' ? 'English' : 'বাংলা', ['English', 'বাংলা'], (value) => {
            const p = loadProgress(); p.language = value === 'English' ? 'en' : 'bn'; saveProgress(p);
        }); y += 44;
        const quality = loadProgress().graphics || 'medium';
        this.addDropdownRow(y, 'Graphics Quality', 'monitor', quality.charAt(0).toUpperCase() + quality.slice(1), ['Low', 'Medium', 'High'], (value) => {
            const p = loadProgress(); p.graphics = value.toLowerCase() as 'low' | 'medium' | 'high'; saveProgress(p);
        }); y += 44;
        this.addToggleRow(y, 'Aim Guide', 'target', loadProgress().aimGuide !== false, () => {
            const p = loadProgress(); p.aimGuide = p.aimGuide === false; saveProgress(p); return p.aimGuide !== false;
        }); y += 44;
        this.addToggleRow(y, 'Left Handed Controls', 'hand', loadProgress().controlHandedness === 'left', () => {
            const p = loadProgress(); p.controlHandedness = p.controlHandedness === 'left' ? 'right' : 'left'; saveProgress(p);
            return p.controlHandedness === 'left';
        });
        y += 44;
        this.addVolumeRow(y);

        this.createBottomButtons();
        this.add.text(SETTINGS_CONTENT_CENTER_X, 640, 'DEVELOPED BY MAMUN', {
            fontFamily: FONT, fontSize: '15px', fontStyle: 'bold', color: '#e8fbff', letterSpacing: 2,
        }).setOrigin(0.5).setDepth(6);
    }

    private drawRowIcon(g: Phaser.GameObjects.Graphics, kind: string): void {
        g.clear(); g.lineStyle(3, 0xffffff, 1); g.fillStyle(0xffffff, 1);
        if (kind === 'music') { g.fillCircle(-5, 8, 4); g.fillCircle(7, 5, 4); g.fillRect(-2, -9, 3, 19); g.fillRect(10, -11, 3, 18); g.fillRect(-2, -11, 15, 3); }
        else if (kind === 'sound') { g.fillRect(-10, -5, 6, 10); g.fillTriangle(-4, -10, 5, 0, -4, 10); g.arc(5, 0, 8, -0.75, 0.75); g.strokePath(); }
        else if (kind === 'phone') { g.lineStyle(3, 0xffffff, 1); g.strokeRoundedRect(-8, -13, 16, 26, 4); g.fillRect(-2, 9, 4, 2); g.lineBetween(-14, -8, -14, 8); }
        else if (kind === 'globe') { g.strokeCircle(0, 0, 12); g.lineBetween(-12, 0, 12, 0); g.arc(0, 0, 12, -1.15, 1.15); g.strokePath(); g.arc(0, 0, 12, 1.99, 4.29); g.strokePath(); }
        else if (kind === 'monitor') { g.strokeRoundedRect(-14, -11, 28, 21, 2); g.lineBetween(0, 10, 0, 15); g.lineBetween(-7, 15, 7, 15); }
        else if (kind === 'target') { g.strokeCircle(0, 0, 13); g.strokeCircle(0, 0, 6); g.lineBetween(-16, 0, -8, 0); g.lineBetween(8, 0, 16, 0); g.lineBetween(0, -16, 0, -8); g.lineBetween(0, 8, 0, 16); }
        else { g.beginPath(); g.moveTo(-9, 12); g.lineTo(-9, -1); g.lineTo(-5, -12); g.lineTo(-1, -4); g.lineTo(3, -12); g.lineTo(7, -1); g.lineTo(7, 12); g.closePath(); g.strokePath(); }
    }

    private addToggleRow(y: number, label: string, icon: string, enabled: boolean, toggle: () => boolean): void {
        this.drawRowIcon(this.add.graphics().setPosition(78, y).setDepth(4), icon);
        this.add.text(105, y, label, { fontFamily: FONT_DISPLAY, fontSize: '18px', color: '#ffffff' }).setOrigin(0, 0.5).setDepth(4);
        let value = enabled;
        const switchG = this.add.graphics().setPosition(421, y).setDepth(5);
        const draw = (): void => {
            switchG.clear();
            switchG.fillStyle(0x07516a, 0.65).fillRoundedRect(-31, -12, 62, 24, 12);
            switchG.fillGradientStyle(value ? 0x65d79b : 0xf170a1, value ? 0x65d79b : 0xf170a1, value ? 0x25a86f : 0xe84783, value ? 0x25a86f : 0xe84783, 1);
            switchG.fillRoundedRect(-31, -12, 62, 24, 12);
            switchG.fillStyle(value ? 0xd8fff0 : 0xffe7ef, value ? 0.18 : 0.14).fillRoundedRect(-28, -9, 56, 8, 4);
            switchG.fillStyle(0xffffff, 1).fillCircle(value ? 18 : -18, 0, 11);
            switchG.fillStyle(0xc7edee, 0.8).fillCircle(value ? 16 : -20, -2, 4);
        };
        draw();
        const stateText = this.add.text(value ? 399 : 443, y, value ? 'ON' : 'OFF', {
            fontFamily: FONT_DISPLAY, fontSize: '8px', color: '#07516a', fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(6);
        const hit = this.add.rectangle(421, y, 76, 38, 0xffffff, 0.001).setInteractive({ useHandCursor: true }).setDepth(7);
        hit.on('pointerdown', () => {
            value = toggle(); draw();
            stateText.setText(value ? 'ON' : 'OFF'); stateText.setX(value ? 399 : 443);
        });
        addPressFx(this, hit, switchG, { hoverScale: 1.04, pressScale: 0.94 });
        this.addSeparator(y);
    }

    private addDropdownRow(y: number, label: string, icon: string, selected: string, options: string[], select: (value: string) => void): void {
        this.drawRowIcon(this.add.graphics().setPosition(78, y).setDepth(4), icon);
        this.add.text(105, y, label, { fontFamily: FONT_DISPLAY, fontSize: '18px', color: '#ffffff' }).setOrigin(0, 0.5).setDepth(4);
        const dropdown = this.add.graphics().setPosition(390, y).setDepth(4);
        const text = this.add.text(390, y - 1, selected, { fontFamily: FONT_DISPLAY, fontSize: '16px', color: '#ffffff' }).setOrigin(0.5).setDepth(5);
        const draw = (): void => { dropdown.clear(); dropdown.fillStyle(0x07516a, 0.72).fillRoundedRect(-76, -20, 152, 40, 20); dropdown.lineStyle(2, 0x69cbd4, 0.55).strokeRoundedRect(-76, -20, 152, 40, 20); dropdown.fillStyle(0xffffff, 1).fillTriangle(52, -5, 62, -5, 57, 3); };
        draw();
        const hit = this.add.rectangle(390, y, 152, 44, 0xffffff, 0.001).setInteractive({ useHandCursor: true }).setDepth(6);
        hit.on('pointerdown', () => { const next = options[(options.indexOf(text.text) + 1) % options.length]; text.setText(next); select(next); });
        addPressFx(this, hit, text, { hoverScale: 1.04, pressScale: 0.96 });
        this.addSeparator(y);
    }

    private addSeparator(y: number): void { this.add.rectangle(270, y + 29, 420, 1, 0xb7f1ef, 0.16).setDepth(2); }

    private addVolumeRow(y: number): void {
        this.drawRowIcon(this.add.graphics().setPosition(78, y).setDepth(4), 'music');
        this.add.text(105, y, 'Audio Volumes', { fontFamily: FONT_DISPLAY, fontSize: '18px', color: '#ffffff' }).setOrigin(0, 0.5).setDepth(4);
        const percent = Math.round((loadProgress().masterVolume ?? 1) * 100);
        const dropdown = this.add.graphics().setPosition(390, y).setDepth(4);
        dropdown.fillStyle(0x07516a, 0.72).fillRoundedRect(-76, -20, 152, 40, 20);
        dropdown.lineStyle(2, 0x69cbd4, 0.55).strokeRoundedRect(-76, -20, 152, 40, 20);
        const text = this.add.text(390, y - 1, `MASTER ${percent}%`, {
            fontFamily: FONT_DISPLAY, fontSize: '14px', color: '#ffffff',
        }).setOrigin(0.5).setDepth(5);
        const hit = this.add.rectangle(390, y, 152, 44, 0xffffff, 0.001).setInteractive({ useHandCursor: true }).setDepth(6);
        hit.on('pointerdown', () => this.showVolumePanel());
        addPressFx(this, hit, text, { hoverScale: 1.04, pressScale: 0.96 });
        this.addSeparator(y);
    }

    private showVolumePanel(): void {
        if (this.modalLayer) {
            return;
        }

        gameAudio.playSfx('popupOpen');
        const { card } = this.createModalLayer(240);
        const cardBg = this.add.graphics();
        cardBg.fillStyle(0x022238, 0.8).fillRoundedRect(-210, -188, 420, 388, 28);
        cardBg.fillGradientStyle(0x47b9c8, 0x47b9c8, 0x157a9b, 0x157a9b, 1);
        cardBg.fillRoundedRect(-214, -194, 428, 388, 28);
        cardBg.lineStyle(5, 0x9de7e6, 0.95);
        cardBg.strokeRoundedRect(-214, -194, 428, 388, 28);
        cardBg.fillStyle(0xffffff, 0.14).fillRoundedRect(-196, -180, 392, 34, 17);

        const title = this.add.text(0, -150, 'AUDIO VOLUMES', {
            fontFamily: FONT_DISPLAY, fontSize: '26px', color: '#ffffff',
            stroke: '#176d86', strokeThickness: 4,
        }).setOrigin(0.5);

        const doneBg = this.add.graphics();
        doneBg.fillStyle(0x07516a, 0.55).fillRoundedRect(-95, 117, 190, 50, 25);
        doneBg.fillGradientStyle(0x32aebc, 0x32aebc, 0x16879d, 0x16879d, 1);
        doneBg.fillRoundedRect(-95, 110, 190, 50, 25);
        doneBg.lineStyle(3, 0xbff3f1, 0.85).strokeRoundedRect(-95, 110, 190, 50, 25);
        const doneText = this.add.text(0, 135, 'DONE', {
            fontFamily: FONT_DISPLAY, fontSize: '18px', color: '#ffffff',
            stroke: '#0a4a5a', strokeThickness: 3,
        }).setOrigin(0.5);
        card.add([cardBg, title, doneBg, doneText]);

        const progress = loadProgress();
        createVolumeSlider(this, card, {
            x: 0, y: -64, width: 348, label: 'MASTER VOLUME',
            value: progress.masterVolume ?? 1, onChange: setMasterVolume,
        });
        createVolumeSlider(this, card, {
            x: 0, y: 0, width: 348, label: 'MUSIC VOLUME',
            value: progress.musicVolume ?? 0.8, onChange: setMusicVolume,
        });
        createVolumeSlider(this, card, {
            x: 0, y: 64, width: 348, label: 'SFX VOLUME',
            value: progress.sfxVolume ?? 0.9, onChange: setSfxVolume,
        });

        const doneHit = this.add.rectangle(0, 135, 190, 50, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
        doneHit.on('pointerdown', () => {
            this.closeModalLayer();
        });
        addPressFx(this, doneHit, doneText, { hoverScale: 1.04, pressScale: 0.95 });
        card.add(doneHit);
        this.sharpenTexts(card);
    }

    private createBottomButtons(): void {
        const y = 700;
        this.createActionButton(155, y, 220, 58, 0x32aebc, 'Privacy Policy', 'document', () => this.showPrivacy());
        this.createActionButton(385, y, 220, 58, 0x9f3560, 'Reset Progress', 'reset', () => this.confirmReset());
    }

    private createActionButton(x: number, y: number, width: number, height: number, color: number, labelText: string, icon: string, action: () => void): void {
        const g = this.add.graphics().setDepth(10);
        const draw = (hover: boolean): void => {
            const isReset = color === 0x9f3560;
            const hoverTop = isReset ? 0xb94372 : hover ? 0x47c6d2 : color;
            const hoverBottom = isReset ? 0xd04f7a : hover ? 0x22d0d0 : color;
            g.clear();
            g.fillStyle(0x07516a, 0.55).fillRoundedRect(x - width / 2 + 3, y - height / 2 + 7, width, height, 18);
            g.fillGradientStyle(hoverTop, hoverTop, hoverBottom, hoverBottom, 1).fillRoundedRect(x - width / 2, y - height / 2, width, height, 18);
            g.fillStyle(0xffffff, 0.17).fillRoundedRect(x - width / 2 + 12, y - height / 2 + 7, width - 24, height / 3, 12);
            g.lineStyle(3, isReset ? 0xffb0c3 : 0xbff3f1, 0.85).strokeRoundedRect(x - width / 2, y - height / 2, width, height, 18);
        };
        draw(false);
        const iconG = this.add.graphics().setPosition(x - width / 2 + 29, y).setDepth(11); iconG.lineStyle(3, 0xffffff, 1);
        if (icon === 'reset') iconG.strokeCircle(0, 0, 9), iconG.lineBetween(7, -8, 10, -2);
        else iconG.strokeRoundedRect(-8, -11, 16, 22, 2), iconG.lineBetween(-4, -3, 4, -3), iconG.lineBetween(-4, 3, 4, 3);
        const label = this.add.text(x + (width > 170 ? 12 : 7), y, labelText, { fontFamily: FONT_DISPLAY, fontSize: width > 170 ? '15px' : '18px', color: '#ffffff' }).setOrigin(0.5).setDepth(11);
        const hit = this.add.rectangle(x, y, width, height, 0xffffff, 0.001).setInteractive({ useHandCursor: true }).setDepth(12);
        hit.on('pointerover', () => draw(true)); hit.on('pointerout', () => draw(false)); hit.on('pointerdown', action);
        addPressFx(this, hit, label, { hoverScale: 1.04, pressScale: 0.95 });
    }

    private showPrivacy(): void {
        if (this.modalLayer) {
            return;
        }

        gameAudio.playSfx('popupOpen');
        const { card } = this.createModalLayer(200);
        const bg = this.add.rectangle(0, 0, 430, 190, 0x052f4a, 0.98).setStrokeStyle(3, 0x75d4d8);
        const title = this.add.text(0, -55, 'Privacy Policy', { fontFamily: FONT_DISPLAY, fontSize: '24px', color: '#ffffff' }).setOrigin(0.5);
        const copy = this.add.text(0, -5, 'Game progress is stored locally on\nyour device. No personal data is collected.', { fontFamily: FONT, fontSize: '15px', color: '#dffcff', align: 'center' }).setOrigin(0.5);
        const close = this.add.text(0, 55, 'CLOSE', { fontFamily: FONT_DISPLAY, fontSize: '17px', color: '#ffffff', backgroundColor: '#268eab', padding: { x: 24, y: 8 } }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        close.on('pointerdown', () => this.closeModalLayer());
        card.add([bg, title, copy, close]);
        this.sharpenTexts(card);
    }

    private confirmReset(): void {
        if (this.locked || this.modalLayer) {
            return;
        }

        gameAudio.playSfx('popupOpen');
        const { card } = this.createModalLayer(220);
        const bg = this.add.rectangle(0, 0, 430, 220, 0x052f4a, 0.98).setStrokeStyle(3, 0xff7d91);
        const title = this.add.text(0, -65, 'Reset Progress?', { fontFamily: FONT_DISPLAY, fontSize: '25px', color: '#ffffff' }).setOrigin(0.5);
        const copy = this.add.text(0, -20, 'This cannot be undone.', { fontFamily: FONT, fontSize: '16px', color: '#dffcff' }).setOrigin(0.5);
        const yes = this.add.text(-75, 45, 'RESET', { fontFamily: FONT_DISPLAY, fontSize: '18px', color: '#ffffff', backgroundColor: '#e54868', padding: { x: 22, y: 10 } }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        const no = this.add.text(75, 45, 'CANCEL', { fontFamily: FONT_DISPLAY, fontSize: '17px', color: '#ffffff', backgroundColor: '#258aa3', padding: { x: 18, y: 10 } }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        yes.on('pointerdown', () => {
            resetProgress(true);
            this.closeModalLayer();
        });
        no.on('pointerdown', () => this.closeModalLayer());
        card.add([bg, title, copy, yes, no]);
        this.sharpenTexts(card);
    }


    public handleAndroidBack(): void {
        if (this.modalLayer) {
            this.closeModalLayer();
            return;
        }
        this.goBack();
    }

    private goBack(): void {
        if (this.locked) return; this.locked = true;
        if (this.returnTo === 'GameScene') goToSceneInstant(this, this.returnTo, { level: this.returnLevel });
        else goToSceneInstant(this, this.returnTo, undefined);
    }
}

