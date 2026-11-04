import { Scene } from 'phaser';
import { FONT, FONT_DISPLAY, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { LEVELS } from '../data/levels';
import {
    buildLevelMap,
    levelMapHeight,
    levelMapPageScroll,
    mapScrollBounds,
    MAP_BOTTOM_PAD,
    MAP_NODE_SPACING,
    levelMapPositionAt,
    NODE_TINT_COLORS,
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
import { Button, IconButton } from '../../ui/design';
import { attachRelayout, mapViewTopY, mapViewBottomY, worldWidth, worldHeight } from '../layout';

let VIEW_TOP = mapViewTopY();
let VIEW_BOTTOM = mapViewBottomY();
const DRAG_THRESHOLD = 10;
/** Nodes kept alive around the viewport while scrolling. */
const CULL_MARGIN = 220;
/** How far the drawn road reaches past the visible band. */
const PATH_MARGIN_NODES = 4;
/** Fade duration for showing a newly culled-in node. */
const NODE_SHOW_DURATION = 160;

const PATH_COLOR_CYCLE = [0x38bdf8, 0x22d3ee, 0x34d399, 0xfbbf24, 0xf472b6, 0xa78bfa];

export class LevelSelectionScene extends Scene {
    private locked = false;
    private selectedLevel = 0;
    private progress!: Progress;
    private entries: LevelMapEntry[] = [];
    private mapHeight = 0;
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
    private infoPanel: Phaser.GameObjects.Container | null = null;
    private selectedRing!: Phaser.GameObjects.Graphics;

    constructor() {
        super('LevelSelectionScene');
    }

    create(): void {
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
        this.mapHeight = levelMapHeight(this.entries.length);
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
        this.createMarker();
        this.hudLayer = this.add.container(0, 0).setDepth(40);
        this.createHud();
        this.createPlayButton();
        this.bindInput();
        this.scrollToLevel(this.selectedLevel, false);
        this.refreshHud();
        attachRelayout(this, () => {
            VIEW_TOP = mapViewTopY();
            VIEW_BOTTOM = mapViewBottomY();
            this.updateViewportLayout();
            configureLevelMapLayout(worldWidth(), VIEW_BOTTOM - VIEW_TOP);
            this.scene.restart();
        });

        fadeInScene(this, 280, [5, 10, 25]);
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
            const tint = locked ? 0x64748b : NODE_TINT_COLORS[entry.tint];
            const radius = 26;

            graphics.fillStyle(0x020617, 0.45);
            graphics.fillCircle(2, 4, radius + 2);
            graphics.fillStyle(tint, locked ? 0.55 : 1);
            graphics.fillCircle(0, 0, radius);
            graphics.fillStyle(0xffffff, locked ? 0.08 : 0.22);
            graphics.fillCircle(-7, -8, 9);
            graphics.lineStyle(3, entry.state === 'completed' ? 0xfbbf24 : 0xf8fafc, 0.9);
            graphics.strokeCircle(0, 0, radius);

            node.add(graphics);

            const label = this.add
                .text(0, -1, String(entry.id), {
                    fontFamily: FONT_DISPLAY,
                    fontSize: entry.id >= 1000 ? '12px' : '15px',
                    color: locked ? '#334155' : '#0f172a',
                })
                .setOrigin(0.5);
            node.add(label);

            if (entry.state === 'completed' && entry.stars > 0) {
                for (let star = 0; star < 3; star++) {
                    const mark = this.add
                        .text((star - 1) * 12, 36, '★', {
                            fontFamily: FONT,
                            fontSize: '11px',
                            color: star < entry.stars ? '#fbbf24' : '#64748b',
                        })
                        .setOrigin(0.5);
                    node.add(mark);
                }
            }

            const hit = this.add.circle(0, 0, 32, 0xffffff, 0.001).setInteractive({
                useHandCursor: !locked,
            });
            node.add(hit);
            hit.on('pointerup', () => this.trySelect(entry.index));
            // Culling starts fully hidden; the first scroll pass reveals it.
            node.setVisible(false);
            this.nodeLayer.add(node);
        });

        this.selectedRing = this.add.graphics();
        this.nodeLayer.add(this.selectedRing);
        this.drawSelectedRing();
        this.updateVisibleNodes();
    }

    private drawSelectedRing(): void {
        const entry = this.entries[this.selectedLevel];
        this.selectedRing.clear();

        if (!entry) {
            return;
        }

        this.selectedRing.lineStyle(4, 0xfde68a, 1);
        this.selectedRing.strokeCircle(entry.x, entry.y, 34);
        this.selectedRing.lineStyle(2, 0xffffff, 0.7);
        this.selectedRing.strokeCircle(entry.x, entry.y, 40);
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
        const settings = new IconButton(this, {
            x: 36,
            y: 48,
            icon: 'gear',
            background: false,
            size: 24,
            onClick: () => this.goToSettings(),
        });
        const info = new IconButton(this, {
            x: 88,
            y: 48,
            icon: 'info',
            background: false,
            size: 24,
            onClick: () => this.toggleInfo(),
        });

        this.hudLayer.add([settings.getContainer(), info.getContainer()]);

        const coinBg = this.add.graphics();
        coinBg.fillStyle(0x0f172a, 0.96);
        coinBg.fillRoundedRect(GAME_WIDTH - 147, 27, 127, 42, 21);
        coinBg.lineStyle(2, 0xfff3b0, 0.95);
        coinBg.strokeRoundedRect(GAME_WIDTH - 147, 27, 127, 42, 21);
        coinBg.lineStyle(2, 0xf59e0b, 0.95);
        coinBg.strokeRoundedRect(GAME_WIDTH - 143, 31, 119, 34, 17);
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
                color: '#fde68a',
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
        this.hudLayer.add([addCoins, addCoinsText]);
    }

    private goToSettings(): void {
        if (this.locked) return;
        this.locked = true;
        goToScene(this, 'SettingsScene', { returnTo: 'LevelSelectionScene' }, 180);
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
        this.mapLayer.setY(this.scrollY);
        this.updateVisibleNodes();
    }

    private updateVisibleNodes(): void {
        if (!this.nodeLayer) {
            return;
        }

        for (const object of this.nodeLayer.list) {
            if (object.type !== 'Container') {
                // The selection ring and marker always render.
                continue;
            }

            const node = object as Phaser.GameObjects.Container;
            const screenY = node.y + this.scrollY;
            const visible = screenY >= VIEW_TOP - CULL_MARGIN && screenY <= VIEW_BOTTOM + CULL_MARGIN;

            if (visible && !node.visible) {
                node.setVisible(true);
                node.setAlpha(0);
                this.tweens.add({ targets: node, alpha: 1, duration: NODE_SHOW_DURATION });
            } else if (!visible && node.visible) {
                this.tweens.killTweensOf(node);
                node.setAlpha(1);
                node.setVisible(false);
            }
        }

        this.drawVisiblePath();
    }

    /* ---------------------------------------------------------------- */
    /* Snake path + world art, drawn only for the visible scroll window   */
    /* ---------------------------------------------------------------- */

    private visibleNodeWindow(): { first: number; last: number } | null {
        const firstNodeY = this.mapHeight - MAP_BOTTOM_PAD;
        const topY = VIEW_TOP - this.scrollY - CULL_MARGIN;
        const bottomY = VIEW_BOTTOM - this.scrollY + CULL_MARGIN;
        const count = this.entries.length;

        let first = Math.ceil((firstNodeY - bottomY) / MAP_NODE_SPACING);
        let last = Math.floor((firstNodeY - topY) / MAP_NODE_SPACING);
        first = Math.max(0, first - 1);
        last = Math.min(count - 1, last + 1);

        if (first > last || count === 0) {
            return null;
        }

        return { first, last };
    }

    private drawVisiblePath(): void {
        const window = this.visibleNodeWindow();

        if (!window) {
            return;
        }

        this.drawPathSegments(window);
    }

    /** Layered fantasy road segments between the visible snake nodes. */
    private drawPathSegments(window: { first: number; last: number }): void {
        const graphics = this.pathGraphics;
        graphics.clear();

        const points = this.entries;

        const first = Math.max(0, window.first - PATH_MARGIN_NODES);
        const last = Math.min(points.length - 1, window.last + PATH_MARGIN_NODES);

        // Base road layers — a wide dark bed with glowing accents.
        graphics.lineStyle(38, 0x1e1b4b, 0.9);
        this.strokeWindowing(graphics, first, last);
        graphics.lineStyle(28, 0xc4b5fd, 0.42);
        this.strokeWindowing(graphics, first, last);
        graphics.lineStyle(18, 0xfde68a, 0.88);
        this.strokeWindowing(graphics, first, last);
        graphics.lineStyle(8, 0xfef3c7, 0.55);
        this.strokeWindowing(graphics, first, last);

        // Candy-coloured overlay for each snake bend.
        graphics.lineStyle(6, 0xffffff, 0.95);
        for (let index = first + 1; index <= last; index++) {
            graphics.lineStyle(6, PATH_COLOR_CYCLE[Math.floor(index / 8) % PATH_COLOR_CYCLE.length], 0.95);
            graphics.beginPath();
            graphics.moveTo(points[index - 1].x, points[index - 1].y);
            for (let sample = 1; sample <= 8; sample++) {
                const curveIndex = index - 1 + sample / 8;
                const curvePoint = levelMapPositionAt(curveIndex, points.length);
                graphics.lineTo(curvePoint.x, curvePoint.y);
            }
            graphics.strokePath();
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

            const tip = transform(12, 0);
            const upper = transform(-8, -10);
            const lower = transform(-8, 10);
            graphics.fillStyle(0xfff6bf, 0.95);
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
