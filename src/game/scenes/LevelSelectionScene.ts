import { Scene } from 'phaser';
import { FONT, FONT_DISPLAY, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { LEVELS } from '../data/levels';
import {
    buildLevelMap,
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
import { loadProgress, addCoins, type Progress } from '../utils/storage';
import { installUiAudio } from '../audio/GameAudio';
import { fadeInScene, goToScene, goToSceneInstant } from './transitions';
import { addPressFx } from '../../ui/uiFx';
import { Button } from '../../ui/design';
import { drawVectorIcon, type VectorIcon } from '../../ui/vectorIcons';
import { attachRelayout, mapViewTopY, mapViewBottomY, worldWidth, worldHeight } from '../layout';
import {
    STARTER_PACK_COINS,
    STARTER_PACK_PRICE_BDT,
    STARTER_PACK_TITLE,
    formatOfferCountdown,
    getStarterPackDeadline,
    isStarterPackExpired,
    starterPackRemainingMs,
} from '../offers/starterPack';
import { requestPurchase, verifyTransaction, hasProcessedTransaction, markTransactionProcessed } from '../payments/payments';
import type { RealMoneyProduct } from '../store/realMoneyCatalog';
import { acquireModalInputLock, releaseModalInputLock } from '../input/modalInputLock';
import { claimCollectedReward, getCollectedCount, isCollectedRewardAvailable, loadCollectedState } from '../collected/collected';

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
    private collectClaimBtn: Phaser.GameObjects.Container | null = null;
    private collectClaimedText: Phaser.GameObjects.Text | null = null;
    private currentLevelIndex = 0;
    private infoPanel: Phaser.GameObjects.Container | null = null;
    private dailyPopup: Phaser.GameObjects.Container | null = null;
    private dailyPopupTimer: Phaser.Time.TimerEvent | null = null;
    private starterPopup: Phaser.GameObjects.Container | null = null;
    private starterTimer: Phaser.Time.TimerEvent | null = null;
    private starterTimeText: Phaser.GameObjects.Text | null = null;
    private starterBuyText: Phaser.GameObjects.Text | null = null;
    private starterBuyBg: Phaser.GameObjects.Graphics | null = null;
    private starterStatusText: Phaser.GameObjects.Text | null = null;
    private starterBuyDisabled = false;
    private starterPurchasing = false;
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
        this.dailyPopup = null;
        this.dailyPopupTimer = null;
        this.starterPopup = null;
        this.starterTimer = null;
        this.starterTimeText = null;
        this.starterBuyText = null;
        this.starterBuyBg = null;
        this.starterStatusText = null;
        this.starterBuyDisabled = false;
        this.starterPurchasing = false;
        this.scrollTween = null;
        // Offer clock always runs on the Level Path: start (or resume the
        // persisted) 71:59:18 deadline now so it never pauses while the
        // popup is closed or the player navigates the map.
        getStarterPackDeadline();
        this.starterTimer = this.time.addEvent({ delay: 1000, loop: true, callback: () => this.tickStarterPack() });
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
        this.showDailyPopup();
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

        if (this.dailyPopupTimer) {
            this.dailyPopupTimer.remove();
            this.dailyPopupTimer = null;
        }
        this.dailyPopup?.destroy(true);
        this.dailyPopup = null;

        if (this.scrollTween) {
            this.scrollTween.remove();
            this.scrollTween = null;
        }

        if (this.starterTimer) {
            this.starterTimer.remove();
            this.starterTimer = null;
        }
        this.starterTimeText = null;
        this.starterBuyText = null;
        this.starterBuyBg = null;
        this.starterStatusText = null;
        this.starterBuyDisabled = false;
        this.starterPurchasing = false;
        releaseModalInputLock('starter-pack');
        this.starterPopup = null;

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

        // Collect Items panel with gift icon, X/15 counter and progress bar.
        const collectX = GAME_WIDTH / 2 - 160;
        const collectBg = this.add.graphics();
        collectBg.fillStyle(0x020617, 0.45);
        collectBg.fillRoundedRect(collectX, 72, 320, 66, 19);
        collectBg.fillStyle(0x1e1b4b, 0.96);
        collectBg.fillRoundedRect(collectX, 69, 320, 66, 19);
        collectBg.fillGradientStyle(0x3b1270, 0x3b1270, 0x1e1b4b, 0x1e1b4b, 1);
        collectBg.fillRoundedRect(collectX + 4, 73, 312, 58, 15);
        collectBg.fillStyle(0xffffff, 0.14);
        collectBg.fillRoundedRect(collectX + 12, 75, 296, 11, 6);
        collectBg.lineStyle(2, 0xa855f7, 0.9);
        collectBg.strokeRoundedRect(collectX, 69, 320, 66, 19);
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
            .text(GAME_WIDTH / 2 + 148, 89, '0/15 CARDS', {
                fontFamily: FONT_DISPLAY,
                fontSize: '10px',
                color: '#fde68a',
            })
            .setOrigin(1, 0.5);
        this.collectPercentText.setName('collect-count');
        // CLAIM 20 COINS button over the bar — only visible at 15/15.
        const claimBtn = this.add.container(GAME_WIDTH / 2, 116);
        const claimBg = this.add.graphics();
        claimBg.fillStyle(0x020617, 0.45);
        claimBg.fillRoundedRect(-79, -9, 158, 22, 11);
        claimBg.fillGradientStyle(0x4ade80, 0x4ade80, 0x16a34a, 0x16a34a, 1);
        claimBg.fillRoundedRect(-79, -11, 158, 22, 11);
        claimBg.fillStyle(0xffffff, 0.22);
        claimBg.fillRoundedRect(-71, -9, 142, 8, 4);
        claimBg.lineStyle(2, 0xffffff, 0.95);
        claimBg.strokeRoundedRect(-79, -11, 158, 22, 11);
        const claimText = this.add.text(0, 0, 'CLAIM 20 COINS', {
            fontFamily: FONT_DISPLAY,
            fontSize: '10px',
            color: '#ffffff',
            stroke: '#14532d',
            strokeThickness: 2,
        }).setOrigin(0.5);
        claimText.setName('collect-claim');
        const claimHit = this.add.rectangle(0, 0, 158, 22, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
        claimHit.on('pointerdown', () => this.claimCollected());
        claimBtn.add([claimBg, claimText, claimHit]);
        this.collectClaimBtn = claimBtn;
        const claimedText = this.add.text(GAME_WIDTH / 2, 116, '20 COINS CLAIMED ✓', {
            fontFamily: FONT_DISPLAY,
            fontSize: '11px',
            color: '#86efac',
            stroke: '#1e1b4b',
            strokeThickness: 2,
        }).setOrigin(0.5);
        claimedText.setName('collect-claimed');
        this.collectClaimedText = claimedText;
        this.hudLayer.add([collectBg, giftIcon, collectLabel, this.collectFill, this.collectPercentText, claimBtn, claimedText]);
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

    /**
     * Small auto-popup beside the Daily button: a single "View Tasks"
     * button, faded in on entry and faded out after ~3s. Only one popup
     * can exist at a time; clicking it stops the timer and opens Daily Tasks.
     */
    private showDailyPopup(): void {
        if (this.dailyPopup) {
            return;
        }

        const width = worldWidth();
        const padding = Math.max(34, Math.min(68, width * 0.063));
        const dailyX = padding;
        const dailyY = 330;
        const popupW = 110;
        const popupH = 36;
        const popupX = dailyX + 22 + 8 + popupW / 2;
        const popup = this.add.container(popupX, dailyY).setDepth(45).setAlpha(0);
        popup.setName('daily-popup');

        const bg = this.add.graphics();
        bg.fillStyle(0x020617, 0.45);
        bg.fillRoundedRect(-popupW / 2, -popupH / 2 + 4, popupW, popupH, 18);
        bg.fillGradientStyle(0x4fc8f5, 0x4fc8f5, 0x168bff, 0x168bff, 1);
        bg.fillRoundedRect(-popupW / 2, -popupH / 2, popupW, popupH, 18);
        bg.fillStyle(0xffffff, 0.22);
        bg.fillRoundedRect(-popupW / 2 + 10, -popupH / 2 + 5, popupW - 20, 11, 6);
        bg.lineStyle(2, 0xffffff, 0.95);
        bg.strokeRoundedRect(-popupW / 2, -popupH / 2, popupW, popupH, 18);

        const label = this.add
            .text(0, 0, 'View Tasks', { fontFamily: FONT_DISPLAY, fontSize: '13px', color: '#ffffff', stroke: '#0a3d91', strokeThickness: 2 })
            .setOrigin(0.5)
            .setName('view-tasks-button');
        const hit = this.add.rectangle(0, 0, popupW, popupH, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
        hit.on('pointerdown', () => {
            if (this.locked || this.infoPanel) return;
            this.hideDailyPopup();
            this.locked = true;
            goToSceneInstant(this, 'DailyTasksScene', { returnTo: 'LevelSelectionScene', instant: true });
        });
        popup.add([bg, label, hit]);
        this.dailyPopup = popup;
        this.hudLayer.add(popup);

        this.tweens.add({ targets: popup, alpha: 1, duration: 300, ease: 'Quad.easeOut' });
        this.dailyPopupTimer = this.time.addEvent({
            delay: 3000,
            callback: () => this.hideDailyPopup(),
        });
    }

    private hideDailyPopup(): void {
        if (this.dailyPopupTimer) {
            this.dailyPopupTimer.remove();
            this.dailyPopupTimer = null;
        }

        const popup = this.dailyPopup;
        this.dailyPopup = null;
        if (!popup) {
            return;
        }

        this.tweens.killTweensOf(popup);
        this.tweens.add({
            targets: popup,
            alpha: 0,
            duration: 250,
            ease: 'Quad.easeIn',
            onComplete: () => popup.destroy(true),
        });
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
        // Lock badge removed from the Starter Pack, Gift and Daily buttons —
        // they stay unlocked/enabled with their original icons restored.
        if (title !== 'DAILY' && title !== 'GIFT' && title !== 'STARTER') {
            graphics.fillStyle(0x64748b, 1);
            graphics.fillCircle(15, 15, 7);
            graphics.fillStyle(0xe5e7eb, 1);
            graphics.fillRect(11, 13, 8, 6);
            graphics.lineStyle(2, 0xe5e7eb, 1);
            graphics.strokeCircle(15, 11, 3);
        }
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
        if (title === 'DAILY') {
            // Instant navigation: no fade/slide/zoom transition or delay.
            hit.on('pointerdown', () => {
                if (this.locked || this.infoPanel) return;
                this.locked = true;
                goToSceneInstant(this, 'DailyTasksScene', { returnTo: 'LevelSelectionScene', instant: true });
            });
        } else if (title === 'GIFT') {
            // Instant navigation: no fade/slide/zoom transition or delay.
            // Gift button itself is never animated (no press FX).
            hit.on('pointerdown', () => {
                if (this.locked || this.infoPanel) return;
                this.locked = true;
                goToSceneInstant(this, 'GiftItemsScene', { returnTo: 'LevelSelectionScene', instant: true });
            });
        } else if (title === 'STARTER') {
            // STARTER (Status) button opens the Starter Pack offer popup
            // directly — no other button or gameplay changes.
            hit.on('pointerdown', () => {
                if (this.locked || this.infoPanel || this.starterPopup) return;
                this.hideDailyPopup();
                this.showStarterPackPopup();
            });
        } else {
            hit.on('pointerdown', () => {
                if (this.starterPopup) return;
                if (!this.infoPanel) {
                    this.toggleInfo();
                }
            });
        }
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
        if (this.locked || this.infoPanel || this.starterPopup || !this.inMapViewport(pointer.y)) {
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
        if (this.locked || this.infoPanel || this.starterPopup) {
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
        if (this.locked || this.dragMoved || this.infoPanel || this.starterPopup) {
            return;
        }

        const state = resolveLevelProgressState(index, this.progress);
        if (state === 'locked') {
            return;
        }

        this.selectedLevel = index;
        this.placeMarker();
        this.refreshHud();
        this.openLevelInstantly(index);
    }

    /** Instant level open: no fade/slide/zoom transition or delay. */
    private openLevelInstantly(index: number): void {
        if (this.locked) {
            return;
        }
        this.locked = true;
        goToSceneInstant(this, 'GameScene', { level: index, instant: true });
    }

    private playSelected(): void {
        if (this.locked || this.infoPanel || this.starterPopup) {
            return;
        }

        if (this.selectedState() === 'locked') {
            return;
        }

        this.openLevelInstantly(this.selectedLevel);
    }

    private selectedState(): LevelProgressState {
        return resolveLevelProgressState(this.selectedLevel, this.progress);
    }

    private refreshHud(): void {
        this.progress = loadProgress();

        if (this.coinBalanceText) {
            this.coinBalanceText.setText(this.progress.coins.toLocaleString('en-US'));
        }

        const collected = getCollectedCount();
        const collectedState = loadCollectedState();
        const rewardAvailable = isCollectedRewardAvailable();

        if (this.collectFill) {
            const ratio = collected / 15;
            const barX = GAME_WIDTH / 2 - 125;
            const barY = 116;
            const barW = 250;
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
            this.collectPercentText.setText(`${collected}/15 CARDS`);
        }
        this.collectClaimBtn?.setVisible(rewardAvailable);
        this.collectClaimedText?.setVisible(!rewardAvailable && collectedState.claimed && collected >= 15);

        const state = this.selectedState();
        const number = this.selectedLevel + 1;
        this.playButton.setDisabled(state === 'locked');
        this.playButton.setText(`Level ${number}`);
    }

    private claimCollected(): void {
        if (this.locked || this.infoPanel || this.starterPopup) {
            return;
        }
        if (claimCollectedReward()) {
            this.refreshHud();
        }
    }

    /** Starter Pack offer popup (reference-image design, no animation). */
    private showStarterPackPopup(): void {
        if (this.starterPopup) {
            return;
        }
        acquireModalInputLock('starter-pack');
        const width = worldWidth();
        const height = worldHeight();
        const cx = width / 2;
        const cy = height / 2 - 24;
        const popW = Math.min(340, width - 32);
        const popH = Math.min(470, height - 90);
        const top = cy - popH / 2;
        this.starterBuyDisabled = isStarterPackExpired();
        this.starterPurchasing = false;

        const popup = this.add.container(0, 0).setDepth(70);
        popup.setName('starter-pack-popup');
        const dim = this.add.rectangle(width / 2, height / 2, width, height, 0x0f0a2e, 0.78).setInteractive();
        const card = this.add.graphics();
        // Card shadow + deep-navy frame + body + royal header.
        card.fillStyle(0x020617, 0.55);
        card.fillRoundedRect(cx - popW / 2, top + 10, popW, popH, 26);
        card.fillStyle(0x1e1b4b, 1);
        card.fillRoundedRect(cx - popW / 2 - 6, top - 6, popW + 12, popH + 12, 30);
        card.lineStyle(4, 0xd4af37, 1);
        card.strokeRoundedRect(cx - popW / 2 - 6, top - 6, popW + 12, popH + 12, 30);
        card.fillStyle(0xffffff, 1);
        card.fillRoundedRect(cx - popW / 2, top, popW, popH, 26);
        // Header ribbon: slightly wider than the card, poking above it.
        card.fillGradientStyle(0x4c1d95, 0x4c1d95, 0x1e1b4b, 0x1e1b4b, 1);
        card.fillRoundedRect(cx - popW / 2 - 8, top - 6, popW + 16, 66, 18);
        card.lineStyle(2, 0xd4af37, 0.95);
        card.strokeRoundedRect(cx - popW / 2 - 8, top - 6, popW + 16, 66, 18);
        card.fillStyle(0xd4af37, 1);
        card.fillRect(cx - popW / 2 - 8, top + 52, popW + 16, 4);
        card.fillGradientStyle(0xffffff, 0xffffff, 0xf3e8ff, 0xf3e8ff, 1);
        card.fillRoundedRect(cx - popW / 2, top + 34, popW, popH - 34, 26);
        card.lineStyle(3, 0xd4af37, 1);
        card.strokeRoundedRect(cx - popW / 2, top + 28, popW, popH - 28, 26);
        // Gilt corner diamonds (ornament) inside the card frame.
        const corners: [number, number][] = [
            [cx - popW / 2 + 16, top + 16], [cx + popW / 2 - 16, top + 16],
            [cx - popW / 2 + 16, top + popH - 16 - 28], [cx + popW / 2 - 16, top + popH - 16 - 28],
        ];
        card.fillStyle(0xd4af37, 0.9);
        corners.forEach(([ox, oy]) => {
            card.fillTriangle(ox, oy - 7, ox + 7, oy, ox, oy + 7);
            card.fillTriangle(ox, oy - 7, ox - 7, oy, ox, oy + 7);
        });

        const header = 64;
        const bottomArea = 192;
        const artworkH = Math.max(110, popH - header - bottomArea);
        const artworkY = top + header;
        const rays = this.add.graphics();
        // Golden Treasure base: deep navy -> royal purple (static).
        rays.fillGradientStyle(0x1e1b4b, 0x1e1b4b, 0x3b1270, 0x3b1270, 1);
        rays.fillRect(cx - popW / 2 + 8, artworkY + 4, popW - 16, artworkH - 6);
        // Darker outer corners, brighter centre (vignette).
        rays.fillStyle(0x0b0620, 0.42);
        rays.fillEllipse(cx - popW / 2 + 16, artworkY + 8, 130, 90);
        rays.fillEllipse(cx + popW / 2 - 16, artworkY + 8, 130, 90);
        rays.fillEllipse(cx - popW / 2 + 16, artworkY + artworkH - 2, 130, 90);
        rays.fillEllipse(cx + popW / 2 - 16, artworkY + artworkH - 2, 130, 90);
        // Static sunburst rays behind the coins only (never over reward text).
        const rayCx = cx;
        const rayCy = artworkY + artworkH / 2;
        for (let i = 0; i < 12; i += 1) {
            const a0 = (i / 12) * Math.PI * 2;
            const a1 = ((i + 1) / 12) * Math.PI * 2;
            rays.fillStyle(i % 2 === 0 ? 0xffffff : 0xffe38a, 0.2);
            rays.fillTriangle(
                rayCx, rayCy,
                rayCx + Math.cos(a0) * (popW / 2 + 20), rayCy + Math.sin(a0) * (popW / 2 + 20),
                rayCx + Math.cos(a1) * (popW / 2 + 20), rayCy + Math.sin(a1) * (popW / 2 + 20),
            );
        }
        // Soft golden radial glow layered behind the coin pile.
        rays.fillStyle(0xd4af37, 0.22);
        rays.fillCircle(rayCx, rayCy, 96);
        rays.fillStyle(0xffe38a, 0.22);
        rays.fillCircle(rayCx, rayCy, 62);
        rays.fillStyle(0xffffff, 0.3);
        rays.fillCircle(rayCx, rayCy, 34);
        // Gilt inner frame + corner ornaments for the artwork.
        rays.lineStyle(2, 0xd4af37, 0.85);
        rays.strokeRect(cx - popW / 2 + 12, artworkY + 8, popW - 24, artworkH - 14);
        rays.fillStyle(0xd4af37, 0.95);
        [[cx - popW / 2 + 12, artworkY + 8], [cx + popW / 2 - 12, artworkY + 8], [cx - popW / 2 + 12, artworkY + artworkH - 6], [cx + popW / 2 - 12, artworkY + artworkH - 6]].forEach(([ox, oy]) => {
            rays.fillTriangle(ox, oy - 8, ox + 8, oy, ox, oy + 8);
            rays.fillTriangle(ox, oy - 8, ox - 8, oy, ox, oy + 8);
        });

        const coins = this.add.graphics();
        const drawCoin = (x: number, y: number, r: number): void => {
            // Premium metallic gold: dark rim, golden gradient body,
            // lighter inner face, rim light and a bright highlight.
            coins.fillStyle(0x92400e, 1);
            coins.fillEllipse(x, y + 3, r * 2.6, r * 2);
            coins.fillGradientStyle(0xffe38a, 0xffe38a, 0xb45309, 0xb45309, 1);
            coins.fillEllipse(x, y, r * 2.6, r * 2);
            coins.lineStyle(2, 0xfff6c9, 0.95);
            coins.strokeEllipse(x, y, r * 2.5, r * 1.9);
            coins.fillStyle(0xffe38a, 1);
            coins.fillEllipse(x, y, r * 2.0, r * 1.45);
            coins.lineStyle(1.5, 0xd97706, 0.9);
            coins.strokeEllipse(x, y, r * 1.9, r * 1.35);
            coins.fillStyle(0xffc928, 1);
            coins.fillCircle(x - r * 0.15, y, r * 0.42);
            coins.fillStyle(0xffffff, 0.85);
            coins.fillEllipse(x - r * 0.5, y - r * 0.35, r * 0.75, r * 0.4);
        };
        // Pile, bottom row first (vertical offsets compress on short cards
        // so the big coins never poke into the header).
        const coinS = Math.min(1, Math.max(0.45, (artworkH - 52) / 92));
        const py = artworkY + artworkH - 38;
        drawCoin(cx - 66, py, 20);
        drawCoin(cx - 30, py + 5, 21);
        drawCoin(cx + 8, py + 6, 21);
        drawCoin(cx + 45, py + 5, 20);
        drawCoin(cx + 75, py - 2, 19);
        drawCoin(cx - 47, py - 28 * coinS, 20);
        drawCoin(cx - 8, py - 27 * coinS, 21);
        drawCoin(cx + 30, py - 28 * coinS, 20);
        drawCoin(cx - 23, py - 56 * coinS, 20);
        drawCoin(cx + 11, py - 57 * coinS, 20);
        drawCoin(cx - 5, py - 84 * coinS, 19);
        drawCoin(cx + 26, py - 64 * coinS, 18);
        // Floating coins around the pile (slightly outside the card edge).
        drawCoin(cx - popW / 2 - 6, artworkY + 20, 21);
        drawCoin(cx + popW / 2 + 4, artworkY + 16, 20);
        drawCoin(cx - popW / 2 + 20, artworkY + artworkH - 30, 18);
        drawCoin(cx + popW / 2 - 20, artworkY + artworkH - 26, 19);
        // Sparkles + tiny floating light particles (static deco).
        coins.fillStyle(0xfff6c9, 0.95);
        coins.fillTriangle(cx - 96, artworkY + 58, cx - 90, artworkY + 58, cx - 93, artworkY + 50);
        coins.fillTriangle(cx + 94, artworkY + 70, cx + 100, artworkY + 70, cx + 97, artworkY + 62);
        coins.fillStyle(0xffe38a, 0.9);
        coins.fillTriangle(cx - 40, artworkY + 22, cx - 35, artworkY + 22, cx - 37, artworkY + 15);
        coins.fillTriangle(cx + 52, artworkY + 30, cx + 57, artworkY + 30, cx + 54, artworkY + 23);
        coins.fillStyle(0xffe38a, 0.6);
        coins.fillCircle(cx - 70, artworkY + 34, 2);
        coins.fillCircle(cx + 38, artworkY + 52, 2);
        coins.fillCircle(cx - 18, artworkY + 18, 2);
        coins.fillCircle(cx + 76, artworkY + 96, 2);
        coins.fillCircle(cx - 82, artworkY + 104, 2);
        coins.fillStyle(0xfff6c9, 0.5);
        coins.fillCircle(cx + 18, artworkY + 84, 1.5);
        coins.fillCircle(cx - 54, artworkY + 76, 1.5);

        const title = this.add.text(cx, top + 27, STARTER_PACK_TITLE, {
            fontFamily: FONT_DISPLAY, fontSize: '23px', color: '#ffe38a', stroke: '#1e1b4b', strokeThickness: 4,
        }).setOrigin(0.5);
        const bodyTop = artworkY + artworkH;
        const limited = this.add.text(cx, bodyTop + 18, 'LIMITED OFFER!', {
            fontFamily: FONT_DISPLAY, fontSize: '14px', color: '#33415c',
        }).setOrigin(0.5);
        const offer = this.add.text(cx, bodyTop + 42, `GET ${STARTER_PACK_COINS} COINS`, {
            fontFamily: FONT_DISPLAY, fontSize: '26px', color: '#33415c',
        }).setOrigin(0.5);
        const price = this.add.text(cx, bodyTop + 64, `ONLY FOR ${STARTER_PACK_PRICE_BDT}`, {
            fontFamily: FONT_DISPLAY, fontSize: '13px', color: '#5b6b8c',
        }).setOrigin(0.5);

        // 70% OFF badge on the left edge at the artwork/body seam.
        const badge = this.add.graphics();
        badge.fillStyle(0x020617, 0.35);
        badge.fillCircle(cx - popW / 2 + 2, bodyTop + 4, 32);
        badge.fillStyle(0xa855f7, 1);
        badge.fillCircle(cx - popW / 2, bodyTop, 32);
        badge.lineStyle(2, 0xffffff, 0.95);
        badge.strokeCircle(cx - popW / 2, bodyTop, 32);
        const badgePct = this.add.text(cx - popW / 2, bodyTop - 9, '70%', {
            fontFamily: FONT_DISPLAY, fontSize: '16px', color: '#ffffff',
        }).setOrigin(0.5).setAngle(-25);
        const badgeOff = this.add.text(cx - popW / 2, bodyTop + 9, 'OFF', {
            fontFamily: FONT_DISPLAY, fontSize: '14px', color: '#ffffff',
        }).setOrigin(0.5).setAngle(-25);

        const buyW = 200;
        const buyH = 48;
        const buyY = bodyTop + 104;
        const buyBg = this.add.graphics();
        const drawBuy = (): void => {
            buyBg.clear();
            buyBg.fillStyle(0x020617, 0.35);
            buyBg.fillRoundedRect(cx - buyW / 2, buyY - buyH / 2 + 3, buyW, buyH, 12);
            if (this.starterBuyDisabled) {
                buyBg.fillStyle(0x94a3b8, 1);
            } else {
                buyBg.fillGradientStyle(0x4ade80, 0x4ade80, 0x16a34a, 0x16a34a, 1);
            }
            buyBg.fillRoundedRect(cx - buyW / 2, buyY - buyH / 2, buyW, buyH, 12);
            buyBg.fillStyle(0xffffff, 0.22);
            buyBg.fillRoundedRect(cx - buyW / 2 + 10, buyY - buyH / 2 + 5, buyW - 20, 12, 6);
            buyBg.lineStyle(2, 0xffffff, 0.95);
            buyBg.strokeRoundedRect(cx - buyW / 2, buyY - buyH / 2, buyW, buyH, 12);
        };
        drawBuy();
        this.starterBuyBg = buyBg;
        const buyText = this.add.text(cx, buyY, this.starterBuyDisabled ? 'EXPIRED' : 'BUY NOW!', {
            fontFamily: FONT_DISPLAY, fontSize: '19px', color: '#ffffff', stroke: '#14532d', strokeThickness: 2,
        }).setOrigin(0.5);
        this.starterBuyText = buyText;
        const buyHit = this.add.rectangle(cx, buyY, buyW, buyH, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
        buyHit.on('pointerdown', (_pointer: Phaser.Input.Pointer, _lx: number, _ly: number, event: Phaser.Types.Input.EventData) => {
            event.stopPropagation();
            void this.buyStarterPack();
        });

        const status = this.add.text(cx, buyY + 36, this.starterBuyDisabled ? 'This offer has expired.' : '', {
            fontFamily: FONT, fontSize: '11px', color: '#b45309', align: 'center', wordWrap: { width: popW - 40 },
        }).setOrigin(0.5);
        status.setName('starter-status');
        this.starterStatusText = status;

        // TIME LEFT pill below the card (reference: outside the card body).
        const pillW = 220;
        const pillY = top + popH + 26;
        const pill = this.add.graphics();
        pill.fillStyle(0x020617, 0.35);
        pill.fillRoundedRect(cx - pillW / 2, pillY - 17 + 3, pillW, 36, 18);
        pill.fillGradientStyle(0xbfe3fb, 0xbfe3fb, 0x7cc3f5, 0x7cc3f5, 1);
        pill.fillRoundedRect(cx - pillW / 2, pillY - 17, pillW, 36, 18);
        pill.lineStyle(2, 0xffffff, 0.9);
        pill.strokeRoundedRect(cx - pillW / 2, pillY - 17, pillW, 36, 18);
        pill.fillStyle(0x168bff, 1);
        pill.fillCircle(cx - 78, pillY, 13);
        pill.lineStyle(2, 0xffffff, 0.95);
        pill.strokeCircle(cx - 78, pillY, 13);
        pill.lineStyle(2, 0xffffff, 1);
        pill.beginPath();
        pill.moveTo(cx - 78, pillY);
        pill.lineTo(cx - 78, pillY - 7);
        pill.moveTo(cx - 78, pillY);
        pill.lineTo(cx - 73, pillY + 2);
        pill.strokePath();
        const timeLabel = this.add.text(cx - 58, pillY, 'TIME LEFT', {
            fontFamily: FONT_DISPLAY, fontSize: '13px', color: '#1e3a5f',
        }).setOrigin(0, 0.5);
        const timeText = this.add.text(cx + 26, pillY, formatOfferCountdown(starterPackRemainingMs()), {
            fontFamily: FONT_DISPLAY, fontSize: '16px', color: '#1e3a5f',
        }).setOrigin(0, 0.5);
        timeText.setName('starter-countdown');
        this.starterTimeText = timeText;

        // Close (X) button at the top-right corner.
        const closeX = cx + popW / 2 - 4;
        const closeY = top + 2;
        const closeBg = this.add.graphics();
        closeBg.fillStyle(0x020617, 0.25);
        closeBg.fillCircle(closeX + 1, closeY + 2, 17);
        closeBg.fillStyle(0xffffff, 1);
        closeBg.fillCircle(closeX, closeY, 17);
        closeBg.lineStyle(2, 0x168bff, 0.9);
        closeBg.strokeCircle(closeX, closeY, 17);
        const closeIcon = this.add.graphics();
        closeIcon.lineStyle(3, 0x168bff, 1);
        closeIcon.beginPath();
        closeIcon.moveTo(closeX - 6, closeY - 6);
        closeIcon.lineTo(closeX + 6, closeY + 6);
        closeIcon.moveTo(closeX + 6, closeY - 6);
        closeIcon.lineTo(closeX - 6, closeY + 6);
        closeIcon.strokePath();
        const closeHit = this.add.circle(closeX, closeY, 18, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
        closeHit.on('pointerdown', (_pointer: Phaser.Input.Pointer, _lx: number, _ly: number, event: Phaser.Types.Input.EventData) => {
            event.stopPropagation();
            this.hideStarterPackPopup();
        });

        // Swallow clicks inside the card + ribbon + pill so they never reach the map.
        const blocker = this.add.rectangle(cx, cy + 15, popW + 24, popH + 72, 0xffffff, 0.001).setInteractive();
        blocker.on('pointerdown', (_pointer: Phaser.Input.Pointer, _lx: number, _ly: number, event: Phaser.Types.Input.EventData) => {
            event.stopPropagation();
        });
        dim.on('pointerdown', () => {
            this.hideStarterPackPopup();
        });

        popup.add([dim, blocker, card, rays, coins, title, limited, offer, price, badge, badgePct, badgeOff, buyBg, buyText, status, pill, timeLabel, timeText, closeBg, closeIcon, buyHit, closeHit]);
        this.starterPopup = popup;
        this.starterBuyDisabled = isStarterPackExpired();
        if (this.starterBuyDisabled) {
            drawBuy();
            buyText.setText('EXPIRED');
            status.setText('This offer has expired.');
        }
        // The 1s offer clock started in create() is always running; it
        // updates these texts live whether the popup is open or not.
    }

    private hideStarterPackPopup(): void {
        // Keep the offer clock running after close; only UI refs clear.
        this.starterTimeText = null;
        this.starterBuyText = null;
        this.starterBuyBg = null;
        this.starterStatusText = null;
        this.starterBuyDisabled = false;
        this.starterPurchasing = false;
        releaseModalInputLock('starter-pack');
        this.starterPopup?.destroy(true);
        this.starterPopup = null;
    }

    private tickStarterPack(): void {
        const remaining = starterPackRemainingMs();
        this.starterTimeText?.setText(formatOfferCountdown(remaining));
        if (remaining <= 0) {
            this.starterBuyDisabled = true;
            this.starterBuyText?.setText('EXPIRED');
            this.starterStatusText?.setText('This offer has expired.');
            this.starterBuyBg?.clear();
            const width = worldWidth();
            const height = worldHeight();
            const cy = height / 2 - 24;
            const popH = Math.min(470, height - 90);
            const buyW = 200;
            const buyH = 48;
            const artworkH = Math.max(110, popH - 64 - 192);
            const buyY = cy - popH / 2 + 64 + artworkH + 104;
            const g = this.starterBuyBg;
            if (g) {
                g.fillStyle(0x020617, 0.35);
                g.fillRoundedRect(width / 2 - buyW / 2, buyY - buyH / 2 + 3, buyW, buyH, 12);
                g.fillStyle(0x94a3b8, 1);
                g.fillRoundedRect(width / 2 - buyW / 2, buyY - buyH / 2, buyW, buyH, 12);
                g.fillStyle(0xffffff, 0.22);
                g.fillRoundedRect(width / 2 - buyW / 2 + 10, buyY - buyH / 2 + 5, buyW - 20, 12, 6);
                g.lineStyle(2, 0xffffff, 0.95);
                g.strokeRoundedRect(width / 2 - buyW / 2, buyY - buyH / 2, buyW, buyH, 12);
            }
        }
    }

    private setStarterStatus(message: string): void {
        this.starterStatusText?.setText(message);
    }

    private async buyStarterPack(): Promise<void> {
        if (!this.starterPopup || this.starterBuyDisabled || this.starterPurchasing) {
            return;
        }
        if (isStarterPackExpired()) {
            this.tickStarterPack();
            return;
        }
        const product: RealMoneyProduct = {
            id: 'starter-pack-offer',
            sku: 'starter_pack_30_coins',
            name: STARTER_PACK_TITLE,
            coins: STARTER_PACK_COINS,
            grants: {},
            usdPrice: STARTER_PACK_PRICE_BDT,
        };
        this.starterPurchasing = true;
        this.setStarterStatus('Processing…');
        const outcome = await requestPurchase(product);
        if (!this.starterPopup) {
            this.starterPurchasing = false;
            return;
        }
        if (outcome.status === 'unavailable') {
            this.setStarterStatus(outcome.reason ?? 'Store payments are not configured yet. No charge was made.');
            this.starterPurchasing = false;
            return;
        }
        if (outcome.status === 'cancelled') {
            this.setStarterStatus('Purchase cancelled. No charge was made.');
            this.starterPurchasing = false;
            return;
        }
        if (outcome.status !== 'granted') {
            this.setStarterStatus(outcome.reason ?? 'The purchase could not be completed. No charge was made.');
            this.starterPurchasing = false;
            return;
        }
        if (hasProcessedTransaction(outcome.transactionId)) {
            this.setStarterStatus('This transaction was already processed.');
            this.starterPurchasing = false;
            return;
        }
        const verification = await verifyTransaction(product, outcome.transactionId, outcome.platform, outcome.receipt);
        if (!verification.verified) {
            this.setStarterStatus(verification.reason ?? 'The purchase could not be verified. No rewards were granted.');
            this.starterPurchasing = false;
            return;
        }
        markTransactionProcessed(outcome.transactionId, product.id);
        addCoins(product.coins);
        this.progress = loadProgress();
        this.refreshHud();
        this.setStarterStatus(`Purchase successful! +${product.coins} Coins. Balance: ${this.progress.coins.toLocaleString('en-US')} Coins.`);
        this.starterPurchasing = false;
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


