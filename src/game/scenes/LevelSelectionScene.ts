import { Scene } from 'phaser';
import { FONT, FONT_DISPLAY, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { LEVELS } from '../data/levels';
import {
    buildLevelMap,
    levelMapCenterScroll,
    mapScrollBounds,
    levelMapPositionAt,
    configureLevelMapLayout,
    MAP_NODE_SPACING,
    MAP_NODE_RADIUS,
    MAP_NODE_HIT_RADIUS,
    MAP_PATH_SCALE,
    MAP_LAYOUT_MOBILE,
    MAP_UI_SCALE,
    type LevelMapEntry,
} from '../data/levels/map';
import {
    resolveLevelProgressState,
    isStarterUnlocked,
    STARTER_UNLOCK_TEXT,
    type LevelProgressState,
} from '../data/levels/progress';
import { loadProgress, addCoins, type Progress } from '../utils/storage';
import { gameAudio, installUiAudio } from '../audio/GameAudio';
import { goToSceneInstant } from './transitions';
import { addPressFx } from '../../ui/uiFx';
import { Button } from '../../ui/design';
import { LevelPopup } from '../../ui/LevelPopup';
import { BackConfirmationPanel } from '../../ui/BackConfirmationPanel';
import { drawVectorIcon, type VectorIcon } from '../../ui/vectorIcons';
import { attachRelayout, computeWorldSize, mapViewTopY, mapViewBottomY, measureViewport, worldSize, worldWidth, worldHeight } from '../layout';
import {
    cssViewportWidth,
    levelBreakpointForWidth,
    type LevelBreakpointId,
} from '../levelBreakpoints';
import { starterPopupGeometry } from '../offers/starterPopupLayout';
import {
    LEVEL_HUD_SCALE,
    mobileSideButtonLayout,
    mobileTopBarLayout,
    starterDecorationLayout,
    type StarterDecorationLayout,
} from '../levelSectionLayout';
import {
    STARTER_PACK_TITLE,
    formatOfferCountdown,
    getStarterPackState,
    markStarterPackPurchased,
    starterPackProduct,
    type StarterPackOffer,
    type StarterPackState,
} from '../offers/starterPack';
import { grantPowerUp } from '../powerups/inventory';
import { requestPurchase, verifyTransaction, hasProcessedTransaction, markTransactionProcessed, finalizePurchase, queryLocalizedPrices, type LocalizedPrice } from '../payments/payments';
import type { RealMoneyProduct } from '../store/realMoneyCatalog';
import { acquireModalInputLock, releaseModalInputLock, clearPointerSuppression, isPointerReleaseSuppressed, suppressPointerRelease } from '../input/modalInputLock';
import { exitAndroidApp } from '../input/androidBack';
import { claimCollectedReward, getCollectedCount, isCollectedRewardAvailable, loadCollectedState } from '../collected/collected';

let VIEW_TOP = mapViewTopY();
let VIEW_BOTTOM = mapViewBottomY();
const DRAG_THRESHOLD = 10;
type HowToIcon = 'target' | 'shoot' | 'star' | 'power' | 'coins' | 'progress';

interface HowToSection {
    number: string;
    title: string;
    icon: HowToIcon;
    lines: string[];
}

const HOW_TO_TITLE = 'HOW TO PLAY';
const HOW_TO_CLOSING = 'Good Luck & Happy Shooting!';
const HOW_TO_TITLE_HEIGHT = 62;
const HOW_TO_FOOTER_HEIGHT = 78;
const HOW_TO_SECTION_GAP = 14;

const HOW_TO_SECTIONS: HowToSection[] = [
    { number: '1.', title: 'Objective', icon: 'target', lines: ['Match 3 or more bubbles of the same color to pop them and clear the board.'] },
    { number: '2.', title: 'How to Shoot', icon: 'shoot', lines: ['Aim your launcher toward the bubbles.', 'Tap or release to shoot.', 'Match the same-colored bubbles to destroy them.', 'Clear all required bubbles to complete the level.'] },
    { number: '3.', title: 'Earn Stars', icon: 'star', lines: ['Complete levels using fewer shots to earn more stars.', 'Earn up to 3 stars depending on your shooting performance.'] },
    { number: '4.', title: 'Power-Ups', icon: 'power', lines: ['Fire: Destroy multiple bubbles in its path.', 'Bomb: Blast nearby bubbles.', 'Color Change: Change your current bubble color.', 'Streak: Earn bonus power through consecutive successful shots.'] },
    { number: '5.', title: 'Coins & Rewards', icon: 'coins', lines: ['Earn coins by completing levels and claiming available rewards.', 'Use coins to unlock useful items and power-ups.'] },
    { number: '6.', title: 'Level Progress', icon: 'progress', lines: ['Complete levels, collect stars, and unlock new challenges.'] },
];

interface HowToPlayLayout {
    panelW: number;
    panelH: number;
    panelX: number;
    panelY: number;
    contentTop: number;
    contentH: number;
    scale: number;
    scrollable: boolean;
}

const howToPlayLayout = (viewW: number, viewH: number): HowToPlayLayout => {
    const w = Number.isFinite(viewW) && viewW > 0 ? viewW : 700;
    const h = Number.isFinite(viewH) && viewH > 0 ? viewH : 960;
    const scale = Math.max(0.72, Math.min(1, w / 700));
    const panelW = Math.min(600 * scale, w - 48);
    const panelH = Math.min(820 * scale, h - 48);
    const panelX = w / 2;
    const panelY = (h - panelH) / 2;
    const contentTop = panelY + HOW_TO_TITLE_HEIGHT * scale;
    const contentH = panelH - (HOW_TO_TITLE_HEIGHT + HOW_TO_FOOTER_HEIGHT) * scale;
    return { panelW, panelH, panelX, panelY, contentTop, contentH, scale, scrollable: false };
};
/**
 * How many rows beyond the viewport stay materialized (buttons) and drawn
 * (road). Nodes use a page-ish buffer so fast flings never show a gap; the
 * road uses a wider one so it is not redrawn on every page crossing.
 */
const NODE_WINDOW_BUFFER = 12;
const ROAD_WINDOW_BUFFER = 28;

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

    /**
     * Virtualized level nodes: `entries` always holds all 1000 stops, but
     * only the ones near the viewport exist as Phaser objects. Keeps scene
     * creation (and therefore page navigation) fast while looking
     * identical - every visible node is the exact same object tree as the
     * previous full build.
     */
    private readonly nodeByIndex = new Map<number, Phaser.GameObjects.Container>();
    private nodeRange: { first: number; last: number } = { first: 0, last: -1 };
    private roadRange: { first: number; last: number } = { first: 0, last: -1 };
    private collectFill!: Phaser.GameObjects.Graphics;
    private collectPercentText!: Phaser.GameObjects.Text;
    private collectClaimBtn: Phaser.GameObjects.Container | null = null;
    private collectClaimedText: Phaser.GameObjects.Text | null = null;
    private currentLevelIndex = 0;
    private infoPanel: Phaser.GameObjects.Container | null = null;
    /** Vertical scroll state for the How to Play popup on short screens. */
    private infoScroll: {
        layer: Phaser.GameObjects.Container;
        mask: Phaser.GameObjects.Graphics;
        min: number;
        y: number;
        dragging: boolean;
        startY: number;
        startScroll: number;
        top: number;
        bottom: number;
        down: (pointer: Phaser.Input.Pointer) => void;
        move: (pointer: Phaser.Input.Pointer) => void;
        up: () => void;
        wheel: (pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[], dx: number, dy: number) => void;
    } | null = null;
    private levelPopup: LevelPopup | null = null;
    private exitGamePanel: BackConfirmationPanel | null = null;
    private dailyPopup: Phaser.GameObjects.Container | null = null;
    private dailyPopupTimer: Phaser.Time.TimerEvent | null = null;
    private starterPopup: Phaser.GameObjects.Container | null = null;
    private starterTimer: Phaser.Time.TimerEvent | null = null;
    private starterTimeText: Phaser.GameObjects.Text | null = null;
    private starterBuyText: Phaser.GameObjects.Text | null = null;
    private starterBuyRedraw: (() => void) | null = null;
    private starterStatusText: Phaser.GameObjects.Text | null = null;
    private starterOfferText: Phaser.GameObjects.Text | null = null;
    private starterPriceText: Phaser.GameObjects.Text | null = null;
    private starterDiscountText: Phaser.GameObjects.Text | null = null;
    private starterLocalizedPrices: Map<string, LocalizedPrice> = new Map();
    private starterActiveOffer: StarterPackOffer | null = null;
    private starterCycleIndex = -1;
    /** Internal scroll used only when the enlarged card cannot fit vertically. */
    private starterScroll: {
        layer: Phaser.GameObjects.Container;
        mask: Phaser.GameObjects.Graphics;
        min: number;
        y: number;
        dragging: boolean;
        moved: boolean;
        startY: number;
        startScroll: number;
        down: (pointer: Phaser.Input.Pointer) => void;
        move: (pointer: Phaser.Input.Pointer) => void;
        up: () => void;
        wheel: (pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[], dx: number, dy: number) => void;
    } | null = null;
    private starterBuyDisabled = false;
    private starterPurchasing = false;
    private starterUi: {
        button: Phaser.GameObjects.Container;
        overlay: Phaser.GameObjects.Graphics;
        unlockText: Phaser.GameObjects.Text;
        hit: Phaser.GameObjects.Arc;
        lockIcon: Phaser.GameObjects.Container;
        message: Phaser.GameObjects.Text;
    } | null = null;
    private starterUnlocked: boolean | null = null;
    private selectedRing!: Phaser.GameObjects.Graphics;

    constructor() {
        super('LevelSelectionScene');
    }

    private mobileUi = false;
    /** Exact breakpoint multiplier for every Level Section button. */
    private uiScale = 1;
    private breakpointId: LevelBreakpointId = 'desktop';
    private relayoutFrame = 0;

    /**
     * Reads the live CSS viewport width (not physical pixels) and applies the
     * matching phone/tablet/desktop band. Widths 600px+ keep the existing
     * tablet/desktop layout (scale 1).
     */
    private applyResponsiveBreakpoint(): void {
        const band = levelBreakpointForWidth(cssViewportWidth());
        this.breakpointId = band.id;
        this.uiScale = band.buttonScale;
        this.mobileUi = band.mobile;
    }

    /** Effective scale for every Level Section HUD button (band - HUD size). */
    private get hudScale(): number {
        return this.uiScale * LEVEL_HUD_SCALE;
    }

    /**
     * Resizes/rotations that cross a band restart the scene so every button
     * is rebuilt at the new size. World-size changes are handled separately by
     * attachRelayout; when the world itself is about to change we let that
     * path restart (avoids two back-to-back restarts).
     */
    private handleViewportResize = (): void => {
        const viewport = measureViewport();
        const expected = computeWorldSize(viewport.width, viewport.height);
        const current = worldSize();

        if (expected.width !== current.width || expected.height !== current.height) {
            return;
        }

        if (levelBreakpointForWidth(cssViewportWidth()).id !== this.breakpointId) {
            this.queueRelayout();
        }
    };

    private queueRelayout(): void {
        if (this.relayoutFrame) {
            return;
        }

        this.relayoutFrame = requestAnimationFrame(() => {
            this.relayoutFrame = 0;
            if (this.scene.isActive()) {
                this.scene.restart();
            }
        });
    }

    public handleAndroidBack(): void {
        if (this.locked || this.exitGamePanel?.isOpen) {
            return;
        }

        if (this.starterPopup) {
            this.hideStarterPackPopup();
            return;
        }

        if (this.levelPopup?.isOpen) {
            this.levelPopup.hide();
            return;
        }

        if (this.infoPanel) {
            this.toggleInfo();
            return;
        }

        if (this.dailyPopup) {
            this.hideDailyPopup();
            return;
        }

        this.exitGamePanel = new BackConfirmationPanel(this, {
            title: 'Exit Game?',
            description: 'Are you sure you want to exit?',
            confirmLabel: 'Exit',
            cancelLabel: 'Continue',
            onConfirm: () => {
                this.exitGamePanel?.destroy();
                this.exitGamePanel = null;
                exitAndroidApp();
            },
            onCancel: () => {
                this.exitGamePanel?.destroy();
                this.exitGamePanel = null;
            },
        });
    }

    create(_data: { instant?: boolean } = {}): void {
        VIEW_TOP = mapViewTopY();
        VIEW_BOTTOM = mapViewBottomY();
        this.relayoutFrame = 0;
        this.applyResponsiveBreakpoint();
        configureLevelMapLayout(worldWidth(), VIEW_BOTTOM - VIEW_TOP, this.mobileUi, this.uiScale);
        this.locked = false;
        this.dragging = false;
        this.dragMoved = false;
        this.infoPanel = null;
        this.levelPopup?.hide();
        this.levelPopup = new LevelPopup(this);
        this.exitGamePanel?.destroy();
        this.exitGamePanel = null;
        this.dailyPopup = null;
        this.dailyPopupTimer = null;
        this.starterPopup = null;
        this.starterTimer = null;
        this.starterTimeText = null;
        this.starterBuyText = null;
        this.starterBuyRedraw = null;
        this.starterStatusText = null;
        this.starterOfferText = null;
        this.starterPriceText = null;
        this.starterDiscountText = null;
        this.starterLocalizedPrices = new Map();
        this.starterActiveOffer = null;
        this.starterCycleIndex = -1;
        this.starterBuyDisabled = false;
        this.starterPurchasing = false;
        this.starterUi = null;
        this.starterUnlocked = null;
        this.scrollTween = null;
        getStarterPackState();
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
        gameAudio.setMusicMode('menu');
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
        this.createSideButtons();
        this.syncStarterLock();
        this.showDailyPopup();
        this.createPlayButton();
        this.bindInput();
        // Instantly centre the current playable (selected/frontier) level at
        // the vertical centre of the visible map area - exact level centre,
        // not the page band - with no scroll animation on open. This also
        // materializes the visible node + road window.
        this.centerLevelInstantly(this.selectedLevel);
        this.refreshHud();
        attachRelayout(this, () => this.queueRelayout());
        window.addEventListener('resize', this.handleViewportResize, { passive: true });
        window.addEventListener('orientationchange', this.handleViewportResize, { passive: true });
        window.visualViewport?.addEventListener('resize', this.handleViewportResize, { passive: true });

        this.events.once('shutdown', this.handleShutdown, this);
    }

    private handleShutdown(): void {
        this.unbindInput();
        window.removeEventListener('resize', this.handleViewportResize);
        window.removeEventListener('orientationchange', this.handleViewportResize);
        window.visualViewport?.removeEventListener('resize', this.handleViewportResize);

        if (this.relayoutFrame) {
            cancelAnimationFrame(this.relayoutFrame);
            this.relayoutFrame = 0;
        }

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
        this.starterBuyRedraw = null;
        this.starterStatusText = null;
        this.starterOfferText = null;
        this.starterPriceText = null;
        this.starterDiscountText = null;
        this.starterLocalizedPrices = new Map();
        this.starterActiveOffer = null;
        this.starterCycleIndex = -1;
        this.starterBuyDisabled = false;
        this.starterPurchasing = false;
        this.starterUi = null;
        const starterScroll = this.starterScroll;
        if (starterScroll) {
            this.input.off('pointerdown', starterScroll.down);
            this.input.off('pointermove', starterScroll.move);
            this.input.off('pointerup', starterScroll.up);
            this.input.off('pointerupoutside', starterScroll.up);
            this.input.off('wheel', starterScroll.wheel);
            starterScroll.mask.destroy();
            this.starterScroll = null;
        }
        releaseModalInputLock('starter-pack');
        this.starterPopup = null;

        this.levelPopup?.hide();
        this.levelPopup = null;
        this.exitGamePanel?.destroy();
        this.exitGamePanel = null;
        this.removeInfoScroll();
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
        // Only the selection ring is created up front; the actual level
        // buttons are materialized on demand by syncVisibleMap() so scene
        // creation never builds all 1000 nodes.
        this.nodeByIndex.clear();
        this.nodeRange = { first: 0, last: -1 };
        this.roadRange = { first: 0, last: -1 };

        this.selectedRing = this.add.graphics();
        this.nodeLayer.add(this.selectedRing);
        this.drawSelectedRing();
    }

    /** Builds one map stop. Identical visuals to the previous full build. */
    private createNode(entry: LevelMapEntry): Phaser.GameObjects.Container {
        const node = this.add.container(entry.x, entry.y);
        node.setName(`level-node-${entry.id}`);

        const graphics = this.add.graphics();
        const locked = entry.state === 'locked';
        const isCurrent = entry.index === this.currentLevelIndex && entry.state === 'unlocked';
        const radius = MAP_NODE_RADIUS;
        this.drawLevelButton(graphics, locked, isCurrent, radius);
        node.add(graphics);

        const label = this.add
            .text(0, -1, String(entry.id), {
                fontFamily: FONT_DISPLAY,
                fontSize: entry.id >= 1000
                    ? `${Math.round(12 * MAP_UI_SCALE)}px`
                    : `${Math.round(15 * MAP_UI_SCALE)}px`,
                color: locked ? '#ffffff' : '#ffffff',
                stroke: locked ? '#334155' : '#3b0764',
                strokeThickness: locked ? 3 : 4,
            })
            .setOrigin(0.5);
        node.add(label);

        if (entry.state === 'completed') {
            const starOffsetX = Math.round(radius * 0.77);
            const offsets = [-starOffsetX, 0, starOffsetX];
            const ys = [-radius - 8, -radius - 15, -radius - 8];
            const angles = [-20, 0, 20];
            offsets.forEach((offsetX, star) => {
                const mark = this.add
                    .text(offsetX, ys[star], '★', {
                        fontFamily: FONT_DISPLAY,
                        fontSize: MAP_LAYOUT_MOBILE ? `${Math.round(20 * MAP_UI_SCALE)}px` : '22px',
                        color: star < entry.stars ? '#fcd34d' : '#6b5fa8',
                        stroke: '#b45309',
                        strokeThickness: 3,
                    })
                    .setOrigin(0.5)
                    .setAngle(angles[star]);
                node.add(mark);
            });
        }
        const hit = this.add.circle(0, 0, MAP_NODE_HIT_RADIUS, 0xffffff, 0.001).setInteractive({
            useHandCursor: !locked,
        });
        node.add(hit);
        hit.on('pointerup', (pointer: Phaser.Input.Pointer) => {
            if (isPointerReleaseSuppressed(pointer.id)) return;
            this.trySelect(entry.index);
        });
        this.nodeLayer.add(node);
        return node;
    }

    /**
     * Windowed rendering of the scrollable map: keeps the level buttons and
     * the sandy road alive only around the visible viewport (plus a buffer),
     * creating and destroying rows as the player scrolls. Node Y decreases
     * as the index grows, so the visible band maps directly onto an index
     * range - no per-frame scanning of all 1000 entries.
     */
    private syncVisibleMap(): void {
        const count = this.entries.length;
        if (count === 0) {
            return;
        }

        // Screen band translated into map-layer coordinates.
        const bandTop = VIEW_TOP - this.scrollY;
        const bandBottom = VIEW_BOTTOM - this.scrollY;
        const nodeBufferPx = MAP_NODE_SPACING * NODE_WINDOW_BUFFER;
        const roadBufferPx = MAP_NODE_SPACING * ROAD_WINDOW_BUFFER;

        // Reference y of index 0 (the bottom-most stop): y(i) = base - i * spacing.
        const baseY = this.entries[0].y;
        const clampIndex = (index: number): number =>
            Math.max(0, Math.min(count - 1, index));
        const firstVisible = clampIndex(
            Math.ceil((baseY - (bandBottom + roadBufferPx)) / MAP_NODE_SPACING)
        );
        const lastVisible = clampIndex(
            Math.floor((baseY - (bandTop - roadBufferPx)) / MAP_NODE_SPACING)
        );

        if (firstVisible > lastVisible) {
            return;
        }

        // Nodes exist for a slightly tighter window than the road so the
        // road is never redrawn more often than nodes churn.
        const firstNode = clampIndex(
            Math.ceil((baseY - (bandBottom + nodeBufferPx)) / MAP_NODE_SPACING)
        );
        const lastNode = clampIndex(
            Math.floor((baseY - (bandTop - nodeBufferPx)) / MAP_NODE_SPACING)
        );

        if (firstNode !== this.nodeRange.first || lastNode !== this.nodeRange.last) {
            for (const [index, node] of this.nodeByIndex) {
                if (index < firstNode || index > lastNode) {
                    node.destroy(true);
                    this.nodeByIndex.delete(index);
                }
            }
            for (let index = firstNode; index <= lastNode; index++) {
                if (!this.nodeByIndex.has(index)) {
                    this.nodeByIndex.set(index, this.createNode(this.entries[index]));
                }
            }
            this.nodeRange = { first: firstNode, last: lastNode };
        }

        // Redraw the road only when the visible band reaches past the
        // already-drawn segment window (hysteresis: never every scroll frame).
        if (
            firstVisible < this.roadRange.first ||
            lastVisible > this.roadRange.last ||
            this.roadRange.last < 0
        ) {
            this.drawPathSegments({ first: firstVisible, last: lastVisible });
            this.roadRange = { first: firstVisible, last: lastVisible };
        }
    }

    /**
     * Reference-style level button: glossy 3D discs. Completed/current are
     * bright purple, current adds a green glow, locked is grey. Layered
     * shadow - outer rim - main disc - inner light - highlight - border
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

        const radius = MAP_NODE_RADIUS;
        this.selectedRing.lineStyle(2, 0xfde68a, 1);
        this.selectedRing.strokeCircle(entry.x, entry.y, radius);
        this.selectedRing.lineStyle(2, 0xffffff, 0.7);
        this.selectedRing.strokeCircle(entry.x, entry.y, radius + 4);
    }

    private createMarker(): void {
        this.marker = this.add.container(0, 0);
        const pole = this.add.graphics();
        pole.fillStyle(0xfbbf24, 1);
        pole.fillTriangle(0, 0, -12, -20, 12, -20);
        pole.fillRect(-2, -20, 4, 18);
        pole.setScale(MAP_UI_SCALE);
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

        this.marker.setPosition(entry.x, entry.y - (MAP_NODE_RADIUS + Math.round(12 * MAP_UI_SCALE)));
        this.drawSelectedRing();
    }

    private createHud(): void {
        const s = this.hudScale;
        const top = mobileTopBarLayout(s);
        this.hudLayer.add(this.createGlossyTopButton(top.gearX, top.y, 'gear', () => this.goToSettings()));
        this.hudLayer.add(this.createGlossyTopButton(top.infoX, top.y, 'info', () => this.toggleInfo()));

        const pillW = Math.round(127 * s);
        const pillH = Math.round(42 * s);
        const pillR = pillH / 2;
        const pillTop = top.y - pillH / 2;
        const pillRight = GAME_WIDTH - Math.round(20 * s);
        const coinX = pillRight - pillW;
        const coinBg = this.add.graphics();
        coinBg.fillStyle(0x020617, 0.45);
        coinBg.fillRoundedRect(coinX, pillTop + Math.round(3 * s), pillW, pillH, pillR);
        coinBg.fillStyle(0x0a3d91, 1);
        coinBg.fillRoundedRect(coinX, pillTop, pillW, pillH, pillR);
        coinBg.fillGradientStyle(0x4fc8f5, 0x4fc8f5, 0x168bff, 0x168bff, 1);
        coinBg.fillRoundedRect(coinX + 4 * s, pillTop + 4 * s, pillW - 8 * s, pillH - 8 * s, (pillH - 8 * s) / 2);
        coinBg.fillStyle(0xffffff, 0.22);
        coinBg.fillRoundedRect(coinX + 12 * s, pillTop + 6 * s, pillW - 24 * s, 12 * s, 6 * s);
        coinBg.lineStyle(Math.max(1.5, 2 * s), 0xffffff, 0.9);
        coinBg.strokeRoundedRect(coinX, pillTop, pillW, pillH, pillR);

        const coinR = Math.round(14 * s);
        const coinCx = coinX + Math.round(25 * s);
        const coin = this.add.circle(coinCx, top.y, coinR, 0xffc928, 1)
            .setStrokeStyle(Math.max(1.5, 3 * s), 0xfff1a8, 1);
        const coinMark = this.add
            .text(coinCx, top.y, '$', {
                fontFamily: FONT_DISPLAY,
                fontSize: `${Math.round(11 * s)}px`,
                color: '#78350f',
                stroke: '#fff0a6',
                strokeThickness: 1,
            })
            .setOrigin(0.5);
        this.coinBalanceText = this.add
            .text(coinX + Math.round(65 * s), top.y, this.progress.coins.toLocaleString('en-US'), {
                fontFamily: FONT_DISPLAY,
                fontSize: `${Math.round(15 * s)}px`,
                color: '#ffffff',
                stroke: '#0a3d91',
                strokeThickness: Math.max(2, Math.round(3 * s)),
            })
            .setOrigin(0.5);
        this.coinBalanceText.setName('coin-balance');
        this.hudLayer.add([coinBg, coin, coinMark, this.coinBalanceText]);

        const addR = Math.round(15 * s);
        const addX = pillRight - Math.round(5 * s);
        const addCoins = this.add.circle(addX, top.y, addR, 0x22c55e, 1)
            .setStrokeStyle(Math.max(1.5, 2 * s), 0xbbf7d0, 1)
            .setInteractive({ useHandCursor: true });
        const addCoinsText = this.add.text(addX, top.y, '+', {
            fontFamily: FONT_DISPLAY,
            fontSize: `${Math.round(19 * s)}px`,
            color: '#ffffff',
        }).setOrigin(0.5);
        addCoins.on('pointerdown', () => addCoinsText.setScale(0.88));
        addCoins.on('pointerup', () => addCoinsText.setScale(1));
        addCoins.on('pointerdown', () => this.goToCoinStore());
        this.hudLayer.add([addCoins, addCoinsText]);

        // Collect Items panel with gift icon, X/15 counter and progress bar.
        // Shifted down so the enlarged top buttons never cover it.
        const collectShift = top.collectShift;
        const collectContainer = this.add.container(0, collectShift);
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
        // CLAIM 20 COINS button over the bar - only visible at 15/15.
        const claimS = this.uiScale;
        const claimW = Math.round(158 * claimS);
        const claimH = Math.round(22 * claimS);
        const claimR = Math.round(11 * claimS);
        const claimBtn = this.add.container(GAME_WIDTH / 2, 116);
        const claimBg = this.add.graphics();
        claimBg.fillStyle(0x020617, 0.45);
        claimBg.fillRoundedRect(-claimW / 2, -claimH / 2 + 2 * claimS, claimW, claimH, claimR);
        claimBg.fillGradientStyle(0x4ade80, 0x4ade80, 0x16a34a, 0x16a34a, 1);
        claimBg.fillRoundedRect(-claimW / 2, -claimH / 2, claimW, claimH, claimR);
        claimBg.fillStyle(0xffffff, 0.22);
        claimBg.fillRoundedRect(-claimW / 2 + 8 * claimS, -claimH / 2 + 2 * claimS, claimW - 16 * claimS, 8 * claimS, 4 * claimS);
        claimBg.lineStyle(2, 0xffffff, 0.95);
        claimBg.strokeRoundedRect(-claimW / 2, -claimH / 2, claimW, claimH, claimR);
        const claimText = this.add.text(0, 0, 'CLAIM 20 COINS', {
            fontFamily: FONT_DISPLAY,
            fontSize: `${Math.round(10 * claimS)}px`,
            color: '#ffffff',
            stroke: '#14532d',
            strokeThickness: 2,
        }).setOrigin(0.5);
        claimText.setName('collect-claim');
        const claimHit = this.add.rectangle(0, 0, claimW, claimH, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
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
        collectContainer.add([collectBg, giftIcon, collectLabel, this.collectFill, this.collectPercentText, claimBtn, claimedText]);
        this.hudLayer.add(collectContainer);
    }

    private createGlossyTopButton(
        x: number,
        y: number,
        icon: VectorIcon,
        onClick: () => void
    ): Phaser.GameObjects.Container {
        const button = this.add.container(x, y);
        const s = this.hudScale;
        const radius = Math.round(22 * s);
        const graphics = this.add.graphics();
        this.drawBlueGlossyCircle(graphics, radius);
        const iconGraphics = this.add.graphics().setScale(1.25 * s);
        drawVectorIcon(iconGraphics, icon, 0xffffff, true, 0x0a3d91);
        const hit = this.add.circle(0, 0, Math.round(26 * s), 0xffffff, 0.001).setInteractive({ useHandCursor: true });
        hit.on('pointerdown', () => onClick());
        addPressFx(this, hit, button, { hoverScale: 1.06, pressScale: 0.92 });
        button.add([graphics, iconGraphics, hit]);
        return button;
    }

    private drawBlueGlossyCircle(graphics: Phaser.GameObjects.Graphics, radius: number): void {
        const s = radius / 22;
        graphics.fillStyle(0x020617, 0.45);
        graphics.fillCircle(2 * s, 4 * s, radius + 2 * s);
        graphics.fillStyle(0x0a3d91, 1);
        graphics.fillCircle(0, 0, radius);
        graphics.fillStyle(0x168bff, 1);
        graphics.fillCircle(0, -1 * s, radius - 3 * s);
        graphics.fillStyle(0x4fc8f5, 0.9);
        graphics.fillCircle(-3 * s, -5 * s, radius - 8 * s);
        graphics.fillStyle(0xffffff, 0.35);
        graphics.fillCircle(-6 * s, -8 * s, 6 * s);
        graphics.lineStyle(Math.max(1.5, 2 * s), 0xffffff, 0.9);
        graphics.strokeCircle(0, 0, radius);
    }

    private createSideButtons(): void {
        const width = worldWidth();
        // One layout for every band: the scaled discs/labels drive the
        // spacing and insets, so larger buttons stay separated and on-screen.
        const side = mobileSideButtonLayout(this.hudScale, width);
        this.hudLayer.add(this.createSideButton(side.leftX, side.y1, 'STARTER', STARTER_UNLOCK_TEXT, 'chest'));
        this.hudLayer.add(this.createSideButton(side.leftX, side.y2, 'GIFT', '', 'gift'));
        this.hudLayer.add(this.createSideButton(side.leftX, side.y3, 'DAILY', '', 'star'));
        this.hudLayer.add(this.createSideButton(side.rightX, side.y1, 'SALE', 'UNLOCK LV. 550', 'sale'));
        this.hudLayer.add(this.createSideButton(side.rightX, side.y2, 'LOCKED', 'UNLOCK LV. 800', 'sale'));
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
        const side = mobileSideButtonLayout(this.hudScale, width);
        const dailyX = side.leftX;
        const dailyY = side.y3;
        const s = this.hudScale;
        const popupW = Math.round(110 * s);
        const popupH = Math.round(36 * s);
        const sideR = Math.round(22 * s);
        const popupX = dailyX + sideR + 8 + popupW / 2;
        const popup = this.add.container(popupX, dailyY).setDepth(45).setAlpha(0);
        popup.setName('daily-popup');

        const bg = this.add.graphics();
        bg.fillStyle(0x020617, 0.45);
        bg.fillRoundedRect(-popupW / 2, -popupH / 2 + 4 * s, popupW, popupH, 18 * s);
        bg.fillGradientStyle(0x4fc8f5, 0x4fc8f5, 0x168bff, 0x168bff, 1);
        bg.fillRoundedRect(-popupW / 2, -popupH / 2, popupW, popupH, 18 * s);
        bg.fillStyle(0xffffff, 0.22);
        bg.fillRoundedRect(-popupW / 2 + 10 * s, -popupH / 2 + 5 * s, popupW - 20 * s, 11 * s, 6 * s);
        bg.lineStyle(2, 0xffffff, 0.95);
        bg.strokeRoundedRect(-popupW / 2, -popupH / 2, popupW, popupH, 18 * s);

        const label = this.add
            .text(0, 0, 'View Tasks', { fontFamily: FONT_DISPLAY, fontSize: `${Math.round(13 * s)}px`, color: '#ffffff', stroke: '#0a3d91', strokeThickness: 2 })
            .setOrigin(0.5)
            .setName('view-tasks-button');
        const hit = this.add.rectangle(0, 0, popupW, popupH, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
        hit.on('pointerdown', () => {
            if (this.locked || this.infoPanel || this.levelPopup?.isOpen) return;
            this.hideDailyPopup();
            this.locked = true;
            goToSceneInstant(this, 'DailyTasksScene', { returnTo: 'LevelSelectionScene', instant: true });
        });
        popup.add([bg, label, hit]);
        this.dailyPopup = popup;
        this.hudLayer.add(popup);

        this.tweens.add({ targets: popup, alpha: 1, duration: 300, ease: 'Quad.easeOut' });
        gameAudio.playSfx('popupOpen');
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

        gameAudio.playSfx('popupClose');
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
        const s = this.hudScale;
        const radius = Math.round(22 * s);
        const graphics = this.add.graphics();
        this.drawBlueGlossyCircle(graphics, radius);
        const icon = this.add.graphics().setScale(s);
        this.drawSideIcon(icon, kind);
        if (title === 'SALE' || title === 'LOCKED') {
            graphics.fillStyle(0x64748b, 1);
            graphics.fillCircle(15 * s, 15 * s, 7 * s);
            graphics.fillStyle(0xe5e7eb, 1);
            graphics.fillRect(11 * s, 13 * s, 8 * s, 6 * s);
            graphics.lineStyle(Math.max(1.5, 2 * s), 0xe5e7eb, 1);
            graphics.strokeCircle(15 * s, 11 * s, 3 * s);
        }
        const isStarter = title === 'STARTER';
        const overlay = isStarter ? this.add.graphics() : null;
        if (overlay) {
            overlay.fillStyle(0x0f172a, 0.62);
            overlay.fillCircle(0, 0, radius);
            overlay.setVisible(false);
        }
        const titleText = this.add
            .text(0, Math.round(30 * s), title, {
                fontFamily: FONT_DISPLAY,
                fontSize: `${Math.round(8 * s)}px`,
                color: '#ffffff',
                stroke: '#0a3d91',
                strokeThickness: 3,
            })
            .setOrigin(0.5);
        const unlockText = unlock
            ? this.add
                .text(0, Math.round(41 * s), unlock, {
                    fontFamily: FONT_DISPLAY,
                    fontSize: `${Math.round(7 * s)}px`,
                    color: '#fde68a',
                    stroke: '#0a3d91',
                    strokeThickness: 2,
                })
                .setOrigin(0.5)
            : null;
        const hit = this.add.circle(0, 0, Math.round(26 * s), 0xffffff, 0.001).setInteractive({ useHandCursor: true });
        hit.setData('sideButton', true);
        if (title === 'DAILY') {
            // Instant navigation: no fade/slide/zoom transition or delay.
            hit.on('pointerdown', () => {
                if (this.locked || this.infoPanel || this.levelPopup?.isOpen) return;
                this.locked = true;
                goToSceneInstant(this, 'DailyTasksScene', { returnTo: 'LevelSelectionScene', instant: true });
            });
        } else if (title === 'GIFT') {
            // Instant navigation: no fade/slide/zoom transition or delay.
            // Gift button itself is never animated (no press FX).
            hit.on('pointerdown', () => {
                if (this.locked || this.infoPanel || this.levelPopup?.isOpen) return;
                this.locked = true;
                goToSceneInstant(this, 'GiftItemsScene', { returnTo: 'LevelSelectionScene', instant: true });
            });
        } else if (isStarter) {
            // STARTER (Status) button opens the Starter Pack offer popup
            // directly - only after enough real levels have been completed.
            hit.on('pointerdown', () => {
                if (this.locked || this.infoPanel || this.starterPopup || this.levelPopup?.isOpen) return;
                if (!isStarterUnlocked(this.progress)) {
                    this.showStarterUnlockRequirement();
                    return;
                }
                this.hideDailyPopup();
                this.showStarterPackPopup();
            });
        } else {
            hit.on('pointerdown', () => {
                if (this.starterPopup || this.levelPopup?.isOpen) return;
                if (!this.infoPanel) {
                    this.toggleInfo();
                }
            });
        }
        const children: Phaser.GameObjects.GameObject[] = [graphics, icon];
        if (overlay) {
            children.push(overlay);
        }
        children.push(titleText);
        if (unlockText) {
            children.push(unlockText);
        }
        children.push(hit);
        button.add(children);
        if (overlay && unlockText) {
            this.createStarterLockedDecorations(button, x, s, overlay, unlockText, hit, starterDecorationLayout(mobileSideButtonLayout(s, worldWidth()), s, worldWidth()));
        }
        return button;
    }

    /** Builds the lock icon and requirement label shown only while Starter is locked. */
    private createStarterLockedDecorations(
        button: Phaser.GameObjects.Container,
        x: number,
        s: number,
        overlay: Phaser.GameObjects.Graphics,
        unlockText: Phaser.GameObjects.Text,
        hit: Phaser.GameObjects.Arc,
        layout: StarterDecorationLayout
    ): void {
        const lockIcon = this.add.container(x, layout.lockY);
        const lockGfx = this.add.graphics();
        const ls = Math.max(0.9, s);
        const backR = layout.lockRadius;
        lockGfx.fillStyle(0x020617, 0.6);
        lockGfx.fillCircle(0, 0, backR);
        lockGfx.fillStyle(0x94a3b8, 1);
        lockGfx.fillRoundedRect(-8 * ls, -2 * ls, 16 * ls, 12 * ls, 3 * ls);
        lockGfx.lineStyle(Math.max(1.5, 2 * ls), 0xe5e7eb, 1);
        lockGfx.beginPath();
        lockGfx.arc(0, -2 * ls, 6 * ls, Math.PI, 0, true);
        lockGfx.strokePath();
        lockGfx.strokeRoundedRect(-8 * ls, -2 * ls, 16 * ls, 12 * ls, 3 * ls);
        lockGfx.fillStyle(0x1e293b, 1);
        lockGfx.fillCircle(0, 3 * ls, Math.max(1.4, 1.8 * ls));
        lockGfx.fillRect(-Math.max(0.8, 0.9 * ls), 3 * ls, Math.max(1.6, 1.8 * ls), 3 * ls);
        lockIcon.add(lockGfx);
        lockIcon.setVisible(false);
        this.hudLayer.add(lockIcon);

        const message = this.add.text(0, 0, 'Complete 20 Levels to Unlock', {
            fontFamily: FONT_DISPLAY,
            fontSize: `${Math.round(7 * s)}px`,
            color: '#fde68a',
            stroke: '#0a3d91',
            strokeThickness: 2,
            align: 'center',
            wordWrap: { width: layout.messageWidth },
        }).setOrigin(0.5, 0);
        const half = message.width / 2;
        const margin = 6;
        const messageX = Math.max(half + margin, Math.min(worldWidth() - half - margin, x));
        message.setPosition(messageX, layout.messageY);
        message.setVisible(false);
        this.hudLayer.add(message);

        this.starterUi = { button, overlay, unlockText, hit, lockIcon, message };
    }

    /** Reflects persisted completion progress onto the Starter button decoration. */
    private syncStarterLock(): void {
        const ui = this.starterUi;
        if (!ui) {
            return;
        }

        const unlocked = isStarterUnlocked(this.progress);
        if (unlocked === this.starterUnlocked) {
            return;
        }

        this.starterUnlocked = unlocked;
        ui.button.setAlpha(unlocked ? 1 : 0.62);
        ui.overlay.setVisible(!unlocked);
        ui.unlockText.setVisible(!unlocked);
        ui.lockIcon.setVisible(!unlocked);
        this.tweens.killTweensOf(ui.message);
        ui.message.setAlpha(1);
        ui.message.setVisible(false);
        if (ui.hit.input) {
            ui.hit.input.cursor = unlocked ? 'pointer' : false;
        }
    }

    private showStarterUnlockRequirement(): void {
        const ui = this.starterUi;
        if (!ui || isStarterUnlocked(this.progress)) {
            return;
        }

        this.tweens.killTweensOf(ui.message);
        ui.message.setText(`${STARTER_UNLOCK_TEXT} to open the Starter Offer.`);
        ui.message.setAlpha(1);
        ui.message.setVisible(true);
        this.tweens.add({
            targets: ui.message,
            alpha: 0,
            delay: 1600,
            duration: 350,
            ease: 'Quad.easeIn',
            onComplete: () => {
                ui.message.setVisible(false);
                ui.message.setAlpha(1);
            },
        });
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
        goToSceneInstant(this, 'SettingsScene', { returnTo: 'LevelSelectionScene' });
    }

    private goToCoinStore(): void {
        if (this.locked) return;
        this.locked = true;
        goToSceneInstant(this, 'CoinStoreScene', { returnTo: 'LevelSelectionScene', instant: true });
    }

    private createPlayButton(): void {
        this.playButton = new Button(this, {
            x: GAME_WIDTH / 2,
            y: worldHeight() - 108,
            text: 'Level 1',
            variant: 'play',
            size: 'md',
            // 306 design px is the mobile baseline; the container scale below
            // applies the breakpoint multiplier exactly once.
            width: this.mobileUi ? 306 : 260,
            onClick: () => this.playSelected(),
        });
        const playContainer = this.playButton.getContainer();
        playContainer.setX(worldWidth() / 2);
        playContainer.setDepth(41);
        if (this.mobileUi) {
            playContainer.setScale(this.uiScale);
        }
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
            if (this.mobileUi) {
                label.setFontSize('24px');
            }
        }
    }

    private bindInput(): void {
        this.input.on('pointerup', this.onAnyPointerUp, this);
        this.input.on('pointerupoutside', this.onAnyPointerUp, this);
        this.input.on('pointerdown', this.onPointerDown, this);
        this.input.on('pointermove', this.onPointerMove, this);
        this.input.on('pointerup', this.onPointerUp, this);
        this.input.on('wheel', this.onWheel, this);
    }

    private unbindInput(): void {
        this.input.off('pointerup', this.onAnyPointerUp, this);
        this.input.off('pointerupoutside', this.onAnyPointerUp, this);
        this.input.off('pointerdown', this.onPointerDown, this);
        this.input.off('pointermove', this.onPointerMove, this);
        this.input.off('pointerup', this.onPointerUp, this);
        this.input.off('wheel', this.onWheel, this);
    }

    private onAnyPointerUp(pointer: Phaser.Input.Pointer): void {
        clearPointerSuppression(pointer.id);
    }

    private onPointerDown(pointer: Phaser.Input.Pointer): void {
        if (this.locked || this.infoPanel || this.starterPopup || this.levelPopup?.isOpen || !this.inMapViewport(pointer.y)) {
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
        if (this.locked || this.infoPanel || this.starterPopup || this.levelPopup?.isOpen) {
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
        // The whole map (road + the materialized window of level buttons)
        // lives in this one layer, so scrolling moves road and buttons
        // together - only the layer offset changes plus the cheap
        // window sync that swaps far rows for near ones.
        this.mapLayer.setY(this.scrollY);
        this.syncVisibleMap();
    }

    /* ---------------------------------------------------------------- */
    /* Snake path + world art, windowed to the visible part of the map    */
    /* ---------------------------------------------------------------- */

    /** Layered sandy S-road over the fixed background: soft shadow, rim, main sand, centre light. */
    private drawPathSegments(window: { first: number; last: number }): void {
        const graphics = this.pathGraphics;
        graphics.clear();

        const first = window.first;
        const last = window.last;
        const pathScale = MAP_PATH_SCALE;

        // Depth shadow, then the polished sandy layers that sit naturally
        // on the cave sand. Every layer follows the same smooth sine S-curve
        // (levelMapPositionAt) so the road stays centred on the nodes.
        graphics.lineStyle(70 * pathScale, 0x5b3fc4, 0.35)
        this.strokeWindowing(graphics, first, last);
        graphics.lineStyle(60 * pathScale, 0x7c5a2e, 1);
        this.strokeWindowing(graphics, first, last);
        graphics.lineStyle(48 * pathScale, 0xf7e7b0, 1);
        this.strokeWindowing(graphics, first, last);
        graphics.lineStyle(36 * pathScale, 0xfff3c4, 0.55);
        this.strokeWindowing(graphics, first, last);

        // Soft centre highlight dots for the worn-path look.
        graphics.lineStyle(4 * pathScale, 0xffffff, 0.55);
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
        const arrowScale = MAP_PATH_SCALE;
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

            const tip = transform(8 * arrowScale, 0);
            const upper = transform(-8 * arrowScale, -10 * arrowScale);
            const lower = transform(-8 * arrowScale, 10 * arrowScale);
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
     * exactly - drag/wheel scrolling afterwards stays clamped. Used for
     * the opening scroll - no animation.
     */
    private centerLevelInstantly(index: number): void {
        const entry = this.entries[index];
        if (!entry) {
            return;
        }

        this.killScrollTween();
        this.scrollY = levelMapCenterScroll(index, this.entries.length, VIEW_TOP, VIEW_BOTTOM);
        this.mapLayer.setY(this.scrollY);
        this.syncVisibleMap();
    }

    private trySelect(index: number): void {
        if (this.locked || this.dragMoved || this.infoPanel || this.starterPopup || this.levelPopup?.isOpen) {
            return;
        }

        const state = resolveLevelProgressState(index, this.progress);
        if (state === 'locked') {
            return;
        }

        this.selectedLevel = index;
        this.placeMarker();
        this.refreshHud();
        this.openLevelPopup(index);
    }

    /**
     * Opens the level-start popup for `index`. It is a singleton: asking for
     * another popup while one is already open is a no-op, so taps can never
     * stack duplicate overlays.
     */
    private openLevelPopup(index: number): void {
        if (this.locked || this.infoPanel || this.starterPopup || this.levelPopup?.isOpen) {
            return;
        }

        if (resolveLevelProgressState(index, this.progress) === 'locked') {
            return;
        }

        this.selectedLevel = index;
        this.placeMarker();
        this.refreshHud();
        this.hideDailyPopup();

        if (!this.levelPopup) {
            this.levelPopup = new LevelPopup(this);
        }

        this.levelPopup.show({
            levelNumber: index + 1,
            onPlay: () => this.openLevelInstantly(index),
        });
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
        if (this.locked || this.infoPanel || this.starterPopup || this.levelPopup?.isOpen) {
            return;
        }

        if (this.selectedState() === 'locked') {
            return;
        }

        this.openLevelPopup(this.selectedLevel);
    }

    private selectedState(): LevelProgressState {
        return resolveLevelProgressState(this.selectedLevel, this.progress);
    }

    private refreshHud(): void {
        this.progress = loadProgress();
        this.syncStarterLock();

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
        if (this.locked || this.infoPanel || this.starterPopup || this.levelPopup?.isOpen) {
            return;
        }
        if (claimCollectedReward()) {
            gameAudio.playSfx('coin');
            this.refreshHud();
        }
    }

    /** Starter Pack offer popup (reference-image design, no animation). */
    private showStarterPackPopup(): void {
        if (this.starterPopup || !isStarterUnlocked(this.progress)) {
            return;
        }
        acquireModalInputLock('starter-pack');
        const width = worldWidth();
        const height = worldHeight();
        const geometry = starterPopupGeometry(width, height);
        const s = geometry.scale;
        const cx = width / 2;
        const cy = height / 2 - 24 * s;
        const popW = geometry.width;
        const popH = geometry.height;
        const top = cy - popH / 2;
        const starterState = getStarterPackState();
        this.starterLocalizedPrices = new Map();
        this.starterActiveOffer = starterState.offer;
        this.starterCycleIndex = starterState.cycleIndex;
        this.starterBuyDisabled = starterState.purchased;
        this.starterPurchasing = false;

        const popup = this.add.container(0, 0).setDepth(70);
        popup.setName('starter-pack-popup');
        const dim = this.add.rectangle(width / 2, height / 2, width, height, 0x0f0a2e, 0.78).setInteractive();
        const card = this.add.graphics();
        // Card shadow + deep-navy frame + body + royal header.
        card.fillStyle(0x020617, 0.55);
        card.fillRoundedRect(cx - popW / 2, top + 10 * s, popW, popH, 26 * s);
        card.fillStyle(0x1e1b4b, 1);
        card.fillRoundedRect(cx - popW / 2 - 6 * s, top - 6 * s, popW + 12 * s, popH + 12 * s, 30 * s);
        card.lineStyle(4 * s, 0xd4af37, 1);
        card.strokeRoundedRect(cx - popW / 2 - 6 * s, top - 6 * s, popW + 12 * s, popH + 12 * s, 30 * s);
        card.fillStyle(0xffffff, 1);
        card.fillRoundedRect(cx - popW / 2, top, popW, popH, 26 * s);
        // Header ribbon: slightly wider than the card, poking above it.
        card.fillGradientStyle(0x4c1d95, 0x4c1d95, 0x1e1b4b, 0x1e1b4b, 1);
        card.fillRoundedRect(cx - popW / 2 - 8 * s, top - 6 * s, popW + 16 * s, 66 * s, 18 * s);
        card.lineStyle(2 * s, 0xd4af37, 0.95);
        card.strokeRoundedRect(cx - popW / 2 - 8 * s, top - 6 * s, popW + 16 * s, 66 * s, 18 * s);
        card.fillStyle(0xd4af37, 1);
        card.fillRect(cx - popW / 2 - 8 * s, top + 52 * s, popW + 16 * s, 4 * s);
        card.fillGradientStyle(0xffffff, 0xffffff, 0xf3e8ff, 0xf3e8ff, 1);
        card.fillRoundedRect(cx - popW / 2, top + 34 * s, popW, popH - 34 * s, 26 * s);
        card.lineStyle(3 * s, 0xd4af37, 1);
        card.strokeRoundedRect(cx - popW / 2, top + 28 * s, popW, popH - 28 * s, 26 * s);
        // Gilt corner diamonds (ornament) inside the card frame.
        const corners: [number, number][] = [
            [cx - popW / 2 + 16 * s, top + 16 * s], [cx + popW / 2 - 16 * s, top + 16 * s],
            [cx - popW / 2 + 16 * s, top + popH - 16 * s - 28 * s], [cx + popW / 2 - 16 * s, top + popH - 16 * s - 28 * s],
        ];
        card.fillStyle(0xd4af37, 0.9);
        corners.forEach(([ox, oy]) => {
            card.fillTriangle(ox, oy - 7 * s, ox + 7 * s, oy, ox, oy + 7 * s);
            card.fillTriangle(ox, oy - 7 * s, ox - 7 * s, oy, ox, oy + 7 * s);
        });

        // Internal content keeps the full design size; when the card is
        // height-clamped (short landscape screens) it scrolls inside a mask.
        const header = 64 * s;
        const bottomArea = 192 * s;
        const artworkH = Math.max(110 * s, geometry.designHeight - header - bottomArea);
        const artworkY = top + header;
        const rays = this.add.graphics();
        // Golden Treasure base: deep navy -> royal purple (static).
        rays.fillGradientStyle(0x1e1b4b, 0x1e1b4b, 0x3b1270, 0x3b1270, 1);
        rays.fillRect(cx - popW / 2 + 8 * s, artworkY + 4 * s, popW - 16 * s, artworkH - 6 * s);
        // Darker outer corners, brighter centre (vignette).
        rays.fillStyle(0x0b0620, 0.42);
        rays.fillEllipse(cx - popW / 2 + 16 * s, artworkY + 8 * s, 130 * s, 90 * s);
        rays.fillEllipse(cx + popW / 2 - 16 * s, artworkY + 8 * s, 130 * s, 90 * s);
        rays.fillEllipse(cx - popW / 2 + 16 * s, artworkY + artworkH - 2 * s, 130 * s, 90 * s);
        rays.fillEllipse(cx + popW / 2 - 16 * s, artworkY + artworkH - 2 * s, 130 * s, 90 * s);
        // Static sunburst rays behind the coins only (never over reward text).
        const rayCx = cx;
        const rayCy = artworkY + artworkH / 2;
        for (let i = 0; i < 12; i += 1) {
            const a0 = (i / 12) * Math.PI * 2;
            const a1 = ((i + 1) / 12) * Math.PI * 2;
            rays.fillStyle(i % 2 === 0 ? 0xffffff : 0xffe38a, 0.2);
            rays.fillTriangle(
                rayCx, rayCy,
                rayCx + Math.cos(a0) * (popW / 2 + 20 * s), rayCy + Math.sin(a0) * (popW / 2 + 20 * s),
                rayCx + Math.cos(a1) * (popW / 2 + 20 * s), rayCy + Math.sin(a1) * (popW / 2 + 20 * s),
            );
        }
        // Soft golden radial glow layered behind the coin pile.
        rays.fillStyle(0xd4af37, 0.22);
        rays.fillCircle(rayCx, rayCy, 96 * s);
        rays.fillStyle(0xffe38a, 0.22);
        rays.fillCircle(rayCx, rayCy, 62 * s);
        rays.fillStyle(0xffffff, 0.3);
        rays.fillCircle(rayCx, rayCy, 34 * s);
        // Gilt inner frame + corner ornaments for the artwork.
        rays.lineStyle(2 * s, 0xd4af37, 0.85);
        rays.strokeRect(cx - popW / 2 + 12 * s, artworkY + 8 * s, popW - 24 * s, artworkH - 14 * s);
        rays.fillStyle(0xd4af37, 0.95);
        [[cx - popW / 2 + 12 * s, artworkY + 8 * s], [cx + popW / 2 - 12 * s, artworkY + 8 * s], [cx - popW / 2 + 12 * s, artworkY + artworkH - 6 * s], [cx + popW / 2 - 12 * s, artworkY + artworkH - 6 * s]].forEach(([ox, oy]) => {
            rays.fillTriangle(ox, oy - 8 * s, ox + 8 * s, oy, ox, oy + 8 * s);
            rays.fillTriangle(ox, oy - 8 * s, ox - 8 * s, oy, ox, oy + 8 * s);
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
        const coinS = Math.min(1, Math.max(0.45, (artworkH - 52 * s) / (92 * s)));
        const py = artworkY + artworkH - 38 * s;
        drawCoin(cx - 66 * s, py, 20 * s);
        drawCoin(cx - 30 * s, py + 5 * s, 21 * s);
        drawCoin(cx + 8 * s, py + 6 * s, 21 * s);
        drawCoin(cx + 45 * s, py + 5 * s, 20 * s);
        drawCoin(cx + 75 * s, py - 2 * s, 19 * s);
        drawCoin(cx - 47 * s, py - 28 * s * coinS, 20 * s);
        drawCoin(cx - 8 * s, py - 27 * s * coinS, 21 * s);
        drawCoin(cx + 30 * s, py - 28 * s * coinS, 20 * s);
        drawCoin(cx - 23 * s, py - 56 * s * coinS, 20 * s);
        drawCoin(cx + 11 * s, py - 57 * s * coinS, 20 * s);
        drawCoin(cx - 5 * s, py - 84 * s * coinS, 19 * s);
        drawCoin(cx + 26 * s, py - 64 * s * coinS, 18 * s);
        // Floating coins around the pile (slightly outside the card edge).
        drawCoin(cx - popW / 2 - 6 * s, artworkY + 20 * s, 21 * s);
        drawCoin(cx + popW / 2 + 4 * s, artworkY + 16 * s, 20 * s);
        drawCoin(cx - popW / 2 + 20 * s, artworkY + artworkH - 30 * s, 18 * s);
        drawCoin(cx + popW / 2 - 20 * s, artworkY + artworkH - 26 * s, 19 * s);
        // Sparkles + tiny floating light particles (static deco).
        coins.fillStyle(0xfff6c9, 0.95);
        coins.fillTriangle(cx - 96 * s, artworkY + 58 * s, cx - 90 * s, artworkY + 58 * s, cx - 93 * s, artworkY + 50 * s);
        coins.fillTriangle(cx + 94 * s, artworkY + 70 * s, cx + 100 * s, artworkY + 70 * s, cx + 97 * s, artworkY + 62 * s);
        coins.fillStyle(0xffe38a, 0.9);
        coins.fillTriangle(cx - 40 * s, artworkY + 22 * s, cx - 35 * s, artworkY + 22 * s, cx - 37 * s, artworkY + 15 * s);
        coins.fillTriangle(cx + 52 * s, artworkY + 30 * s, cx + 57 * s, artworkY + 30 * s, cx + 54 * s, artworkY + 23 * s);
        coins.fillStyle(0xffe38a, 0.6);
        coins.fillCircle(cx - 70 * s, artworkY + 34 * s, 2 * s);
        coins.fillCircle(cx + 38 * s, artworkY + 52 * s, 2 * s);
        coins.fillCircle(cx - 18 * s, artworkY + 18 * s, 2 * s);
        coins.fillCircle(cx + 76 * s, artworkY + 96 * s, 2 * s);
        coins.fillCircle(cx - 82 * s, artworkY + 104 * s, 2 * s);
        coins.fillStyle(0xfff6c9, 0.5);
        coins.fillCircle(cx + 18 * s, artworkY + 84 * s, 1.5 * s);
        coins.fillCircle(cx - 54 * s, artworkY + 76 * s, 1.5 * s);

        const title = this.add.text(cx, top + 27 * s, STARTER_PACK_TITLE, {
            fontFamily: FONT_DISPLAY, fontSize: `${Math.round(23 * s)}px`, color: '#ffe38a', stroke: '#1e1b4b', strokeThickness: 4 * s,
        }).setOrigin(0.5);
        const bodyTop = artworkY + artworkH;
        const limited = this.add.text(cx, bodyTop + 18 * s, 'LIMITED OFFER!', {
            fontFamily: FONT_DISPLAY, fontSize: `${Math.round(14 * s)}px`, color: '#33415c',
        }).setOrigin(0.5);
        const offer = this.add.text(cx, bodyTop + 42 * s, `GET ${starterState.offer.coins.toLocaleString('en-US')} COINS`, {
            fontFamily: FONT_DISPLAY, fontSize: `${Math.round(26 * s)}px`, color: '#33415c',
        }).setOrigin(0.5);
        const price = this.add.text(cx, bodyTop + 64 * s, `ONLY FOR ${this.starterPriceLabel(starterState.offer)}`, {
            fontFamily: FONT_DISPLAY, fontSize: `${Math.round(13 * s)}px`, color: '#5b6b8c',
        }).setOrigin(0.5);
        this.starterOfferText = offer;
        this.starterPriceText = price;

        // 70% OFF badge on the left edge at the artwork/body seam.
        const badge = this.add.graphics();
        badge.fillStyle(0x020617, 0.35);
        badge.fillCircle(cx - popW / 2 + 2 * s, bodyTop + 4 * s, 32 * s);
        badge.fillStyle(0xa855f7, 1);
        badge.fillCircle(cx - popW / 2, bodyTop, 32 * s);
        badge.lineStyle(2 * s, 0xffffff, 0.95);
        badge.strokeCircle(cx - popW / 2, bodyTop, 32 * s);
        const badgePct = this.add.text(cx - popW / 2, bodyTop - 9 * s, `${starterState.offer.discountPercent}%`, {
            fontFamily: FONT_DISPLAY, fontSize: `${Math.round(16 * s)}px`, color: '#ffffff',
        }).setOrigin(0.5).setAngle(-25);
        const badgeOff = this.add.text(cx - popW / 2, bodyTop + 9 * s, 'OFF', {
            fontFamily: FONT_DISPLAY, fontSize: `${Math.round(14 * s)}px`, color: '#ffffff',
        }).setOrigin(0.5).setAngle(-25);
        this.starterDiscountText = badgePct;

        const buyS = s;
        const buyW = Math.round(200 * buyS);
        const buyH = Math.round(48 * buyS);
        const buyY = bodyTop + 104 * s;
        const buyBg = this.add.graphics();
        const drawBuy = (): void => {
            buyBg.clear();
            buyBg.fillStyle(0x020617, 0.35);
            buyBg.fillRoundedRect(cx - buyW / 2, buyY - buyH / 2 + 3 * buyS, buyW, buyH, 12 * buyS);
            if (this.starterBuyDisabled) {
                buyBg.fillStyle(0x94a3b8, 1);
            } else {
                buyBg.fillGradientStyle(0x4ade80, 0x4ade80, 0x16a34a, 0x16a34a, 1);
            }
            buyBg.fillRoundedRect(cx - buyW / 2, buyY - buyH / 2, buyW, buyH, 12 * buyS);
            buyBg.fillStyle(0xffffff, 0.22);
            buyBg.fillRoundedRect(cx - buyW / 2 + 10 * buyS, buyY - buyH / 2 + 5 * buyS, buyW - 20 * buyS, 12 * buyS, 6 * buyS);
            buyBg.lineStyle(2, 0xffffff, 0.95);
            buyBg.strokeRoundedRect(cx - buyW / 2, buyY - buyH / 2, buyW, buyH, 12 * buyS);
        };
        drawBuy();
        this.starterBuyRedraw = drawBuy;
        const buyText = this.add.text(cx, buyY, this.starterBuyDisabled ? 'PURCHASED' : 'BUY NOW!', {
            fontFamily: FONT_DISPLAY, fontSize: `${Math.round(19 * buyS)}px`, color: '#ffffff', stroke: '#14532d', strokeThickness: 2,
        }).setOrigin(0.5);
        this.starterBuyText = buyText;
        const buyHit = this.add.rectangle(cx, buyY, buyW, buyH, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
        buyHit.on('pointerdown', (_pointer: Phaser.Input.Pointer, _lx: number, _ly: number, event: Phaser.Types.Input.EventData) => {
            event.stopPropagation();
            if (this.starterScroll?.moved) {
                return;
            }
            // A masked-out button must not stay clickable while scrolled away.
            const visibleY = buyY + contentLayer.y;
            if (visibleY - buyH / 2 < top || visibleY + buyH / 2 > top + popH) {
                return;
            }
            void this.buyStarterPack();
        });

        const status = this.add.text(cx, buyY + 36 * s, this.starterBuyDisabled ? 'Already claimed. New offer after reset.' : '', {
            fontFamily: FONT, fontSize: `${Math.round(11 * s)}px`, color: '#b45309', align: 'center', wordWrap: { width: popW - 40 * s },
        }).setOrigin(0.5);
        status.setName('starter-status');
        this.starterStatusText = status;

        const pillW = 220 * s;
        const pillY = top + popH + 26 * s;
        const pill = this.add.graphics();
        pill.fillStyle(0x020617, 0.35);
        pill.fillRoundedRect(cx - pillW / 2, pillY - 17 * s + 3 * s, pillW, 36 * s, 18 * s);
        pill.fillGradientStyle(0xbfe3fb, 0xbfe3fb, 0x7cc3f5, 0x7cc3f5, 1);
        pill.fillRoundedRect(cx - pillW / 2, pillY - 17 * s, pillW, 36 * s, 18 * s);
        pill.lineStyle(2 * s, 0xffffff, 0.9);
        pill.strokeRoundedRect(cx - pillW / 2, pillY - 17 * s, pillW, 36 * s, 18 * s);
        pill.fillStyle(0x168bff, 1);
        pill.fillCircle(cx - 78 * s, pillY, 13 * s);
        pill.lineStyle(2 * s, 0xffffff, 0.95);
        pill.strokeCircle(cx - 78 * s, pillY, 13 * s);
        pill.lineStyle(2 * s, 0xffffff, 1);
        pill.beginPath();
        pill.moveTo(cx - 78 * s, pillY);
        pill.lineTo(cx - 78 * s, pillY - 7 * s);
        pill.moveTo(cx - 78 * s, pillY);
        pill.lineTo(cx - 73 * s, pillY + 2 * s);
        pill.strokePath();
        const timeLabel = this.add.text(cx - 74 * s, pillY, 'RESET IN:', {
            fontFamily: FONT_DISPLAY, fontSize: `${Math.round(12 * s)}px`, color: '#1e3a5f',
        }).setOrigin(0, 0.5);
        timeLabel.setName('starter-reset-label');
        const timeText = this.add.text(cx + 24 * s, pillY, formatOfferCountdown(starterState.remainingMs), {
            fontFamily: FONT_DISPLAY, fontSize: `${Math.round(15 * s)}px`, color: '#1e3a5f',
        }).setOrigin(0, 0.5);
        timeText.setName('starter-countdown');
        this.starterTimeText = timeText;

        // Close (X) button at the top-right corner.
        const closeS = s;
        const closeR = Math.round(17 * closeS);
        const closeX = cx + popW / 2 - 4 * s;
        const closeY = top + 2 * s;
        const closeBg = this.add.graphics();
        closeBg.fillStyle(0x020617, 0.25);
        closeBg.fillCircle(closeX + 1 * closeS, closeY + 2 * closeS, closeR);
        closeBg.fillStyle(0xffffff, 1);
        closeBg.fillCircle(closeX, closeY, closeR);
        closeBg.lineStyle(2, 0x168bff, 0.9);
        closeBg.strokeCircle(closeX, closeY, closeR);
        const closeIcon = this.add.graphics();
        closeIcon.lineStyle(Math.max(2, 3 * closeS), 0x168bff, 1);
        const closeArm = 6 * closeS;
        closeIcon.beginPath();
        closeIcon.moveTo(closeX - closeArm, closeY - closeArm);
        closeIcon.lineTo(closeX + closeArm, closeY + closeArm);
        closeIcon.moveTo(closeX + closeArm, closeY - closeArm);
        closeIcon.lineTo(closeX - closeArm, closeY + closeArm);
        closeIcon.strokePath();
        const closeHit = this.add.circle(closeX, closeY, Math.round(18 * closeS), 0xffffff, 0.001).setInteractive({ useHandCursor: true });
        closeHit.on('pointerdown', (pointer: Phaser.Input.Pointer, _lx: number, _ly: number, event: Phaser.Types.Input.EventData) => {
            event.stopPropagation();
            suppressPointerRelease(pointer.id);
            if (this.starterScroll?.moved) {
                return;
            }
            this.hideStarterPackPopup();
        });

        // Swallow clicks inside the card + ribbon + pill so they never reach the map.
        const blocker = this.add.rectangle(cx, cy + 15 * s, popW + 24 * s, popH + 72 * s, 0xffffff, 0.001).setInteractive();
        blocker.on('pointerdown', (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
            event.stopPropagation();
        });
        dim.on('pointerdown', (pointer: Phaser.Input.Pointer, _lx: number, _ly: number, event: Phaser.Types.Input.EventData) => {
            event.stopPropagation();
            suppressPointerRelease(pointer.id);
            this.hideStarterPackPopup();
        });

        // The card content is built at the full 80%-larger design size. When
        // the card has to be shortened (short landscape screens) it is masked
        // to the visible card area and scrolls vertically inside it.
        const contentLayer = this.add.container(0, 0);
        contentLayer.add([rays, coins, title, limited, offer, price, badge, badgePct, badgeOff, buyBg, buyText, status, buyHit]);
        popup.add([dim, blocker, card, contentLayer, pill, timeLabel, timeText, closeBg, closeIcon, closeHit]);

        if (geometry.scrollable) {
            const mask = this.make.graphics({ x: 0, y: 0 }, false);
            mask.fillStyle(0xffffff, 1);
            mask.fillRoundedRect(cx - popW / 2, top, popW, popH, 26 * s);
            contentLayer.setMask(mask.createGeometryMask());
            const inCard = (pointer: Phaser.Input.Pointer): boolean =>
                pointer.x >= cx - popW / 2 && pointer.x <= cx + popW / 2 &&
                pointer.y >= top && pointer.y <= top + popH;
            const scroll = {
                layer: contentLayer,
                mask,
                min: -(geometry.designHeight - popH),
                y: 0,
                dragging: false,
                moved: false,
                startY: 0,
                startScroll: 0,
                down: (pointer: Phaser.Input.Pointer): void => {
                    if (!this.starterPopup || !inCard(pointer)) {
                        return;
                    }
                    scroll.dragging = true;
                    scroll.moved = false;
                    scroll.startY = pointer.y;
                    scroll.startScroll = scroll.y;
                },
                move: (pointer: Phaser.Input.Pointer): void => {
                    if (!scroll.dragging) {
                        return;
                    }
                    const delta = pointer.y - scroll.startY;
                    if (Math.abs(delta) > 6) {
                        scroll.moved = true;
                    }
                    scroll.y = Math.max(scroll.min, Math.min(0, scroll.startScroll + delta));
                    scroll.layer.y = scroll.y;
                },
                up: (): void => {
                    scroll.dragging = false;
                },
                wheel: (pointer: Phaser.Input.Pointer, _over: Phaser.GameObjects.GameObject[], _dx: number, deltaY: number): void => {
                    if (!this.starterPopup || !inCard(pointer)) {
                        return;
                    }
                    scroll.y = Math.max(scroll.min, Math.min(0, scroll.y - deltaY * 0.5));
                    scroll.layer.y = scroll.y;
                },
            };
            this.input.on('pointerdown', scroll.down);
            this.input.on('pointermove', scroll.move);
            this.input.on('pointerup', scroll.up);
            this.input.on('pointerupoutside', scroll.up);
            this.input.on('wheel', scroll.wheel);
            this.starterScroll = scroll;
        }
        this.starterPopup = popup;
        this.starterBuyDisabled = starterState.purchased;
        if (this.starterBuyDisabled) {
            drawBuy();
            buyText.setText('PURCHASED');
            status.setText('Already claimed. New offer after reset.');
        }
        void this.refreshStarterPrices();
        gameAudio.playSfx('popupOpen');
    }

    private hideStarterPackPopup(): void {
        if (this.starterPopup) {
            gameAudio.playSfx('popupClose');
        }
        const scroll = this.starterScroll;
        if (scroll) {
            this.input.off('pointerdown', scroll.down);
            this.input.off('pointermove', scroll.move);
            this.input.off('pointerup', scroll.up);
            this.input.off('pointerupoutside', scroll.up);
            this.input.off('wheel', scroll.wheel);
            scroll.mask.destroy();
            this.starterScroll = null;
        }
        this.starterTimeText = null;
        this.starterBuyText = null;
        this.starterBuyRedraw = null;
        this.starterStatusText = null;
        this.starterOfferText = null;
        this.starterPriceText = null;
        this.starterDiscountText = null;
        this.starterLocalizedPrices = new Map();
        this.starterActiveOffer = null;
        this.starterCycleIndex = -1;
        this.starterBuyDisabled = false;
        this.starterPurchasing = false;
        releaseModalInputLock('starter-pack');
        this.starterPopup?.destroy(true);
        this.starterPopup = null;
    }

    private tickStarterPack(): void {
        const state = getStarterPackState();
        this.starterTimeText?.setText(formatOfferCountdown(state.remainingMs));
        if (this.starterPopup && state.cycleIndex !== this.starterCycleIndex && !this.starterPurchasing) {
            this.applyStarterPackState(state);
        }
    }

    private applyStarterPackState(state: StarterPackState): void {
        this.starterActiveOffer = state.offer;
        this.starterCycleIndex = state.cycleIndex;
        this.starterBuyDisabled = state.purchased;
        this.starterOfferText?.setText(`GET ${state.offer.coins.toLocaleString('en-US')} COINS`);
        this.starterPriceText?.setText(`ONLY FOR ${this.starterPriceLabel(state.offer)}`);
        this.starterDiscountText?.setText(`${state.offer.discountPercent}%`);
        this.starterBuyRedraw?.();
        this.starterBuyText?.setText(state.purchased ? 'PURCHASED' : 'BUY NOW!');
        this.starterStatusText?.setText(state.purchased ? 'Already claimed. New offer after reset.' : '');
    }

    private starterPriceLabel(offer: StarterPackOffer): string {
        return this.starterLocalizedPrices.get(offer.sku)?.displayPrice ?? starterPackProduct(offer).usdPrice;
    }

    private async refreshStarterPrices(): Promise<void> {
        const prices = await queryLocalizedPrices();
        if (!this.starterPopup || this.starterPurchasing || prices.size === 0) {
            return;
        }
        this.starterLocalizedPrices = prices;
        this.applyStarterPackState(getStarterPackState());
    }

    private setStarterStatus(message: string): void {
        this.starterStatusText?.setText(message);
    }

    private async buyStarterPack(): Promise<void> {
        const state = getStarterPackState();
        if (!this.starterPopup || !isStarterUnlocked(this.progress) || state.purchased || this.starterBuyDisabled || this.starterPurchasing) {
            return;
        }
        if (!this.starterActiveOffer || state.cycleIndex !== this.starterCycleIndex || state.offer.id !== this.starterActiveOffer.id) {
            this.applyStarterPackState(state);
            return;
        }

        const product: RealMoneyProduct = starterPackProduct(this.starterActiveOffer);
        const expectedCycle = this.starterCycleIndex;
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
        if (outcome.status === 'pending') {
            this.setStarterStatus(outcome.reason ?? 'Payment is pending. No rewards were granted.');
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
        if (!markStarterPackPurchased(expectedCycle)) {
            this.applyStarterPackState(getStarterPackState());
            this.setStarterStatus('Offer changed before the purchase completed. No reward was granted.');
            this.starterPurchasing = false;
            return;
        }

        markTransactionProcessed(outcome.transactionId, product.id);
        void finalizePurchase(outcome.transactionId, outcome.receipt);
        addCoins(product.coins);
        const rewards = [`+${product.coins} Coins`];
        for (const [power, amount] of Object.entries(product.grants) as Array<[keyof typeof product.grants, number]>) {
            if (amount > 0) {
                grantPowerUp(power, amount);
                rewards.push(`+${amount} ${power}`);
            }
        }
        gameAudio.playSfx('purchase');
        this.progress = loadProgress();
        this.refreshHud();
        this.starterBuyDisabled = true;
        this.starterBuyRedraw?.();
        this.starterBuyText?.setText('PURCHASED');
        this.setStarterStatus(`Purchase successful! ${rewards.join(' · ')}. Balance: ${this.progress.coins.toLocaleString('en-US')} Coins.`);
        this.starterPurchasing = false;
    }

    private toggleInfo(): void {
        if (this.infoPanel) {
            gameAudio.playSfx('popupClose');
            this.removeInfoScroll();
            this.infoPanel.destroy(true);
            this.infoPanel = null;
            return;
        }

        acquireModalInputLock('how-to-play');
        const width = worldWidth();
        const height = worldHeight();
        const layout = howToPlayLayout(width, height);
        const s = layout.scale;
        const left = layout.panelX - layout.panelW / 2;
        const top = layout.panelY;

        const panel = this.add.container(0, 0).setDepth(60).setName('how-to-play-popup');
        const dim = this.add
            .rectangle(width / 2, height / 2, width, height, 0x020617, 0.72)
            .setInteractive();
        dim.on('pointerdown', (pointer: Phaser.Input.Pointer, _lx: number, _ly: number, event: Phaser.Types.Input.EventData) => {
            event.stopPropagation();
            suppressPointerRelease(pointer.id);
            this.toggleInfo();
        });

        const card = this.add.graphics();
        card.fillStyle(0x1e1b4b, 0.97);
        card.fillRoundedRect(left, top, layout.panelW, layout.panelH, 22);
        card.lineStyle(2, 0xa855f7, 0.95);
        card.strokeRoundedRect(left, top, layout.panelW, layout.panelH, 22);
        card.fillStyle(0xfde68a, 0.9);
        card.fillRoundedRect(
            left + 18 * s,
            top + (HOW_TO_TITLE_HEIGHT - 8) * s,
            layout.panelW - 36 * s,
            2,
            1
        );

        const title = this.add
            .text(layout.panelX, top + 30 * s, HOW_TO_TITLE, {
                fontFamily: FONT_DISPLAY,
                fontSize: `${Math.round(22 * s)}px`,
                color: '#fde68a',
            })
            .setOrigin(0.5);

        const content = this.add.container(0, 0);
        let y = layout.contentTop;
        const textX = left + 54 * s;
        const wrapW = layout.panelW - 84 * s;

        HOW_TO_SECTIONS.forEach((section) => {
            const icon = this.add.graphics();
            this.drawHowToIcon(icon, section.icon, left + 28 * s, y + 8 * s, s);
            content.add(icon);
            const heading = this.add
                .text(textX, y, `${section.number} ${section.title}`, {
                    fontFamily: FONT_DISPLAY,
                    fontSize: `${Math.round(15 * s)}px`,
                    color: '#fde68a',
                })
                .setOrigin(0, 0);
            content.add(heading);
            y += (15 + 10) * s;

            section.lines.forEach((line) => {
                const body = this.add
                    .text(textX, y, line, {
                        fontFamily: FONT,
                        fontSize: `${Math.round(12.5 * s)}px`,
                        color: '#e9d5ff',
                        wordWrap: { width: wrapW },
                        lineSpacing: 3 * s,
                    })
                    .setOrigin(0, 0);
                content.add(body);
                y += body.height + 4 * s;
            });
            y += HOW_TO_SECTION_GAP * s;
        });

        const closing = this.add
            .text(layout.panelX, y + 8 * s, HOW_TO_CLOSING, {
                fontFamily: FONT_DISPLAY,
                fontSize: `${Math.round(14 * s)}px`,
                color: '#86efac',
                align: 'center',
                wordWrap: { width: layout.panelW - 48 * s },
            })
            .setOrigin(0.5, 0);
        content.add(closing);
        const contentBottom = y + closing.height + 10 * s;

        const closeY = top + layout.panelH - (HOW_TO_FOOTER_HEIGHT / 2) * s;
        const close = this.add
            .text(layout.panelX, closeY, 'CLOSE', {
                fontFamily: FONT_DISPLAY,
                fontSize: `${Math.round(16 * s)}px`,
                color: '#86efac',
            })
            .setOrigin(0.5);
        const closeHit = this.add
            .rectangle(
                layout.panelX,
                closeY,
                Math.round(140 * s),
                Math.round(44 * s),
                0xffffff,
                0.001
            )
            .setInteractive({ useHandCursor: true });
        closeHit.on(
            'pointerdown',
            (
                pointer: Phaser.Input.Pointer,
                _lx: number,
                _ly: number,
                event: Phaser.Types.Input.EventData
            ) => {
                event.stopPropagation();
                suppressPointerRelease(pointer.id);
                this.toggleInfo();
            }
        );

        panel.add([dim, card, title, content, close, closeHit]);
        this.infoPanel = panel;
        gameAudio.playSfx('popupOpen');
        addPressFx(this, closeHit, close, { hoverScale: 1.06, pressScale: 0.94 });

        const innerHeight = contentBottom - layout.contentTop;
        if (innerHeight > layout.contentH) {
            const mask = this.make.graphics({ x: 0, y: 0 }, false);
            mask.fillStyle(0xffffff, 1);
            mask.fillRoundedRect(
                left + 8,
                layout.contentTop - 6,
                layout.panelW - 16,
                layout.contentH + 12,
                8
            );
            content.setMask(mask.createGeometryMask());
            const inContent = (pointer: Phaser.Input.Pointer): boolean =>
                pointer.x >= left && pointer.x <= left + layout.panelW &&
                pointer.y >= layout.contentTop && pointer.y <= layout.contentTop + layout.contentH;
            const scroll = {
                layer: content,
                mask,
                min: -(innerHeight - layout.contentH),
                y: 0,
                dragging: false,
                startY: 0,
                startScroll: 0,
                top: layout.contentTop,
                bottom: layout.contentTop + layout.contentH,
                down: (pointer: Phaser.Input.Pointer): void => {
                    if (!this.infoPanel || !inContent(pointer)) return;
                    scroll.dragging = true;
                    scroll.startY = pointer.y;
                    scroll.startScroll = scroll.y;
                },
                move: (pointer: Phaser.Input.Pointer): void => {
                    if (!scroll.dragging) return;
                    scroll.y = Math.max(scroll.min, Math.min(0, scroll.startScroll + (pointer.y - scroll.startY)));
                    scroll.layer.y = scroll.y;
                },
                up: (): void => {
                    scroll.dragging = false;
                },
                wheel: (pointer: Phaser.Input.Pointer, _over: Phaser.GameObjects.GameObject[], _dx: number, deltaY: number): void => {
                    if (!this.infoPanel || !inContent(pointer)) return;
                    scroll.y = Math.max(scroll.min, Math.min(0, scroll.y - deltaY * 0.5));
                    scroll.layer.y = scroll.y;
                },
            };
            this.input.on('pointerdown', scroll.down);
            this.input.on('pointermove', scroll.move);
            this.input.on('pointerup', scroll.up);
            this.input.on('pointerupoutside', scroll.up);
            this.input.on('wheel', scroll.wheel);
            this.infoScroll = scroll;
        }
    }

    private removeInfoScroll(): void {
        releaseModalInputLock('how-to-play');
        const scroll = this.infoScroll;
        if (!scroll) {
            return;
        }
        this.input.off('pointerdown', scroll.down);
        this.input.off('pointermove', scroll.move);
        this.input.off('pointerup', scroll.up);
        this.input.off('pointerupoutside', scroll.up);
        this.input.off('wheel', scroll.wheel);
        if (scroll.mask.active) {
            scroll.mask.destroy();
        }
        this.infoScroll = null;
    }

    private drawHowToIcon(
        graphics: Phaser.GameObjects.Graphics,
        kind: HowToIcon,
        x: number,
        y: number,
        s: number
    ): void {
        if (kind === 'target') {
            graphics.lineStyle(2 * s, 0xfde68a, 1);
            graphics.strokeCircle(x, y, 9 * s);
            graphics.fillStyle(0xffc928, 1);
            graphics.fillCircle(x, y, 4 * s);
        } else if (kind === 'shoot') {
            graphics.fillStyle(0x4fc8f5, 1);
            graphics.fillTriangle(x - 6 * s, y - 8 * s, x - 6 * s, y + 8 * s, x + 9 * s, y);
        } else if (kind === 'star') {
            graphics.fillStyle(0xffc928, 1);
            graphics.fillCircle(x, y, 9 * s);
            graphics.fillStyle(0xfff1a8, 1);
            graphics.fillTriangle(x, y - 7 * s, x - 3 * s, y - 1 * s, x + 3 * s, y - 1 * s);
        } else if (kind === 'power') {
            graphics.fillStyle(0xff8d1f, 1);
            graphics.fillTriangle(x - 7 * s, y + 6 * s, x + 7 * s, y + 6 * s, x, y - 9 * s);
            graphics.fillStyle(0xffe38a, 1);
            graphics.fillCircle(x, y + 3 * s, 3 * s);
        } else if (kind === 'coins') {
            graphics.fillStyle(0xffc928, 1);
            graphics.fillEllipse(x - 4 * s, y + 3 * s, 12 * s, 8 * s);
            graphics.fillEllipse(x + 4 * s, y - 3 * s, 12 * s, 8 * s);
        } else {
            graphics.fillStyle(0xa855f7, 1);
            graphics.fillRect(x - 6 * s, y - 8 * s, 3 * s, 16 * s);
            graphics.fillTriangle(x - 3 * s, y - 8 * s, x + 9 * s, y - 2 * s, x - 3 * s, y + 4 * s);
        }
    }
}


