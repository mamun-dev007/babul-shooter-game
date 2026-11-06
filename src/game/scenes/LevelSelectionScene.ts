import { Scene } from 'phaser';
import { FONT, FONT_DISPLAY, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { LEVELS } from '../data/levels';
import {
    buildLevelMap,
    levelMapPageScroll,
    levelMapCenterScroll,
    mapScrollBounds,
    levelMapPositionAt,
    configureLevelMapLayout,
    type LevelMapEntry,
} from '../data/levels/map';
import {
    resolveLevelProgressState,
    type LevelProgressState,
} from '../data/levels/progress';
import { loadProgress, type Progress } from '../utils/storage';
import { installUiAudio } from '../audio/GameAudio';
import { fadeInScene, goToScene } from './transitions';
import { addPressFx } from '../../ui/uiFx';
import { Button } from '../../ui/design';
import { drawVectorIcon, type VectorIcon } from '../../ui/vectorIcons';
import { attachRelayout, mapViewTopY, mapViewBottomY, worldWidth, worldHeight } from '../layout';

let VIEW_TOP = mapViewTopY();
let VIEW_BOTTOM = mapViewBottomY();
const DRAG_THRESHOLD = 10;

export class LevelSelectionScene extends Scene {
    private locked = false;
    private selectedLevel = 0;
    private progress!: Progress;
    private entries: LevelMapEntry[] = [];
    private scrollY = 0;
    private dragging = false;
    private dragMoved = false;
    private dragStartY = 0;
    private dragStartScroll = 0;
    private scrollTween: Phaser.Tweens.Tween | null = null;

    private mapLayer!: Phaser.GameObjects.Container;
    private hudLayer!: Phaser.GameObjects.Container;
    private nodeLayer!: Phaser.GameObjects.Container;
    private pathGraphics!: Phaser.GameObjects.Graphics;
    private marker!: Phaser.GameObjects.Container;
    private playButton!: Button;
    private coinBalanceText!: Phaser.GameObjects.Text;
    private collectFill!: Phaser.GameObjects.Graphics;
    private collectPercentText!: Phaser.GameObjects.Text;
    private currentLevelIndex = 0;
    private infoPanel: Phaser.GameObjects.Container | null = null;
    private selectedRing!: Phaser.GameObjects.Graphics;

    constructor() {
        super('LevelSelectionScene');
    }

    create(data: { instant?: boolean } = {}): void {
        VIEW_TOP = mapViewTopY();
        VIEW_BOTTOM = mapViewBottomY();
        configureLevelMapLayout(worldWidth(), VIEW_BOTTOM - VIEW_TOP);
        this.locked = false;
        this.dragging = false;
        this.dragMoved = false;
        this.infoPanel = null;
        this.scrollTween = null;
        this.progress = loadProgress();
        this.entries = buildLevelMap(LEVELS, this.progress);
        this.currentLevelIndex = this.entries.find((entry) => entry.state === 'unlocked')?.index ?? 0;
        // Auto-scroll to the furthest unlocked level on open (requirement:
        // the highest unlocked stop is highlighted as soon as the map shows).
        this.selectedLevel = Math.max(
            0,
            Math.min(this.progress.highestLevel, this.entries.length - 1)
        );

        installUiAudio(this);
        this.createBackground();
        this.mapLayer = this.add.container(0, 0).setDepth(1);
        this.pathGraphics = this.add.graphics();
        this.mapLayer.add(this.pathGraphics);
        this.nodeLayer = this.add.container(0, 0);
        this.mapLayer.add(this.nodeLayer);
        this.createNodes();
        this.drawFullRoad();
        this.createMarker();
        this.hudLayer = this.add.container(0, 0).setDepth(40);
        this.createHud();
        this.createSideButtons();
        this.createPlayButton();
        this.bindInput();
        // Instantly centre the current playable (selected/frontier) level at
        // the vertical centre of the visible map area — exact level centre,
        // not the page band — with no scroll animation on open.
        this.centerLevelInstantly(this.selectedLevel);
        this.refreshHud();
        attachRelayout(this, () => {
            VIEW_TOP = mapViewTopY();
            VIEW_BOTTOM = mapViewBottomY();
            this.updateViewportLayout();
            configureLevelMapLayout(worldWidth(), VIEW_BOTTOM - VIEW_TOP);
            this.scene.restart();
        });

        if (!data.instant) {
            fadeInScene(this, 280, [5, 10, 25]);
        }
        this.events.once('shutdown', this.handleShutdown, this);
    }

    private handleShutdown(): void {
        this.unbindInput();

        if (this.scrollTween) {
            this.scrollTween.remove();
            this.scrollTween = null;
        }

        this.infoPanel = null;
        this.tweens.killTweensOf(this.mapLayer);
    }

    private createBackground(): void {
        if (this.textures.exists('bg-level-map')) {
            const bg = this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'bg-level-map').setDepth(-40);
            bg.setScale(Math.max(GAME_WIDTH / bg.width, GAME_HEIGHT / bg.height));
            return;
        }
        // Fallback only: shown when the background image failed to load.
        // No colour overlay is painted over the real background image.
        const bg = this.add.graphics().setDepth(-40);
        bg.fillGradientStyle(0x1e1b4b, 0x1a1740, 0x0f0524, 0x0b0820, 1);
        bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    }

    private createNodes(): void {
        this.entries.forEach((entry) => {
            const node = this.add.container(entry.x, entry.y);
            node.setName(`level-node-${entry.id}`);

            const graphics = this.add.graphics();
            const locked = entry.state === 'locked';
            const isCurrent = entry.index === this.currentLevelIndex && entry.state === 'unlocked';
            const radius = 26;
            this.drawLevelButton(graphics, locked, isCurrent, radius);
            node.add(graphics);

            const label = this.add
                .text(0, -1, String(entry.id), {
                    fontFamily: FONT_DISPLAY,
                    fontSize: entry.id >= 1000 ? '12px' : '15px',
                    color: locked ? '#ffffff' : '#ffffff',
                    stroke: locked ? '#334155' : '#3b0764',
                    strokeThickness: locked ? 3 : 4,
                })
                .setOrigin(0.5);
            node.add(label);

if (entry.state === 'completed') {
    const offsets = [-20, 0, 20];
    const ys = [-34, -41, -34];
    const angles = [-20, 0, 20];
    offsets.forEach((offsetX, star) => {
        const mark = this.add
            .text(offsetX, ys[star], '★', {
                fontFamily: FONT_DISPLAY,
                fontSize: '22px',
                color: star < entry.stars ? '#fcd34d' : '#6b5fa8',
                stroke: '#b45309',
                strokeThickness: 3,
            })
            .setOrigin(0.5)
            .setAngle(angles[star]);
        node.add(mark);
    });
}
            const hit = this.add.circle(0, 0, 32, 0xffffff, 0.001).setInteractive({
                useHandCursor: !locked,
            });
            node.add(hit);
            hit.on('pointerup', () => this.trySelect(entry.index));
            // Every level stays rendered in the scrolling map — visibility is
            // governed only by the scroll position and screen bounds, never
            // by hiding nodes. The ~10-visible layout comes from the node
            // spacing plus scrolling, not from a rendering limit.
            node.setVisible(true);
            this.nodeLayer.add(node);
        });

        this.selectedRing = this.add.graphics();
        this.nodeLayer.add(this.selectedRing);
        this.drawSelectedRing();
    }

    /**
     * Reference-style level button: glossy 3D discs. Completed/current are
     * bright purple, current adds a green glow, locked is grey. Layered
     * shadow → outer rim → main disc → inner light → highlight → border
     * gives the depth without changing the 26px radius or touch target.
     */
    private drawLevelButton(
        graphics: Phaser.GameObjects.Graphics,
        locked: boolean,
        isCurrent: boolean,
        radius: number
    ): void {
        if (isCurrent) {
            graphics.fillStyle(0x38d94a, 0.28);
            graphics.fillCircle(0, 0, radius + 12);
            graphics.fillStyle(0x38d94a, 0.45);
            graphics.fillCircle(0, 0, radius + 5);
        }
        graphics.fillStyle(0x020617, 0.45);
        graphics.fillCircle(2, 4, radius + 2);
        if (locked) {
            graphics.fillStyle(0x374151, 1);
            graphics.fillCircle(0, 0, radius);
            graphics.fillStyle(0x9ca3af, 1);
            graphics.fillCircle(0, -1, radius - 3);
            graphics.fillStyle(0xd1d5db, 0.9);
            graphics.fillCircle(-4, -6, radius - 10);
            graphics.fillStyle(0xffffff, 0.35);
            graphics.fillCircle(-7, -9, 7);
            graphics.lineStyle(2, 0xe5e7eb, 0.6);
            graphics.strokeCircle(0, 0, radius);
            return;
        }
        graphics.fillStyle(0x3b1270, 1);
        graphics.fillCircle(0, 0, radius);
        graphics.fillStyle(0x8b5cf6, 1);
        graphics.fillCircle(0, -1, radius - 3);
        graphics.fillStyle(0xc4b5fd, 0.95);
        graphics.fillCircle(-2, -4, radius - 8);
        graphics.fillStyle(0xffffff, 0.35);
        graphics.fillCircle(-7, -9, 7);
        if (isCurrent) {
            graphics.lineStyle(1, 0x38d94a, 1);
            graphics.strokeCircle(0, 0, radius + 1);
        } else {
            graphics.lineStyle(1, 0xe9d5ff, 0.9);
            graphics.strokeCircle(0, 0, radius);
        }
    }

    private drawSelectedRing(): void {
        const entry = this.entries[this.selectedLevel];
        this.selectedRing.clear();

        if (!entry) {
            return;
        }

        this.selectedRing.lineStyle(2, 0xfde68a, 1);
        this.selectedRing.strokeCircle(entry.x, entry.y, 26);
        this.selectedRing.lineStyle(2, 0xffffff, 0.7);
        this.selectedRing.strokeCircle(entry.x, entry.y, 30);
    }

    private createMarker(): void {
        this.marker = this.add.container(0, 0);
        const pole = this.add.graphics();
        pole.fillStyle(0xfbbf24, 1);
        pole.fillTriangle(0, 0, -12, -20, 12, -20);
        pole.fillRect(-2, -20, 4, 18);
        this.marker.add(pole);
        this.nodeLayer.add(this.marker);
        this.tweens.add({
            targets: pole,
            y: -8,
            duration: 700,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });
        this.placeMarker();
    }

    private placeMarker(): void {
        const entry = this.entries[this.selectedLevel];
        if (!entry) {
            return;
        }

        this.marker.setPosition(entry.x, entry.y - 38);
        this.drawSelectedRing();
    }

    private createHud(): void {
        this.hudLayer.add(this.createGlossyTopButton(32, 48, 'gear', () => this.goToSettings()));
        this.hudLayer.add(this.createGlossyTopButton(76, 48, 'info', () => this.toggleInfo()));

        const coinBg = this.add.graphics();
        const coinX = GAME_WIDTH - 147;
        coinBg.fillStyle(0x020617, 0.45);
        coinBg.fillRoundedRect(coinX, 30, 127, 42, 21);
        coinBg.fillStyle(0x0a3d91, 1);
        coinBg.fillRoundedRect(coinX, 27, 127, 42, 21);
        coinBg.fillGradientStyle(0x4fc8f5, 0x4fc8f5, 0x168bff, 0x168bff, 1);
        coinBg.fillRoundedRect(coinX + 4, 31, 119, 34, 17);
        coinBg.fillStyle(0xffffff, 0.22);
        coinBg.fillRoundedRect(coinX + 12, 33, 103, 12, 6);
        coinBg.lineStyle(2, 0xffffff, 0.9);
        coinBg.strokeRoundedRect(coinX, 27, 127, 42, 21);
        const coin = this.add.circle(GAME_WIDTH - 122, 48, 14, 0xffc928, 1)
            .setStrokeStyle(3, 0xfff1a8, 1);
        const coinMark = this.add
            .text(GAME_WIDTH - 122, 48, '$', {
                fontFamily: FONT_DISPLAY,
                fontSize: '11px',
                color: '#78350f',
                stroke: '#fff0a6',
                strokeThickness: 1,
            })
            .setOrigin(0.5);
        this.coinBalanceText = this.add
            .text(GAME_WIDTH - 82, 48, this.progress.coins.toLocaleString('en-US'), {
                fontFamily: FONT_DISPLAY,
                fontSize: '15px',
                color: '#ffffff',
                stroke: '#0a3d91',
                strokeThickness: 3,
            })
            .setOrigin(0.5);
        this.coinBalanceText.setName('coin-balance');
        this.hudLayer.add([coinBg, coin, coinMark, this.coinBalanceText]);

        const addCoins = this.add.circle(GAME_WIDTH - 25, 48, 15, 0x22c55e, 1)
            .setStrokeStyle(2, 0xbbf7d0, 1)
            .setInteractive({ useHandCursor: true });
        const addCoinsText = this.add.text(GAME_WIDTH - 25, 48, '+', {
            fontFamily: FONT_DISPLAY,
            fontSize: '19px',
            color: '#ffffff',
        }).setOrigin(0.5);
        addCoins.on('pointerdown', () => addCoinsText.setScale(0.88));
        addCoins.on('pointerup', () => addCoinsText.setScale(1));
        addCoins.on('pointerdown', () => this.goToCoinStore());
        this.hudLayer.add([addCoins, addCoinsText]);

        // Collect Items panel with progress bar and gift icon.
        const collectX = GAME_WIDTH / 2 - 160;
        const collectBg = this.add.graphics();
        collectBg.fillStyle(0x020617, 0.45);
        collectBg.fillRoundedRect(collectX, 72, 320, 38, 19);
        collectBg.fillStyle(0x1e1b4b, 0.96);
        collectBg.fillRoundedRect(collectX, 69, 320, 38, 19);
        collectBg.fillGradientStyle(0x3b1270, 0x3b1270, 0x1e1b4b, 0x1e1b4b, 1);
        collectBg.fillRoundedRect(collectX + 4, 73, 312, 30, 15);
        collectBg.fillStyle(0xffffff, 0.14);
        collectBg.fillRoundedRect(collectX + 12, 75, 296, 11, 6);
        collectBg.lineStyle(2, 0xa855f7, 0.9);
        collectBg.strokeRoundedRect(collectX, 69, 320, 38, 19);
        const giftIcon = this.add.graphics();
        giftIcon.fillStyle(0x020617, 0.4);
        giftIcon.fillCircle(GAME_WIDTH / 2 - 138, 90, 14);
        giftIcon.fillStyle(0x168bff, 1);
        giftIcon.fillCircle(GAME_WIDTH / 2 - 138, 88, 13);
        giftIcon.fillStyle(0xffc928, 1);
        giftIcon.fillRect(GAME_WIDTH / 2 - 145, 84, 14, 10);
        giftIcon.fillStyle(0xff454f, 1);
        giftIcon.fillRect(GAME_WIDTH / 2 - 145, 81, 14, 4);
        giftIcon.fillStyle(0xfff1a8, 1);
        giftIcon.fillRect(GAME_WIDTH / 2 - 139.5, 81, 3, 13);
        const collectLabel = this.add
            .text(GAME_WIDTH / 2 - 116, 88, 'COLLECT ITEMS', {
                fontFamily: FONT_DISPLAY,
                fontSize: '10px',
                color: '#ffffff',
                stroke: '#1e1b4b',
                strokeThickness: 3,
            })
            .setOrigin(0, 0.5);
        this.collectFill = this.add.graphics();
        this.collectPercentText = this.add
            .text(GAME_WIDTH / 2 + 142, 88, '', {
                fontFamily: FONT_DISPLAY,
                fontSize: '10px',
                color: '#fde68a',
            })
            .setOrigin(0.5);
        this.hudLayer.add([collectBg, giftIcon, collectLabel, this.collectFill, this.collectPercentText]);
    }

    private createGlossyTopButton(
        x: number,
        y: number,
        icon: VectorIcon,
        onClick: () => void
    ): Phaser.GameObjects.Container {
        const button = this.add.container(x, y);
        const graphics = this.add.graphics();
        this.drawBlueGlossyCircle(graphics, 22);
        const iconGraphics = this.add.graphics().setScale(1.25);
        drawVectorIcon(iconGraphics, icon, 0xffffff, true, 0x0a3d91);
        const hit = this.add.circle(0, 0, 26, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
        hit.on('pointerdown', () => onClick());
        addPressFx(this, hit, button, { hoverScale: 1.06, pressScale: 0.92 });
        button.add([graphics, iconGraphics, hit]);
        return button;
    }

    private drawBlueGlossyCircle(graphics: Phaser.GameObjects.Graphics, radius: number): void {
        graphics.fillStyle(0x020617, 0.45);
        graphics.fillCircle(2, 4, radius + 2);
        graphics.fillStyle(0x0a3d91, 1);
        graphics.fillCircle(0, 0, radius);
        graphics.fillStyle(0x168bff, 1);
        graphics.fillCircle(0, -1, radius - 3);
        graphics.fillStyle(0x4fc8f5, 0.9);
        graphics.fillCircle(-3, -5, radius - 8);
        graphics.fillStyle(0xffffff, 0.35);
        graphics.fillCircle(-6, -8, 6);
        graphics.lineStyle(2, 0xffffff, 0.9);
        graphics.strokeCircle(0, 0, radius);
    }

    private createSideButtons(): void {
        // Responsive horizontal padding — a proportion of the world width,
        // clamped so the buttons sit slightly inward on phones yet do not
        // drift too far on wide desktop layouts. Both sides use the same
        // padding for balanced alignment, and the S-path (centred with its
        // widest nodes 90px from either edge at design width) keeps a clear
        // gap to the road. Buttons also stay fully inside the screen
        // (centre ± hit radius/label width never crosses an edge).
        const width = worldWidth();
        const padding = Math.max(34, Math.min(68, width * 0.063));
        const leftX = padding;
        const rightX = width - padding;
        this.hudLayer.add(this.createSideButton(leftX, 150, 'STARTER', 'UNLOCK LV. 10', 'chest'));
        this.hudLayer.add(this.createSideButton(leftX, 240, 'GIFT', 'UNLOCK LV. 25', 'gift'));
        this.hudLayer.add(this.createSideButton(leftX, 330, 'DAILY', 'UNLOCK LV. 50', 'star'));
        this.hudLayer.add(this.createSideButton(rightX, 150, 'SALE', 'UNLOCK LV. 15', 'sale'));
        this.hudLayer.add(this.createSideButton(rightX, 240, 'LOCKED', 'UNLOCK LV. 100', 'sale'));
    }

    private createSideButton(
        x: number,
        y: number,
        title: string,
        unlock: string,
        kind: 'chest' | 'gift' | 'sale' | 'star'
    ): Phaser.GameObjects.Container {
        const button = this.add.container(x, y);
        const graphics = this.add.graphics();
        this.drawBlueGlossyCircle(graphics, 22);
        this.drawSideIcon(graphics, kind);
        // Small grey lock at the lower-right of the glossy circle.
        graphics.fillStyle(0x64748b, 1);
        graphics.fillCircle(15, 15, 7);
        graphics.fillStyle(0xe5e7eb, 1);
        graphics.fillRect(11, 13, 8, 6);
        graphics.lineStyle(2, 0xe5e7eb, 1);
        graphics.strokeCircle(15, 11, 3);
        const titleText = this.add
            .text(0, 30, title, {
                fontFamily: FONT_DISPLAY,
                fontSize: '8px',
                color: '#ffffff',
                stroke: '#0a3d91',
                strokeThickness: 3,
            })
            .setOrigin(0.5);
        const unlockText = this.add
            .text(0, 41, unlock, {
                fontFamily: FONT_DISPLAY,
                fontSize: '7px',
                color: '#fde68a',
                stroke: '#0a3d91',
                strokeThickness: 2,
            })
            .setOrigin(0.5);
        const hit = this.add.circle(0, 0, 26, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
        hit.setData('sideButton', true);
        hit.on('pointerdown', () => {
            if (!this.infoPanel) {
                this.toggleInfo();
            }
        });
        button.add([graphics, titleText, unlockText, hit]);
        return button;
    }

    private drawSideIcon(graphics: Phaser.GameObjects.Graphics, kind: 'chest' | 'gift' | 'sale' | 'star'): void {
        if (kind === 'chest') {
            graphics.fillStyle(0x92400e, 1);
            graphics.fillRoundedRect(-10, -4, 20, 14, 3);
            graphics.fillStyle(0xb45309, 1);
            graphics.fillRoundedRect(-10, -10, 20, 8, 4);
            graphics.fillStyle(0xffc928, 1);
            graphics.fillRect(-2, -10, 4, 20);
            graphics.fillStyle(0xfff1a8, 1);
            graphics.fillRect(-3, 0, 6, 5);
        } else if (kind === 'sale') {
            graphics.fillStyle(0xff454f, 1);
            graphics.fillRoundedRect(-11, -7, 22, 14, 4);
            graphics.fillStyle(0xffffff, 1);
            graphics.fillCircle(7, -4, 2);
            graphics.fillStyle(0xffe38a, 1);
            graphics.fillRoundedRect(-4, -3, 9, 3, 1.5);
            graphics.fillRoundedRect(-1, 3, 9, 3, 1.5);
        } else if (kind === 'gift') {
            graphics.fillStyle(0x168bff, 1);
            graphics.fillRect(-9, -2, 18, 12);
            graphics.fillStyle(0xff454f, 1);
            graphics.fillRect(-10, -7, 20, 5);
            graphics.fillStyle(0xffc928, 1);
            graphics.fillRect(-2, -7, 4, 17);
        } else {
            graphics.fillStyle(0xffc928, 1);
            graphics.fillCircle(0, 0, 9);
            graphics.fillStyle(0xfff1a8, 1);
            graphics.fillCircle(0, 0, 6);
            graphics.fillStyle(0x92400e, 1);
            graphics.fillTriangle(0, -7, -2, -2, 2, -2);
            graphics.fillTriangle(-6, 1, -2, 1, -2, 5);
            graphics.fillTriangle(6, 1, 2, 1, 2, 5);
        }
    }

    private goToSettings(): void {
        if (this.locked) return;
        this.locked = true;
        goToScene(this, 'SettingsScene', { returnTo: 'LevelSelectionScene' }, 180);
    }

    private goToCoinStore(): void {
        if (this.locked) return;
        this.locked = true;
        goToScene(this, 'CoinStoreScene', { returnTo: 'LevelSelectionScene' }, 180);
    }

    private createPlayButton(): void {
        this.playButton = new Button(this, {
            x: GAME_WIDTH / 2,
            y: worldHeight() - 108,
            text: 'Level 1',
            variant: 'play',
            size: 'md',
            width: 260,
            onClick: () => this.playSelected(),
        });
        const playContainer = this.playButton.getContainer();
        playContainer.setX(worldWidth() / 2);
        playContainer.setDepth(41);
        const bubbleIcon = this.add.graphics();
        bubbleIcon.fillStyle(0x9eeaff, 1);
        bubbleIcon.fillCircle(-78, 0, 15);
        bubbleIcon.lineStyle(2, 0xffffff, 0.95);
        bubbleIcon.strokeCircle(-78, 0, 15);
        bubbleIcon.fillStyle(0xffffff, 0.8);
        bubbleIcon.fillCircle(-83, -5, 4);
        bubbleIcon.lineStyle(2, 0x0878b9, 0.9);
        bubbleIcon.beginPath();
        bubbleIcon.arc(-78, 0, 8, 0, Math.PI * 1.15, false);
        bubbleIcon.strokePath();
        playContainer.add(bubbleIcon);
        const label = playContainer.list.find((gameObject): gameObject is Phaser.GameObjects.Text => gameObject.type === 'Text');

        if (label) {
            label.setX(12);
        }
    }

    private updateViewportLayout(): void {
        if (!this.playButton) {
            return;
        }
        const playContainer = this.playButton.getContainer();
        playContainer.setPosition(worldWidth() / 2, worldHeight() - 108);
    }

    private bindInput(): void {
        this.input.on('pointerdown', this.onPointerDown, this);
        this.input.on('pointermove', this.onPointerMove, this);
        this.input.on('pointerup', this.onPointerUp, this);
        this.input.on('wheel', this.onWheel, this);
    }

    private unbindInput(): void {
        this.input.off('pointerdown', this.onPointerDown, this);
        this.input.off('pointermove', this.onPointerMove, this);
        this.input.off('pointerup', this.onPointerUp, this);
        this.input.off('wheel', this.onWheel, this);
    }

    private onPointerDown(pointer: Phaser.Input.Pointer): void {
        if (this.locked || this.infoPanel || !this.inMapViewport(pointer.y)) {
            return;
        }

        const overSideButton = this.input
            .hitTestPointer(pointer)
            .some((gameObject) => gameObject.getData('sideButton') === true);
        if (overSideButton) {
            return;
        }

        this.dragging = true;
        this.dragMoved = false;
        this.dragStartY = pointer.y;
        this.dragStartScroll = this.scrollY;
        this.killScrollTween();
    }

    private onPointerMove(pointer: Phaser.Input.Pointer): void {
        if (!this.dragging) {
            return;
        }

        const delta = pointer.y - this.dragStartY;

        if (Math.abs(delta) > DRAG_THRESHOLD) {
            this.dragMoved = true;
        }

        this.setScroll(this.dragStartScroll + delta);
    }

    private onPointerUp(): void {
        // Continuous scrolling: a drag ends exactly where the finger stopped.
        this.dragging = false;
    }

    private onWheel(
        _pointer: Phaser.Input.Pointer,
        _currentlyOver: Phaser.GameObjects.GameObject[],
        _deltaX: number,
        deltaY: number
    ): void {
        if (this.locked || this.infoPanel) {
            return;
        }

        this.killScrollTween();
        this.setScroll(this.scrollY - deltaY * 0.55);
    }

    private killScrollTween(): void {
        if (this.scrollTween) {
            this.scrollTween.remove();
            this.scrollTween = null;
        }
    }

    private inMapViewport(y: number): boolean {
        return y >= VIEW_TOP && y <= VIEW_BOTTOM;
    }

    private setScroll(next: number): void {
        const bounds = mapScrollBounds(this.entries.length, VIEW_TOP, VIEW_BOTTOM);
        this.scrollY = bounds.clamp(next);
        // The whole map (road + every level, all 1000) lives in this one
        // layer, so scrolling moves road and buttons together with no
        // per-scroll redraw and no hiding — only the layer offset changes.
        this.mapLayer.setY(this.scrollY);
    }

    /* ---------------------------------------------------------------- */
    /* Snake path + world art, drawn once for the whole scrollable map    */
    /* ---------------------------------------------------------------- */

    private drawFullRoad(): void {
        if (this.entries.length === 0) {
            return;
        }

        this.drawPathSegments({ first: 0, last: this.entries.length - 1 });
    }

    /** Layered sandy S-road over the fixed background: soft shadow, rim, main sand, centre light. */
    private drawPathSegments(window: { first: number; last: number }): void {
        const graphics = this.pathGraphics;
        graphics.clear();

        const first = window.first;
        const last = window.last;

        // Depth shadow, then the polished sandy layers that sit naturally
        // on the cave sand. Every layer follows the same smooth sine S-curve
        // (levelMapPositionAt) so the road stays centred on the nodes.
        graphics.lineStyle(70, 0x5b3fc4, 0.35)
        this.strokeWindowing(graphics, first, last);
        graphics.lineStyle(60, 0x7c5a2e, 1);
        this.strokeWindowing(graphics, first, last);
        graphics.lineStyle(48, 0xf7e7b0, 1);
        this.strokeWindowing(graphics, first, last);
        graphics.lineStyle(36, 0xfff3c4, 0.55);
        this.strokeWindowing(graphics, first, last);

        // Soft centre highlight dots for the worn-path look.
        graphics.lineStyle(4, 0xffffff, 0.55);
        for (let index = first + 1; index <= last; index++) {
            const previous = this.entries[index - 1];
            const current = this.entries[index];
            graphics.lineBetween(previous.x, previous.y, current.x, current.y);
        }

        this.drawPathArrows(graphics, first, last);
    }

    private strokeWindowing(
        graphics: Phaser.GameObjects.Graphics,
        first: number,
        last: number
    ): void {
        const points = this.entries;
        graphics.beginPath();

        graphics.moveTo(points[first].x, points[first].y);
        for (let index = first + 1; index <= last; index++) {
            for (let sample = 1; sample <= 8; sample++) {
                const curveIndex = index - 1 + sample / 8;
                const curvePoint = levelMapPositionAt(curveIndex, points.length);
                graphics.lineTo(curvePoint.x, curvePoint.y);
            }
        }

        graphics.strokePath();
    }

    private drawPathArrows(
        graphics: Phaser.GameObjects.Graphics,
        first: number,
        last: number
    ): void {
        for (let index = Math.max(1, first + 1); index <= last; index += 2) {
            const previous = this.entries[index - 1];
            const current = this.entries[index];
            const midX = (previous.x + current.x) / 2;
            const midY = (previous.y + current.y) / 2;
            const angle = Math.atan2(current.y - previous.y, current.x - previous.x);
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);

            const transform = (localX: number, localY: number) => ({
                x: midX + localX * cos - localY * sin,
                y: midY + localX * sin + localY * cos,
            });

            const tip = transform(8, 0);
            const upper = transform(-8, -10);
            const lower = transform(-8, 10);
            graphics.fillStyle(0x6b4f2a, 0.85);
            graphics.fillTriangle(tip.x, tip.y, upper.x, upper.y, lower.x, lower.y);
        }
    }

    /* ---------------------------------------------------------------- */
    /* Scroll + selection                                                 */
    /* ---------------------------------------------------------------- */

    private animateScroll(target: number): void {
        this.killScrollTween();
        const proxy = { value: this.scrollY };
        this.scrollTween = this.tweens.add({
            targets: proxy,
            value: target,
            duration: 280,
            ease: 'Cubic.easeOut',
            onUpdate: () => this.setScroll(proxy.value),
        });
    }

    private scrollToLevel(index: number, animate: boolean): void {
        const entry = this.entries[index];
        if (!entry) {
            return;
        }

        const clamped = levelMapPageScroll(index, this.entries.length, VIEW_TOP, VIEW_BOTTOM);

        if (!animate) {
            this.killScrollTween();
            this.setScroll(clamped);
            return;
        }

        this.animateScroll(clamped);
    }

    /**
     * Instantly places `index` at the vertical centre of the visible map
     * area (VIEW_TOP..VIEW_BOTTOM), using its actual road position. The
     * horizontal position is untouched and the prior scroll tween is
     * killed. Deliberately unclamped so even the first/last levels centre
     * exactly — drag/wheel scrolling afterwards stays clamped. Used for
     * the opening scroll — no animation.
     */
    private centerLevelInstantly(index: number): void {
        const entry = this.entries[index];
        if (!entry) {
            return;
        }

        this.killScrollTween();
        this.scrollY = levelMapCenterScroll(index, this.entries.length, VIEW_TOP, VIEW_BOTTOM);
        this.mapLayer.setY(this.scrollY);
    }

    private trySelect(index: number): void {
        if (this.locked || this.dragMoved || this.infoPanel) {
            return;
        }

        const state = resolveLevelProgressState(index, this.progress);
        if (state === 'locked') {
            return;
        }

        this.selectedLevel = index;
        this.placeMarker();
        this.refreshHud();
        this.scrollToLevel(index, true);
    }

    private playSelected(): void {
        if (this.locked || this.infoPanel) {
            return;
        }

        if (this.selectedState() === 'locked') {
            return;
        }

        this.locked = true;
        goToScene(this, 'GameScene', { level: this.selectedLevel }, 200);
    }

    private selectedState(): LevelProgressState {
        return resolveLevelProgressState(this.selectedLevel, this.progress);
    }

    private refreshHud(): void {
        this.progress = loadProgress();

        if (this.coinBalanceText) {
            this.coinBalanceText.setText(this.progress.coins.toLocaleString('en-US'));
        }

        const completed = this.progress.completedLevels.length;

        if (this.collectFill) {
            const ratio = LEVELS.length > 0 ? completed / LEVELS.length : 0;
            const barX = GAME_WIDTH / 2 - 30;
            const barY = 88;
            const barW = 140;
            const barH = 10;
            this.collectFill.clear();
            this.collectFill.fillStyle(0x02050d, 0.85);
            this.collectFill.fillRoundedRect(barX, barY - barH / 2, barW, barH, 5);
            if (ratio > 0) {
                const fillW = Math.max(barH, barW * ratio);
                this.collectFill.fillGradientStyle(0xffe38a, 0xffe38a, 0xffc928, 0xffc928, 1);
                this.collectFill.fillRoundedRect(barX, barY - barH / 2, fillW, barH, 5);
            }
            this.collectFill.lineStyle(1.5, 0xffffff, 0.7);
            this.collectFill.strokeRoundedRect(barX, barY - barH / 2, barW, barH, 5);
        }

        if (this.collectPercentText) {
            const percent = LEVELS.length > 0 ? Math.round((completed / LEVELS.length) * 100) : 0;
            this.collectPercentText.setText(`${percent}%`);
        }

        const state = this.selectedState();
        const number = this.selectedLevel + 1;
        this.playButton.setDisabled(state === 'locked');
        this.playButton.setText(`Level ${number}`);
    }

    private toggleInfo(): void {
        if (this.infoPanel) {
            this.infoPanel.destroy(true);
            this.infoPanel = null;
            return;
        }

        const panel = this.add.container(0, 0).setDepth(60);
        const dim = this.add
            .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x020617, 0.72)
            .setInteractive();
        const card = this.add.graphics();
        card.fillStyle(0x1e1b4b, 0.97);
        card.fillRoundedRect(36, 220, GAME_WIDTH - 72, 390, 22);
        card.lineStyle(2, 0xa855f7, 0.95);
        card.strokeRoundedRect(36, 220, GAME_WIDTH - 72, 390, 22);

        const heading = this.add
            .text(GAME_WIDTH / 2, 258, 'WORLD MAP', {
                fontFamily: FONT_DISPLAY,
                fontSize: '22px',
                color: '#fde68a',
            })
            .setOrigin(0.5);
        const body = this.add
            .text(
                GAME_WIDTH / 2,
                400,
                [
                    'A thousand stops wind along this snake of a path.',
                    'Only the first stop is open on a fresh save; each',
                    'victory unlocks the next number — failing keeps it locked.',
                    '',
                    'Completed stops show their stars and can be replayed.',
                    'Progress is saved in this browser and restored on refresh.',
                ].join('\n'),
                {
                    fontFamily: FONT,
                    fontSize: '13px',
                    color: '#e9d5ff',
                    align: 'center',
                    wordWrap: { width: GAME_WIDTH - 120 },
                    lineSpacing: 6,
                }
            )
            .setOrigin(0.5);

        const close = this.add
            .text(GAME_WIDTH / 2, 560, 'CLOSE', {
                fontFamily: FONT_DISPLAY,
                fontSize: '16px',
                color: '#86efac',
            })
            .setOrigin(0.5)
            .setInteractive({ useHandCursor: true });

        close.on('pointerdown', () => this.toggleInfo());
        dim.on('pointerdown', () => this.toggleInfo());
        panel.add([dim, card, heading, body, close]);
        this.infoPanel = panel;
        addPressFx(this, close, close, { hoverScale: 1.06, pressScale: 0.94 });
    }
}


