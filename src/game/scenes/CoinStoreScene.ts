import { Scene } from 'phaser';
import { FONT, FONT_DISPLAY, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { loadProgress, addCoins, canClaimDailyCoins, claimDailyCoins, addPendingBonusShots, DAILY_FREE_COINS } from '../utils/storage';
import { grantPowerUp, loadPowerUpInventory } from '../powerups/inventory';
import type { PowerUpInventory } from '../powerups/inventory';
import { gameAudio, installUiAudio } from '../audio/GameAudio';
import { fadeInScene, goToScene } from './transitions';
import { addPressFx } from '../../ui/uiFx';
import { attachRelayout, worldHeight, worldWidth } from '../layout';
import { STORE_PRODUCTS, rollMysteryReward, type StoreCategory, type StoreProduct, type StoreReward } from '../store/catalog';
import { REAL_MONEY_PRODUCTS, type RealMoneyProduct } from '../store/realMoneyCatalog';
import { queryLocalizedPrices, requestPurchase, verifyTransaction, hasProcessedTransaction, markTransactionProcessed } from '../payments/payments';
import { showRewardedAd } from '../../ads/rewardedAds';

export interface CoinStoreSceneData {
    returnTo?: string;
    level?: number;
    category?: CategoryFilter;
}

type CategoryFilter = 'all' | StoreCategory | 'real';

const DRAG_THRESHOLD = 10;
const GRID_TOP_WIDE = 160;
const GRID_TOP_MOBILE = 310;
/** Coins granted only after a rewarded ad confirms the reward. */
const REWARDED_AD_COINS = 5;
/** Top edge of the single scrollable content area (below the fixed header). */
const SCROLL_TOP = 76;

export class CoinStoreScene extends Scene {
    private locked = false;
    private purchasing = false;
    private returnTo = 'MenuScene';
    private returnLevel = 0;
    private coinsText!: Phaser.GameObjects.Text;
    private sidebarBalanceText!: Phaser.GameObjects.Text;
    private earnedText!: Phaser.GameObjects.Text;
    private spentText!: Phaser.GameObjects.Text;
    private dailyButtonText!: Phaser.GameObjects.Text;
    private inventoryText!: Phaser.GameObjects.Text;
    private coinIcon!: Phaser.GameObjects.Arc;
    private popup: Phaser.GameObjects.Container | null = null;
    private scrollContainer: Phaser.GameObjects.Container | null = null;
    private gridContainer: Phaser.GameObjects.Container | null = null;
    private gridMaskShape: Phaser.GameObjects.Graphics | null = null;
    private scrollY = 0;
    private dragging = false;
    private dragMoved = false;
    private dragStartY = 0;
    private dragStartScroll = 0;
    private category: CategoryFilter = 'all';
    private dropdownPanel: Phaser.GameObjects.Container | null = null;
    private realPriceTexts = new Map<string, Phaser.GameObjects.Text>();
    private watchButtonText: Phaser.GameObjects.Text | null = null;
    private watchHit: Phaser.GameObjects.Rectangle | null = null;

    constructor() {
        super('CoinStoreScene');
    }

    init(data: CoinStoreSceneData = {}): void {
        this.returnTo = data.returnTo ?? 'MenuScene';
        this.returnLevel = Number.isFinite(data.level) ? (data.level ?? 0) : 0;
        if (data.category) {
            this.category = data.category;
        }
    }

    create(): void {
        this.locked = false;
        this.purchasing = false;
        this.popup = null;
        this.dropdownPanel = null;
        this.scrollY = 0;
        installUiAudio(this);
        this.createBackground();
        // Single scrollable parent at depth 5: filter dropdown, sidebar,
        // category content and every product card move together as one page.
        // The Back and Coin header buttons stay outside it at depth 40.
        this.scrollContainer = this.add.container(0, 0).setDepth(5);
        this.createHeader();
        this.createSidebar();
        this.createCategoryDropdown();
        this.buildGrid();
        this.bindScrollInput();
        fadeInScene(this, 240, [5, 57, 91]);
        attachRelayout(this, () => {
            this.scene.restart({ returnTo: this.returnTo, level: this.returnLevel, category: this.category });
        });
        this.events.once('shutdown', () => {
            this.popup = null;
            this.dropdownPanel = null;
            this.scrollContainer = null;
            this.gridMaskShape?.destroy();
            this.gridMaskShape = null;
        });
    }

    private get isWide(): boolean {
        return worldWidth() >= 800;
    }

    /** Device CSS width (falls back to world width in tests/headless). */
    private get deviceWidth(): number {
        const width = typeof window !== 'undefined' ? window.innerWidth : 0;
        return Number.isFinite(width) && width > 0 ? width : worldWidth();
    }

    /** Responsive columns: 1 phone, 2 tablet/small desktop, 3 standard, 4 large. */
    private get storeColumns(): number {
        const width = this.deviceWidth;
        if (width < 560) return 1;
        if (width < 900) return 2;
        if (width < 1300) return 3;
        return 4;
    }

    private get cardHeight(): number {
        const cols = this.storeColumns;
        return cols === 1 ? 180 : cols === 2 ? 200 : 210;
    }

    private get gridOrigin(): { x: number; y: number; w: number; h: number } {
        const width = worldWidth();
        const height = worldHeight();
        if (this.isWide) {
            const x = 290;
            const y = GRID_TOP_WIDE;
            return { x, y, w: width - x - 20, h: height - y - 16 };
        }

        const y = GRID_TOP_MOBILE;
        return { x: 16, y, w: width - 32, h: height - y - 16 };
    }

    private createBackground(): void {
        const backgroundKey = this.returnTo === 'LevelSelectionScene' ? 'bg-level-map' : 'bg-menu';
        if (this.textures.exists(backgroundKey)) {
            const bg = this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, backgroundKey).setDepth(-30);
            bg.setScale(Math.max(GAME_WIDTH / bg.width, GAME_HEIGHT / bg.height));
        }
    }

    private createHeader(): void {
        const width = worldWidth();
        const back = this.add.container(74, 52).setDepth(40);
        const backBg = this.add.graphics();
        backBg.fillStyle(0x020617, 0.45);
        backBg.fillRoundedRect(-58, -21, 116, 42, 21);
        backBg.fillStyle(0x0a3d91, 1);
        backBg.fillRoundedRect(-58, -24, 116, 42, 21);
        backBg.fillGradientStyle(0x4fc8f5, 0x4fc8f5, 0x168bff, 0x168bff, 1);
        backBg.fillRoundedRect(-54, -20, 108, 34, 17);
        backBg.fillStyle(0xffffff, 0.22);
        backBg.fillRoundedRect(-46, -18, 92, 12, 6);
        backBg.lineStyle(2, 0xffffff, 0.9);
        backBg.strokeRoundedRect(-58, -24, 116, 42, 21);
        const backText = this.add
            .text(0, -3, '‹ BACK', { fontFamily: FONT_DISPLAY, fontSize: '15px', color: '#ffffff', stroke: '#0a3d91', strokeThickness: 3 })
            .setOrigin(0.5);
        const backHit = this.add.circle(0, 0, 30, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
        backHit.on('pointerdown', () => this.goBack());
        addPressFx(this, backHit, back, { hoverScale: 1.04, pressScale: 0.95 });
        back.add([backBg, backText, backHit]);

        this.add
            .text(width / 2, 52, 'COIN STORE', {
                fontFamily: FONT_DISPLAY,
                fontSize: '28px',
                color: '#ffffff',
                stroke: '#0a3d91',
                strokeThickness: 5,
            })
            .setOrigin(0.5)
            .setDepth(40);

        const coinX = width - 147;
        const coinBg = this.add.graphics().setDepth(40);
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
        this.add.circle(width - 122, 48, 14, 0xffc928, 1).setStrokeStyle(3, 0xfff1a8, 1).setDepth(41);
        this.add
            .text(width - 122, 48, '$', { fontFamily: FONT_DISPLAY, fontSize: '11px', color: '#78350f', stroke: '#fff0a6', strokeThickness: 1 })
            .setOrigin(0.5)
            .setDepth(41);
        this.coinsText = this.add
            .text(width - 82, 48, loadProgress().coins.toLocaleString('en-US'), {
                fontFamily: FONT_DISPLAY,
                fontSize: '15px',
                color: '#ffffff',
                stroke: '#0a3d91',
                strokeThickness: 3,
            })
            .setOrigin(0.5)
            .setDepth(41);
        this.coinsText.setName('coin-balance');
    }

    private createSidebar(): void {
        const width = worldWidth();
        const height = worldHeight();
        const panel = this.add.container(0, 0).setDepth(40);
        const g = this.add.graphics();

        if (this.isWide) {
            const x = 16;
            const y = 160;
            const w = 250;
            const h = height - y - 16;
            g.fillStyle(0x020617, 0.5);
            g.fillRoundedRect(x, y + 8, w, h, 24);
            g.fillGradientStyle(0x3b1270, 0x3b1270, 0x1e1b4b, 0x1e1b4b, 1);
            g.fillRoundedRect(x, y, w, h, 24);
            g.fillStyle(0xffffff, 0.12);
            g.fillRoundedRect(x + 14, y + 10, w - 28, 36, 16);
            g.lineStyle(2, 0xa855f7, 0.9);
            g.strokeRoundedRect(x, y, w, h, 24);
            panel.add(g);

            this.coinIcon = this.add.circle(x + w / 2, y + 80, 30, 0xffc928, 1).setStrokeStyle(4, 0xfff1a8, 1);
            this.add.text(x + w / 2, y + 80, '$', { fontFamily: FONT_DISPLAY, fontSize: '26px', color: '#78350f' }).setOrigin(0.5);
            this.tweens.add({ targets: this.coinIcon, scaleX: 1.15, scaleY: 1.15, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
            panel.add(this.coinIcon);
            const balance = this.add
                .text(x + w / 2, y + 130, `${loadProgress().coins.toLocaleString('en-US')} Coins`, { fontFamily: FONT_DISPLAY, fontSize: '24px', color: '#ffffff', stroke: '#1e1b4b', strokeThickness: 4 })
                .setOrigin(0.5)
                .setName('coin-balance');
            // Sidebar balance mirrors the header balance; keep both updated.
            this.sidebarBalanceText = balance;
            this.earnedText = this.add.text(x + w / 2, y + 170, '', { fontFamily: FONT, fontSize: '14px', color: '#e9d5ff', align: 'center' }).setOrigin(0.5);
            this.spentText = this.add.text(x + w / 2, y + 195, '', { fontFamily: FONT, fontSize: '14px', color: '#e9d5ff', align: 'center' }).setOrigin(0.5);
            this.inventoryText = this.add.text(x + w / 2, y + 240, '', { fontFamily: FONT, fontSize: '13px', color: '#ffffff', align: 'center', lineSpacing: 5 }).setOrigin(0.5);
            panel.add([balance, this.earnedText, this.spentText, this.inventoryText]);

            const dailyBg = this.add.graphics();
            const claim = canClaimDailyCoins();
            dailyBg.fillStyle(0x020617, 0.4);
            dailyBg.fillRoundedRect(x + 20, y + 290, w - 40, 48, 14);
            dailyBg.fillGradientStyle(claim ? 0xffe38a : 0x64748b, claim ? 0xffe38a : 0x64748b, claim ? 0xffb300 : 0x475569, claim ? 0xffb300 : 0x475569, 1);
            dailyBg.fillRoundedRect(x + 20, y + 286, w - 40, 48, 14);
            dailyBg.lineStyle(2, 0xffffff, 0.9);
            dailyBg.strokeRoundedRect(x + 20, y + 286, w - 40, 48, 14);
            this.dailyButtonText = this.add.text(x + w / 2, y + 310, claim ? `DAILY +${DAILY_FREE_COINS}` : 'COME BACK TOMORROW', { fontFamily: FONT_DISPLAY, fontSize: '14px', color: '#ffffff', stroke: '#7c2d12', strokeThickness: 3 }).setOrigin(0.5);
            const dailyHit = this.add.rectangle(x + w / 2, y + 310, w - 40, 48, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
            dailyHit.on('pointerdown', () => this.claimDaily());
            panel.add([dailyBg, this.dailyButtonText, dailyHit]);

            const backBg = this.add.graphics();
            backBg.fillStyle(0x168bff, 1);
            backBg.fillRoundedRect(x + 20, y + 350, w - 40, 48, 14);
            backBg.lineStyle(2, 0xffffff, 0.9);
            backBg.strokeRoundedRect(x + 20, y + 350, w - 40, 48, 14);
            const backLabel = this.add.text(x + w / 2, y + 374, 'BACK TO GAME', { fontFamily: FONT_DISPLAY, fontSize: '15px', color: '#ffffff' }).setOrigin(0.5);
            const backHit = this.add.rectangle(x + w / 2, y + 374, w - 40, 48, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
            backHit.on('pointerdown', () => this.goBack());
            panel.add([backBg, backLabel, backHit]);
        } else {
            // Compact top banner on portrait: balance, totals, daily.
            const x = 16;
            const y = 120;
            const w = width - 32;
            const h = 160;
            g.fillStyle(0x020617, 0.5);
            g.fillRoundedRect(x, y + 8, w, h, 22);
            g.fillGradientStyle(0x3b1270, 0x3b1270, 0x1e1b4b, 0x1e1b4b, 1);
            g.fillRoundedRect(x, y, w, h, 22);
            g.fillStyle(0xffffff, 0.12);
            g.fillRoundedRect(x + 14, y + 10, w - 28, 32, 14);
            g.lineStyle(2, 0xa855f7, 0.9);
            g.strokeRoundedRect(x, y, w, h, 22);
            panel.add(g);

            this.coinIcon = this.add.circle(x + 44, y + 44, 24, 0xffc928, 1).setStrokeStyle(3, 0xfff1a8, 1);
            this.add.text(x + 44, y + 44, '$', { fontFamily: FONT_DISPLAY, fontSize: '20px', color: '#78350f' }).setOrigin(0.5);
            this.tweens.add({ targets: this.coinIcon, scaleX: 1.12, scaleY: 1.12, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
            panel.add(this.coinIcon);
            const balance = this.add
                .text(x + 78, y + 44, `${loadProgress().coins.toLocaleString('en-US')} Coins`, { fontFamily: FONT_DISPLAY, fontSize: '20px', color: '#ffffff', stroke: '#1e1b4b', strokeThickness: 4 })
                .setOrigin(0, 0.5)
                .setName('coin-balance');
            this.sidebarBalanceText = balance;
            this.earnedText = this.add.text(x + 78, y + 78, '', { fontFamily: FONT, fontSize: '12px', color: '#e9d5ff' }).setOrigin(0, 0.5);
            this.spentText = this.add.text(x + 78, y + 100, '', { fontFamily: FONT, fontSize: '12px', color: '#e9d5ff' }).setOrigin(0, 0.5);
            panel.add([balance, this.earnedText, this.spentText]);

            this.inventoryText = this.add.text(width / 2, y + 128, '', { fontFamily: FONT, fontSize: '12px', color: '#ffffff', align: 'center' }).setOrigin(0.5);
            panel.add(this.inventoryText);

            const claim = canClaimDailyCoins();
            this.dailyButtonText = this.add.text(x + w - 10, y + 44, claim ? `DAILY +${DAILY_FREE_COINS}` : 'TOMORROW', { fontFamily: FONT_DISPLAY, fontSize: '12px', color: '#fff8e1', backgroundColor: claim ? '#f59e0b' : '#64748b', padding: { x: 10, y: 7 } }).setOrigin(1, 0.5);
            const dailyHit = this.add.rectangle(x + w / 2, y + 44, w - 20, 48, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
            dailyHit.setData('daily', true);
            dailyHit.on('pointerdown', () => this.claimDaily());
            panel.add([this.dailyButtonText, dailyHit]);
        }

        this.scrollContainer?.add(panel);
        this.refreshBalances();
    }

    /**
     * Single category dropdown replacing the former horizontal tabs.
     * Same glossy blue pill styling (dark-blue shadow, blue gradient,
     * highlight, white border, rounded corners) so it matches the cards
     * and header; responsive width keeps it centred and inside the screen.
     */
    private createCategoryDropdown(): void {
        const width = worldWidth();
        const y = this.isWide ? 118 : 92;
        const dropdownW = Math.min(280, Math.max(220, width - 180));
        const labelW = 124;
        const totalW = labelW + 12 + dropdownW;
        const startX = width / 2 - totalW / 2;
        const dropdownX = startX + labelW + 12 + dropdownW / 2;
        const options: readonly { id: CategoryFilter; label: string }[] = [
            { id: 'all', label: 'All Products' },
            { id: 'real', label: 'Real Money Bundles' },
            { id: 'bomb', label: 'Bomb' },
            { id: 'fire', label: 'Fire' },
            { id: 'color', label: 'Bubble Colors' },
            { id: 'bundle', label: 'Mixed Bundles' },
            { id: 'special', label: 'Special Items' },
        ];
        const selectedLabel = options.find((option) => option.id === this.category)?.label ?? 'All Products';

        // The filter label + dropdown pill live in one container inside the
        // shared scroll container, so they scroll with the content. The
        // button itself is completely static — no bob, hover or press
        // animation. The Back Button and Coin Button stay outside this
        // group and never move.
        const group = this.add.container(0, 0).setDepth(40);
        this.scrollContainer?.add(group);

        const label = this.add
            .text(startX + labelW / 2, y, 'Filter by Category', {
                fontFamily: FONT_DISPLAY,
                fontSize: '12px',
                color: '#ffffff',
                stroke: '#0a3d91',
                strokeThickness: 3,
                align: 'center',
                wordWrap: { width: labelW },
            })
            .setOrigin(0.5)
            .setDepth(0);
        label.setName('filter-label');

        const button = this.add.container(dropdownX, y).setDepth(0);
        const g = this.add.graphics();
        g.fillStyle(0x020617, 0.45);
        g.fillRoundedRect(-dropdownW / 2, -17, dropdownW, 44, 14);
        g.fillStyle(0x0a3d91, 1);
        g.fillRoundedRect(-dropdownW / 2, -20, dropdownW, 44, 14);
        g.fillGradientStyle(0x4fc8f5, 0x4fc8f5, 0x168bff, 0x168bff, 1);
        g.fillRoundedRect(-dropdownW / 2 + 4, -16, dropdownW - 8, 36, 10);
        g.fillStyle(0xffffff, 0.22);
        g.fillRoundedRect(-dropdownW / 2 + 12, -14, dropdownW - 24, 12, 6);
        g.lineStyle(2, 0xffffff, 0.9);
        g.strokeRoundedRect(-dropdownW / 2, -20, dropdownW, 44, 14);
        const selectedText = this.add
            .text(-dropdownW / 2 + 16, -1, selectedLabel, { fontFamily: FONT_DISPLAY, fontSize: '13px', color: '#ffffff', stroke: '#0a3d91', strokeThickness: 2 })
            .setOrigin(0, 0.5)
            .setName('dropdown-selected');
        const arrow = this.add.graphics();
        arrow.fillStyle(0xffffff, 1);
        arrow.fillTriangle(dropdownW / 2 - 30, -6, dropdownW / 2 - 16, -6, dropdownW / 2 - 23, 4);
        arrow.setName('dropdown-arrow');
        const hit = this.add.rectangle(0, 0, dropdownW, 44, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
        hit.setData('dropdown', true);
        hit.setName('category-dropdown');
        hit.on('pointerdown', () => this.toggleCategoryDropdown(dropdownX, y, dropdownW, options));
        button.add([g, selectedText, arrow, hit]);
        group.add([label, button]);
    }

    private toggleCategoryDropdown(
        x: number,
        y: number,
        width: number,
        options: readonly { id: CategoryFilter; label: string }[]
    ): void {
        if (this.dropdownPanel) {
            this.closeCategoryDropdown();
            return;
        }

        const panel = this.add.container(0, 0).setDepth(60);
        const dim = this.add
            .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x020617, 0.45)
            .setInteractive();
        dim.on('pointerdown', () => this.closeCategoryDropdown());
        panel.add(dim);

        const optionH = 38;
        const panelH = options.length * optionH + 12;
        const panelY = y + this.scrollY + 30;
        const bg = this.add.graphics();
        bg.fillStyle(0x020617, 0.55);
        bg.fillRoundedRect(x - width / 2, panelY - 14, width, panelH, 16);
        bg.fillStyle(0x0a3d91, 0.98);
        bg.fillRoundedRect(x - width / 2, panelY - 18, width, panelH, 16);
        bg.fillGradientStyle(0x1e1b4b, 0x1e1b4b, 0x3b1270, 0x3b1270, 1);
        bg.fillRoundedRect(x - width / 2 + 4, panelY - 14, width - 8, panelH - 8, 12);
        bg.lineStyle(2, 0xa855f7, 0.95);
        bg.strokeRoundedRect(x - width / 2, panelY - 18, width, panelH, 16);
        panel.add(bg);

        options.forEach((option, index) => {
            const optionY = panelY + index * optionH + optionH / 2;
            const isSelected = option.id === this.category;
            if (isSelected) {
                const highlight = this.add.graphics();
                highlight.fillStyle(0xffc928, 1);
                highlight.fillRoundedRect(x - width / 2 + 6, optionY - optionH / 2 + 3, width - 12, optionH - 6, 10);
                panel.add(highlight);
            }
            const text = this.add
                .text(x - width / 2 + 18, optionY, `${isSelected ? '✓ ' : ''}${option.label}`, {
                    fontFamily: FONT_DISPLAY,
                    fontSize: '13px',
                    color: isSelected ? '#3b1270' : '#ffffff',
                })
                .setOrigin(0, 0.5)
                .setName(`dropdown-option-${option.id}`);
            const hit = this.add.rectangle(x, optionY, width, optionH, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
            hit.on('pointerdown', () => {
                this.closeCategoryDropdown();
                if (this.category !== option.id) {
                    this.category = option.id;
                    this.scene.restart({ returnTo: this.returnTo, level: this.returnLevel, category: option.id });
                }
            });
            panel.add([text, hit]);
        });

        this.dropdownPanel = panel;
    }

    private closeCategoryDropdown(): void {
        this.dropdownPanel?.destroy(true);
        this.dropdownPanel = null;
    }

    private buildGrid(): void {
        const origin = this.gridOrigin;
        this.gridContainer?.destroy(true);
        this.gridMaskShape?.destroy();
        this.gridContainer = this.add.container(origin.x, origin.y).setDepth(5);
        this.scrollContainer?.add(this.gridContainer);
        // Mask-only shape: created outside the display list so it never
        // renders. A display-list Graphics here painted a solid white
        // rectangle behind the store content in WebGL.
        this.gridMaskShape = this.make.graphics({ x: origin.x, y: origin.y }, false);
        this.gridMaskShape.fillStyle(0xffffff, 1);
        this.gridMaskShape.fillRect(0, 0, origin.w, origin.h);
        this.gridContainer.setMask(this.gridMaskShape.createGeometryMask());

        this.realPriceTexts.clear();
        this.watchButtonText = null;
        this.watchHit = null;
        const realProducts = this.category === 'all' || this.category === 'real' ? REAL_MONEY_PRODUCTS : [];
        const coinProducts = this.category === 'real' ? [] : STORE_PRODUCTS.filter((p) => this.category === 'all' || p.category === this.category);
        const cols = this.storeColumns;
        const gap = 16;
        const cardW = Math.floor((origin.w - gap * (cols - 1)) / cols);
        const cardH = this.cardHeight;
        const rewardedH = 84;
        const topOffset = this.category === 'all' ? rewardedH + gap : 0;
        const total = realProducts.length + coinProducts.length;

        if (this.category === 'all') {
            this.gridContainer?.add(this.createRewardedAdCard(origin.w / 2, rewardedH / 2, origin.w, rewardedH));
        }

        realProducts.forEach((pkg, index) => {
            const col = index % cols;
            const row = Math.floor(index / cols);
            const x = col * (cardW + gap) + cardW / 2;
            const y = topOffset + row * (cardH + gap) + cardH / 2;
            this.gridContainer?.add(this.createRealMoneyCard(x, y, cardW, cardH, pkg));
        });

        coinProducts.forEach((pkg, index) => {
            const flatIndex = realProducts.length + index;
            const col = flatIndex % cols;
            const row = Math.floor(flatIndex / cols);
            const x = col * (cardW + gap) + cardW / 2;
            const y = topOffset + row * (cardH + gap) + cardH / 2;
            this.gridContainer?.add(this.createCard(x, y, cardW, cardH, pkg));
        });

        void total;
        this.scrollY = 0;
        this.applyScroll(0);
        void this.refreshRealMoneyPrices();
    }

    private async refreshRealMoneyPrices(): Promise<void> {
        const prices = await queryLocalizedPrices();
        prices.forEach((price, sku) => {
            const product = REAL_MONEY_PRODUCTS.find((p) => p.sku === sku);
            if (product) {
                this.realPriceTexts.get(product.id)?.setText(price.displayPrice);
            }
        });
    }

    private createRewardedAdCard(x: number, y: number, width: number, height: number): Phaser.GameObjects.Container {
        const card = this.add.container(x, y);
        card.setName('rewarded-ad-card');
        const g = this.add.graphics();
        g.fillStyle(0x020617, 0.5);
        g.fillRoundedRect(-width / 2, -height / 2 + 7, width, height, 20);
        g.fillGradientStyle(0x47b9c8, 0x47b9c8, 0x157a9b, 0x157a9b, 1);
        g.fillRoundedRect(-width / 2, -height / 2, width, height, 20);
        g.fillStyle(0xffffff, 0.16);
        g.fillRoundedRect(-width / 2 + 12, -height / 2 + 8, width - 24, 30, 12);
        g.lineStyle(3, 0xe8faff, 0.95);
        g.strokeRoundedRect(-width / 2, -height / 2, width, height, 20);
        const dividerX = -width / 2 + Math.floor(width * 0.55) + 10;
        g.lineStyle(2, 0xffffff, 0.35);
        g.lineBetween(dividerX, -height / 2 + 16, dividerX, height / 2 - 16);
        card.add(g);

        // LEFT: text only — reward amount above the Free Reward label.
        const leftCenter = -width / 2 + Math.floor(width * 0.55) / 2 + 8;
        const rewardText = this.add
            .text(leftCenter, -10, `${REWARDED_AD_COINS} Coins`, { fontFamily: FONT_DISPLAY, fontSize: '19px', color: '#ffffff', stroke: '#075a8a', strokeThickness: 4 })
            .setOrigin(0.5);
        rewardText.setName('rewarded-coins');
        const freeLabel = this.add
            .text(leftCenter, 14, 'Free Reward', { fontFamily: FONT, fontSize: '12px', color: '#e0fbff', stroke: '#075a8a', strokeThickness: 2 })
            .setOrigin(0.5);
        freeLabel.setName('rewarded-label');
        card.add([rewardText, freeLabel]);

        // RIGHT: one clean Watch Ad button, vertically centred.
        const rightCenter = dividerX + 6 + (width - Math.floor(width * 0.55) - 28) / 2;
        const watchW = Math.min(150, Math.max(120, width - Math.floor(width * 0.55) - 44));
        const watchBg = this.add.graphics();
        const drawWatch = (hover: boolean): void => {
            watchBg.clear();
            watchBg.fillStyle(0x020617, 0.45);
            watchBg.fillRoundedRect(rightCenter - watchW / 2, -17 + 4, watchW, 34, 17);
            watchBg.fillGradientStyle(hover ? 0xff6b5d : 0xf1543f, hover ? 0xff6b5d : 0xf1543f, hover ? 0xd92f4d : 0xc23b4b, hover ? 0xd92f4d : 0xc23b4b, 1);
            watchBg.fillRoundedRect(rightCenter - watchW / 2, -17, watchW, 34, 17);
            watchBg.fillStyle(0xffffff, 0.3);
            watchBg.fillRoundedRect(rightCenter - watchW / 2 + 10, -14, watchW - 20, 11, 5);
            watchBg.lineStyle(2, 0xffffff, 0.95);
            watchBg.strokeRoundedRect(rightCenter - watchW / 2, -17, watchW, 34, 17);
        };
        drawWatch(false);
        this.watchButtonText = this.add
            .text(rightCenter, 0, 'Watch Ad', { fontFamily: FONT_DISPLAY, fontSize: '14px', color: '#ffffff', stroke: '#7f1d1d', strokeThickness: 2 })
            .setOrigin(0.5);
        this.watchButtonText.setName('watch-ad-button');
        this.watchHit = this.add.rectangle(rightCenter, 0, watchW, 34, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
        this.watchHit.setData('watchAd', true);
        this.watchHit.on('pointerover', () => drawWatch(true));
        this.watchHit.on('pointerout', () => drawWatch(false));
        this.watchHit.on('pointerup', () => {
            if (!this.dragMoved) {
                void this.watchRewardedAd();
            }
        });
        addPressFx(this, this.watchHit, this.watchButtonText, { hoverScale: 1.04, pressScale: 0.96 });
        card.add([watchBg, this.watchButtonText, this.watchHit]);
        return card;
    }

    private async watchRewardedAd(): Promise<void> {
        if (this.locked || this.purchasing || this.popup || this.dropdownPanel) {
            return;
        }

        this.purchasing = true;
        this.watchHit?.disableInteractive();
        this.watchButtonText?.setText('LOADING…');
        const outcome = await showRewardedAd();
        if (outcome === 'granted') {
            addCoins(REWARDED_AD_COINS);
            gameAudio.playSfx('click');
            this.refreshBalances();
            this.showPopup('Reward Earned!', `+${REWARDED_AD_COINS} Coins Added!`, true);
        } else if (outcome === 'unavailable') {
            this.showPopup('Ad Unavailable', 'No rewarded ad is available right now. Please try again later.', false);
        } else {
            this.showPopup('Ad Not Completed', 'Watch the full ad to earn your reward. No coins were added.', false);
        }
        // purchasing stays true while the result popup is open; its close
        // handler resets it, so rapid taps cannot claim the same impression twice.
        if (!this.popup) {
            this.purchasing = false;
        }
        this.watchHit?.setInteractive({ useHandCursor: true });
        this.watchButtonText?.setText('Watch Ad');
    }

    private createRealMoneyCard(x: number, y: number, width: number, height: number, pkg: RealMoneyProduct): Phaser.GameObjects.Container {
        const card = this.add.container(x, y);
        const g = this.add.graphics();
        const tierColors: Record<string, [number, number]> = {
            'real-starter': [0xffd54d, 0xf59e0b],
            'real-basic': [0xffe38a, 0xffc928],
            'real-bronze': [0xcd7f32, 0x8c4a12],
            'real-silver': [0xe5e7eb, 0x9ca3af],
            'real-gold': [0xffe38a, 0xffb300],
            'real-platinum': [0xe8faff, 0x7dd3fc],
            'real-diamond': [0xa5f3fc, 0x38bdf8],
            'real-master': [0xc4b5fd, 0x7c3aed],
            'real-ultimate': [0xf0abfc, 0xa21caf],
            'real-legendary': [0xfde68a, 0xd97706],
        };
        const [top, bottom] = tierColors[pkg.id] ?? [0xffe38a, 0xffb300];
        g.fillStyle(0x020617, 0.5);
        g.fillRoundedRect(-width / 2, -height / 2 + 7, width, height, 20);
        g.fillGradientStyle(top, top, bottom, bottom, 1);
        g.fillRoundedRect(-width / 2, -height / 2, width, height, 20);
        g.fillStyle(0xffffff, 0.3);
        g.fillRoundedRect(-width / 2 + 12, -height / 2 + 8, width - 24, 30, 12);
        g.lineStyle(3, 0xffffff, 0.95);
        g.strokeRoundedRect(-width / 2, -height / 2, width, height, 20);
        // Clear visual separation between the reward (left) and purchase
        // (right) sections.
        const rightW = Math.max(80, Math.floor(width * 0.36));
        const sectionW = width - 28 - rightW;
        const dividerX = -width / 2 + 16 + sectionW + 6;
        const leftCenter = -width / 2 + 16 + sectionW / 2;
        const rightCenter = dividerX + 6 + rightW / 2;
        g.lineStyle(2, 0xffffff, 0.35);
        g.lineBetween(dividerX, -height / 2 + 18, dividerX, height / 2 - 18);
        card.add(g);

        if (pkg.badge) {
            const badgeColor = pkg.badge === 'BEST VALUE' ? 0x38d94a : pkg.badge === 'POPULAR' ? 0xff454f : 0x168bff;
            const badge = this.add.graphics();
            badge.fillStyle(badgeColor, 1);
            badge.fillRoundedRect(-width / 2 + 10, -height / 2 + 8, 74, 20, 10);
            const badgeText = this.add.text(-width / 2 + 47, -height / 2 + 18, pkg.badge, { fontFamily: FONT_DISPLAY, fontSize: '8px', color: '#ffffff' }).setOrigin(0.5);
            card.add([badge, badgeText]);
        }

        // LEFT: coin amount, bonus rewards and offer details, grouped and
        // vertically centred in the left section.
        const coinIcon = this.add.circle(leftCenter, -44, 23, 0xffc928, 1).setStrokeStyle(4, 0xfff1a8, 1);
        const coinText = this.add.text(leftCenter, -44, '$', { fontFamily: FONT_DISPLAY, fontSize: '21px', color: '#78350f' }).setOrigin(0.5);
        this.tweens.add({ targets: coinIcon, scaleX: 1.1, scaleY: 1.1, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        card.add([coinIcon, coinText]);

        const title = this.add
            .text(leftCenter, -12, pkg.name, { fontFamily: FONT_DISPLAY, fontSize: '13px', color: '#ffffff', stroke: '#7c2d12', strokeThickness: 3, align: 'center', wordWrap: { width: sectionW - 16 } })
            .setOrigin(0.5);
        const totalCoins = this.add
            .text(leftCenter, 10, `${pkg.coins.toLocaleString('en-US')} Coins + Bonus`, { fontFamily: FONT_DISPLAY, fontSize: '12px', color: '#fff8e1', stroke: '#7c2d12', strokeThickness: 2, align: 'center', wordWrap: { width: sectionW - 16 } })
            .setOrigin(0.5);
        const bonus = this.add
            .text(leftCenter, 28, `+ ${pkg.grants.bomb || 0} Bombs  + ${pkg.grants.fireball || 0} Fire  + ${pkg.grants.colorChanger || 0} Color`, { fontFamily: FONT, fontSize: '10px', color: '#ffffff', stroke: '#7c2d12', strokeThickness: 2, align: 'center', wordWrap: { width: sectionW - 12 } })
            .setOrigin(0.5);
        card.add([title, totalCoins, bonus]);

        const icons: Phaser.GameObjects.GameObject[] = [];
        if (this.textures.exists('powerup-bomb')) {
            icons.push(this.add.image(leftCenter - 36, 58, 'powerup-bomb').setDisplaySize(26, 26));
        }
        if (this.textures.exists('icon-fire')) {
            icons.push(this.add.image(leftCenter, 58, 'icon-fire').setDisplaySize(26, 26));
        }
        if (this.textures.exists('powerup-color')) {
            icons.push(this.add.image(leftCenter + 36, 58, 'powerup-color').setDisplaySize(26, 26));
        }
        card.add(icons);

        // RIGHT: USD price at the top, Buy Now directly below — two
        // separate elements, vertically centred as a pair.
        const priceY = -34;
        const priceW = Math.min(112, width - sectionW - 40);
        const pricePill = this.add.graphics();
        pricePill.fillStyle(0x020617, 0.45);
        pricePill.fillRoundedRect(rightCenter - priceW / 2, priceY - 14, priceW, 26, 13);
        pricePill.fillGradientStyle(0xffe38a, 0xffe38a, 0xffb300, 0xffb300, 1);
        pricePill.fillRoundedRect(rightCenter - priceW / 2, priceY - 16, priceW, 26, 13);
        pricePill.lineStyle(2, 0xffffff, 0.95);
        pricePill.strokeRoundedRect(rightCenter - priceW / 2, priceY - 16, priceW, 26, 13);
        const priceText = this.add
            .text(rightCenter, priceY - 2, pkg.usdPrice, { fontFamily: FONT_DISPLAY, fontSize: '14px', color: '#ffffff', stroke: '#7c2d12', strokeThickness: 2 })
            .setOrigin(0.5);
        priceText.setName(`price-${pkg.id}`);
        this.realPriceTexts.set(pkg.id, priceText);
        card.add([pricePill, priceText]);

        const buyW = priceW;
        const buyX = rightCenter;
        const buyY = 34;
        const buyBg = this.add.graphics();
        const drawBuy = (hover: boolean): void => {
            buyBg.clear();
            buyBg.fillStyle(0x020617, 0.45);
            buyBg.fillRoundedRect(buyX - buyW / 2, buyY - 17 + 4, buyW, 34, 17);
            buyBg.fillGradientStyle(hover ? 0x6d28d9 : 0x5b21b6, hover ? 0x6d28d9 : 0x5b21b6, hover ? 0x4c1d95 : 0x3b1270, hover ? 0x4c1d95 : 0x3b1270, 1);
            buyBg.fillRoundedRect(buyX - buyW / 2, buyY - 17, buyW, 34, 17);
            buyBg.lineStyle(2, 0xffffff, 0.9);
            buyBg.strokeRoundedRect(buyX - buyW / 2, buyY - 17, buyW, 34, 17);
        };
        drawBuy(false);
        const buyText = this.add.text(buyX, buyY, 'BUY NOW', { fontFamily: FONT_DISPLAY, fontSize: buyW < 80 ? '11px' : '13px', color: '#ffffff', stroke: '#2e1065', strokeThickness: 3 }).setOrigin(0.5);
        buyText.setName(`buy-${pkg.id}`);
        const buyHit = this.add.rectangle(buyX, buyY, buyW, 34, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
        buyHit.setData('buyRealMoney', pkg.id);
        buyHit.on('pointerover', () => drawBuy(true));
        buyHit.on('pointerout', () => drawBuy(false));
        buyHit.on('pointerup', () => {
            if (!this.dragMoved) {
                void this.buyRealMoney(pkg.id);
            }
        });
        addPressFx(this, buyHit, buyText, { hoverScale: 1.04, pressScale: 0.96 });
        card.add([buyBg, buyText, buyHit]);
        return card;
    }

    private createCard(x: number, y: number, width: number, height: number, pkg: StoreProduct): Phaser.GameObjects.Container {
        const card = this.add.container(x, y);
        const g = this.add.graphics();
        g.fillStyle(0x020617, 0.5);
        g.fillRoundedRect(-width / 2, -height / 2 + 7, width, height, 20);
        g.fillGradientStyle(0x47b9c8, 0x47b9c8, 0x157a9b, 0x157a9b, 1);
        g.fillRoundedRect(-width / 2, -height / 2, width, height, 20);
        g.fillStyle(0xffffff, 0.16);
        g.fillRoundedRect(-width / 2 + 12, -height / 2 + 8, width - 24, 34, 14);
        g.lineStyle(3, 0xe8faff, 0.9);
        g.strokeRoundedRect(-width / 2, -height / 2, width, height, 20);
        const rightW = Math.max(80, Math.floor(width * 0.36));
        const sectionW = width - 28 - rightW;
        const dividerX = -width / 2 + 16 + sectionW + 6;
        const leftCenter = -width / 2 + 16 + sectionW / 2;
        const rightCenter = dividerX + 6 + rightW / 2;
        g.lineStyle(2, 0xffffff, 0.35);
        g.lineBetween(dividerX, -height / 2 + 18, dividerX, height / 2 - 18);
        card.add(g);

        if (pkg.badge) {
            const badgeColors: Record<string, number> = { POPULAR: 0xff454f, 'BEST VALUE': 0x38d94a, LIMITED: 0xf59e0b, SALE: 0xff454f, NEW: 0x168bff };
            const badgeColor = badgeColors[pkg.badge] ?? 0x168bff;
            const badge = this.add.graphics();
            badge.fillStyle(badgeColor, 1);
            badge.fillRoundedRect(-width / 2 + 10, -height / 2 + 8, 70, 20, 10);
            badge.lineStyle(1.5, 0xffffff, 0.9);
            badge.strokeRoundedRect(-width / 2 + 10, -height / 2 + 8, 70, 20, 10);
            const badgeText = this.add
                .text(-width / 2 + 45, -height / 2 + 18, pkg.badge, { fontFamily: FONT_DISPLAY, fontSize: '8px', color: '#ffffff' })
                .setOrigin(0.5);
            card.add([badge, badgeText]);
        }

        // LEFT: icons grouped with product name and reward details.
        this.createProductIcons(pkg, -34, width).forEach((object) => {
            const positioned = object as Phaser.GameObjects.Image | Phaser.GameObjects.Graphics;
            positioned.setX(leftCenter + positioned.x);
            card.add(positioned);
        });
        const title = this.add
            .text(leftCenter, 2, pkg.name, { fontFamily: FONT_DISPLAY, fontSize: '13px', color: '#ffffff', stroke: '#075a8a', strokeThickness: 3, align: 'center', wordWrap: { width: sectionW - 16 } })
            .setOrigin(0.5);
        const reward = this.add
            .text(leftCenter, 22, pkg.reward.description, { fontFamily: FONT, fontSize: '11px', color: '#e0fbff', align: 'center', wordWrap: { width: sectionW - 16 } })
            .setOrigin(0.5);
        card.add([title, reward]);

        // RIGHT: coin price at the top, Buy Now directly below (separate).
        const priceY = -34;
        const priceW = Math.min(112, width - sectionW - 40);
        const pricePill = this.add.graphics();
        pricePill.fillStyle(0x020617, 0.45);
        pricePill.fillRoundedRect(rightCenter - priceW / 2, priceY - 14, priceW, 26, 13);
        pricePill.fillGradientStyle(0xffe38a, 0xffe38a, 0xffb300, 0xffb300, 1);
        pricePill.fillRoundedRect(rightCenter - priceW / 2, priceY - 16, priceW, 26, 13);
        pricePill.lineStyle(2, 0xffffff, 0.95);
        pricePill.strokeRoundedRect(rightCenter - priceW / 2, priceY - 16, priceW, 26, 13);
        const coin = this.add.circle(rightCenter - priceW / 2 + 16, priceY - 2, 9, 0xffc928, 1).setStrokeStyle(2, 0xfff1a8, 1);
        const price = this.add
            .text(rightCenter + 8, priceY - 2, `${pkg.price} Coins`, { fontFamily: FONT_DISPLAY, fontSize: '12px', color: '#ffffff', stroke: '#7c2d12', strokeThickness: 2 })
            .setOrigin(0.5);
        price.setName(`price-${pkg.id}`);
        card.add([pricePill, coin, price]);

        const buyW = priceW;
        const buyX = rightCenter;
        const buyY = 34;
        const buyBg = this.add.graphics();
        const drawBuy = (hover: boolean): void => {
            buyBg.clear();
            buyBg.fillStyle(0x020617, 0.45);
            buyBg.fillRoundedRect(buyX - buyW / 2, buyY - 17 + 4, buyW, 34, 17);
            buyBg.fillGradientStyle(hover ? 0xffe38a : 0xffd54d, hover ? 0xffe38a : 0xffd54d, hover ? 0xffb300 : 0xf59e0b, hover ? 0xffb300 : 0xf59e0b, 1);
            buyBg.fillRoundedRect(buyX - buyW / 2, buyY - 17, buyW, 34, 17);
            buyBg.fillStyle(0xffffff, 0.35);
            buyBg.fillRoundedRect(buyX - buyW / 2 + 10, buyY - 14, buyW - 20, 10, 5);
            buyBg.lineStyle(2, 0xfff3b0, 0.95);
            buyBg.strokeRoundedRect(buyX - buyW / 2, buyY - 17, buyW, 34, 17);
        };
        drawBuy(false);
        const buyText = this.add.text(buyX, buyY, 'BUY NOW', { fontFamily: FONT_DISPLAY, fontSize: buyW < 80 ? '11px' : '13px', color: '#ffffff', stroke: '#7c2d12', strokeThickness: 3 }).setOrigin(0.5);
        buyText.setName(`buy-${pkg.id}`);
        const buyHit = this.add.rectangle(buyX, buyY, buyW, 34, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
        buyHit.setData('buyPackage', pkg.id);
        buyHit.on('pointerover', () => drawBuy(true));
        buyHit.on('pointerout', () => drawBuy(false));
        buyHit.on('pointerup', () => {
            if (!this.dragMoved) {
                this.buyPackage(pkg.id);
            }
        });
        addPressFx(this, buyHit, buyText, { hoverScale: 1.04, pressScale: 0.96 });
        card.add([buyBg, buyText, buyHit]);
        return card;
    }

    private createProductIcons(pkg: StoreProduct, y: number, width: number): Phaser.GameObjects.GameObject[] {
        const objects: Phaser.GameObjects.GameObject[] = [];
        const tex = (key: string, x: number, size = 40): void => {
            if (this.textures.exists(key)) {
                objects.push(this.add.image(x, y, key).setDisplaySize(size, size));
            }
        };
        if (pkg.icon === 'bomb') {
            tex('powerup-bomb', 0, 44);
        } else if (pkg.icon === 'fire') {
            tex('icon-fire', 0, 44);
        } else if (pkg.icon === 'color') {
            tex('powerup-color', 0, 44);
        } else if (pkg.icon === 'bundle') {
            tex('powerup-bomb', -32, 38);
            tex('icon-fire', 0, 38);
            tex('powerup-color', 32, 38);
        } else if (pkg.icon === 'mystery') {
            const g = this.add.graphics();
            g.fillStyle(0x27016d, 1);
            g.fillRoundedRect(-20, -16, 40, 32, 6);
            g.fillStyle(0xffc928, 1);
            g.fillRect(-3, -16, 6, 32);
            g.fillStyle(0xffffff, 1);
            g.fillCircle(0, 0, 5);
            objects.push(g);
        } else {
            const g = this.add.graphics();
            g.fillStyle(0x9eeaff, 1);
            g.fillCircle(0, 0, 16);
            g.lineStyle(2, 0xffffff, 0.95);
            g.strokeCircle(0, 0, 16);
            g.fillStyle(0xffffff, 0.8);
            g.fillCircle(-5, -5, 4);
            objects.push(g);
        }
        void width;
        return objects;
    }

    private bindScrollInput(): void {
        this.input.on('pointerdown', this.onScrollDown, this);
        this.input.on('pointermove', this.onScrollMove, this);
        this.input.on('pointerup', this.onScrollUp, this);
        this.input.on('pointerupoutside', this.onScrollUp, this);
        this.input.on('wheel', this.onScrollWheel, this);
    }

    private inGrid(pointer: Phaser.Input.Pointer): boolean {
        const width = worldWidth();
        return pointer.x >= 0 && pointer.x <= width && pointer.y >= SCROLL_TOP && pointer.y <= worldHeight();
    }

    private contentBottom(): number {
        const origin = this.gridOrigin;
        const gridBottom = origin.y + this.gridContentHeight(origin.w);
        const sidebarBottom = this.isWide ? worldHeight() - 16 : 280;
        return Math.max(gridBottom, sidebarBottom);
    }

    private onScrollDown(pointer: Phaser.Input.Pointer): void {
        if (this.locked || this.popup || this.dropdownPanel || !this.inGrid(pointer)) {
            return;
        }

        const hits = this.input.hitTestPointer(pointer);
        // Taps starting on the dropdown/sidebar/header must not begin a
        // grid drag; buy taps are allowed (they check dragMoved on up).
        if (hits.some((o) => o.getData('tab') || o.getData('dropdown') || o.getData('daily'))) {
            return;
        }

        this.dragging = true;
        this.dragMoved = false;
        this.dragStartY = pointer.y;
        this.dragStartScroll = this.scrollY;
    }

    private onScrollMove(pointer: Phaser.Input.Pointer): void {
        if (!this.dragging) {
            return;
        }

        const delta = pointer.y - this.dragStartY;
        if (Math.abs(delta) > DRAG_THRESHOLD) {
            this.dragMoved = true;
        }

        this.applyScroll(this.dragStartScroll + delta);
    }

    private onScrollUp(): void {
        this.dragging = false;
    }

    private onScrollWheel(pointer: Phaser.Input.Pointer, _over: Phaser.GameObjects.GameObject[], _dx: number, deltaY: number): void {
        if (this.locked || this.popup || this.dropdownPanel || !this.inGrid(pointer)) {
            return;
        }

        this.applyScroll(this.scrollY - deltaY * 0.55);
    }

    private applyScroll(next: number): void {
        const height = worldHeight() - SCROLL_TOP;
        const contentHeight = this.contentBottom() - SCROLL_TOP;
        const min = Math.min(0, height - contentHeight);
        this.scrollY = Math.max(min, Math.min(0, next));
        this.scrollContainer?.setY(this.scrollY);
    }

    private gridContentHeight(gridW: number): number {
        const realCount = this.category === 'all' || this.category === 'real' ? REAL_MONEY_PRODUCTS.length : 0;
        const coinProducts = this.category === 'real' ? [] : STORE_PRODUCTS.filter((p) => this.category === 'all' || p.category === this.category);
        const total = realCount + coinProducts.length;
        const cols = this.storeColumns;
        const gap = 16;
        const cardW = Math.floor((gridW - gap * (cols - 1)) / cols);
        const cardH = this.cardHeight;
        const rows = Math.ceil(total / cols);
        const rewardedH = this.category === 'all' ? 84 + gap : 0;
        void cardW;
        return rewardedH + rows * cardH + Math.max(0, rows - 1) * gap;
    }

    private async buyRealMoney(id: string): Promise<void> {
        if (this.locked || this.purchasing || this.popup) {
            return;
        }

        const pkg = REAL_MONEY_PRODUCTS.find((item) => item.id === id);
        if (!pkg) {
            return;
        }

        this.purchasing = true;
        const outcome = await requestPurchase(pkg);
        if (outcome.status === 'unavailable') {
            this.showPopup('Payments Unavailable', outcome.reason ?? 'Store payments are not configured yet. No charge was made.', false);
            return;
        }

        if (outcome.status === 'cancelled') {
            this.showPopup('Purchase Cancelled', 'The purchase was cancelled. No charge was made.', false);
            return;
        }

        if (outcome.status !== 'granted') {
            this.showPopup('Payment Failed', outcome.reason ?? 'The purchase could not be completed. No charge was made.', false);
            return;
        }

        if (hasProcessedTransaction(outcome.transactionId)) {
            this.showPopup('Already Purchased', 'This transaction was already processed.', false);
            return;
        }

        const verification = await verifyTransaction(pkg, outcome.transactionId, outcome.platform, outcome.receipt);
        if (!verification.verified) {
            this.showPopup('Verification Failed', verification.reason ?? 'The purchase could not be verified. No rewards were granted.', false);
            return;
        }

        // Verified exactly once: grant coins + bonus inventory, then record.
        markTransactionProcessed(outcome.transactionId, pkg.id);
        addCoins(pkg.coins);
        Object.entries(pkg.grants).forEach(([type, amount]) => {
            if (amount && amount > 0) {
                grantPowerUp(type as keyof PowerUpInventory, amount);
            }
        });
        gameAudio.playSfx('click');
        this.refreshBalances();
        const inv = loadPowerUpInventory();
        this.showPopup(
            'Purchase Successful!',
            `${pkg.name}\n${pkg.coins.toLocaleString('en-US')} Coins + ${pkg.grants.bomb || 0} Bombs + ${pkg.grants.fireball || 0} Fire + ${pkg.grants.colorChanger || 0} Color\nBalance: ${loadProgress().coins.toLocaleString('en-US')} Coins\nBombs ${inv.bomb} · Fire ${inv.fireball} · Color Changes ${inv.colorChanger}\nTransaction: ${outcome.transactionId.slice(0, 18)}`,
            true
        );
    }

    private buyPackage(id: string): void {
        if (this.locked || this.purchasing || this.popup) {
            return;
        }

        const pkg = STORE_PRODUCTS.find((item) => item.id === id);
        if (!pkg) {
            return;
        }

        this.purchasing = true;
        const coins = loadProgress().coins;
        if (coins < pkg.price) {
            this.showPopup('Not Enough Coins', `You need ${pkg.price} coins, but you have ${coins}.`, false);
            return;
        }

        addCoins(-pkg.price);
        let appliedReward: StoreReward = pkg.reward;
        if (pkg.mystery) {
            appliedReward = rollMysteryReward(pkg);
        }
        Object.entries(appliedReward.grants).forEach(([type, amount]) => {
            if (amount && amount > 0) {
                grantPowerUp(type as keyof PowerUpInventory, amount);
            }
        });
        if (appliedReward.extraShots && appliedReward.extraShots > 0) {
            addPendingBonusShots(appliedReward.extraShots);
        }
        if (appliedReward.coins && appliedReward.coins > 0) {
            addCoins(appliedReward.coins);
        }
        gameAudio.playSfx('click');
        this.refreshBalances();
        if (pkg.mystery) {
            this.showMysteryPopup(pkg, appliedReward);
        } else {
            this.showPopup(
                'Purchase Successful!',
                `${pkg.reward.description}\nBalance: ${loadProgress().coins} Coins\nBombs ${loadPowerUpInventory().bomb} · Fire ${loadPowerUpInventory().fireball} · Color Changes ${loadPowerUpInventory().colorChanger}`,
                true
            );
        }
    }

    private claimDaily(): void {
        if (this.locked || this.purchasing || this.popup) {
            return;
        }

        if (!canClaimDailyCoins()) {
            this.showPopup('Daily Reward', 'Come back tomorrow for your free coins!', false);
            return;
        }

        this.purchasing = true;
        const gained = claimDailyCoins();
        if (gained > 0) {
            gameAudio.playSfx('click');
            this.refreshBalances();
            this.showPopup('Daily Free Coins!', `You claimed ${gained} free coins!\nBalance: ${loadProgress().coins} Coins`, true);
        } else {
            this.purchasing = false;
        }
    }

    private refreshBalances(): void {
        const progress = loadProgress();
        const inv = loadPowerUpInventory();
        this.coinsText?.setText(progress.coins.toLocaleString('en-US'));
        this.sidebarBalanceText?.setText(`${progress.coins.toLocaleString('en-US')} Coins`);
        this.earnedText?.setText(`Total Earned: ${(progress.totalCoinsEarned || 0).toLocaleString('en-US')}`);
        this.spentText?.setText(`Total Spent: ${(progress.totalCoinsSpent || 0).toLocaleString('en-US')}`);
        this.inventoryText?.setText(`Bombs ${inv.bomb} · Fire ${inv.fireball} · Color Changes ${inv.colorChanger}`);
        if (this.dailyButtonText) {
            const claim = canClaimDailyCoins();
            this.dailyButtonText.setText(claim ? `DAILY +${DAILY_FREE_COINS}` : 'COME BACK TOMORROW');
        }
    }

    private showMysteryPopup(pkg: StoreProduct, reward: StoreReward): void {
        const layer = this.add.container(0, 0).setDepth(200);
        const dim = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x020617, 0.72).setInteractive();
        const cardX = GAME_WIDTH / 2;
        const cardY = GAME_HEIGHT / 2;
        const card = this.add.graphics();
        card.fillStyle(0x020617, 0.5);
        card.fillRoundedRect(cardX - 215, cardY - 125, 430, 250, 26);
        card.fillGradientStyle(0x3b1270, 0x3b1270, 0x1e1b4b, 0x1e1b4b, 1);
        card.fillRoundedRect(cardX - 220, cardY - 130, 430, 250, 26);
        card.lineStyle(4, 0xffc928, 0.95);
        card.strokeRoundedRect(cardX - 220, cardY - 130, 430, 250, 26);
        const title = this.add
            .text(cardX, cardY - 96, 'MYSTERY REWARD', { fontFamily: FONT_DISPLAY, fontSize: '26px', color: '#ffffff', stroke: '#1e1b4b', strokeThickness: 4 })
            .setOrigin(0.5);
        const box = this.add.graphics();
        const drawBox = (): void => {
            box.clear();
            box.fillStyle(0x27016d, 1);
            box.fillRoundedRect(-30, -24, 60, 48, 8);
            box.fillStyle(0xffc928, 1);
            box.fillRect(-4, -24, 8, 48);
            box.fillStyle(0xff454f, 1);
            box.fillRoundedRect(-32, -30, 64, 10, 5);
            box.fillStyle(0xffc928, 1);
            box.fillRect(-4, -30, 8, 10);
        };
        drawBox();
        box.setPosition(cardX, cardY - 30);
        const body = this.add
            .text(cardX, cardY + 30, 'Opening…', { fontFamily: FONT_DISPLAY, fontSize: '18px', color: '#ffffff' })
            .setOrigin(0.5);
        const ok = this.add
            .text(cardX, cardY + 80, 'OK', { fontFamily: FONT_DISPLAY, fontSize: '18px', color: '#ffffff', backgroundColor: '#22c55e', padding: { x: 36, y: 10 } })
            .setOrigin(0.5)
            .setInteractive({ useHandCursor: true });
        ok.setName('popup-ok');
        ok.disableInteractive();

        const close = (): void => {
            layer.destroy(true);
            this.popup = null;
            this.purchasing = false;
        };
        ok.on('pointerdown', close);
        dim.on('pointerdown', close);
        addPressFx(this, ok, ok, { hoverScale: 1.05, pressScale: 0.95 });
        layer.add([dim, card, title, box, body, ok]);
        this.popup = layer;

        this.tweens.add({ targets: box, scaleX: 1.15, scaleY: 1.15, duration: 220, yoyo: true, repeat: 3, ease: 'Sine.easeInOut' });
        this.time.delayedCall(900, () => {
            if (this.popup !== layer) {
                return;
            }

            box.destroy();
            body.setText(`You won:\n${reward.description}`);
            body.setFontSize('20px');
            ok.setInteractive({ useHandCursor: true });
            gameAudio.playSfx('click');
        });
        void pkg;
    }

    private showPopup(titleText: string, bodyText: string, success: boolean): void {
        if (this.popup) {
            return;
        }

        const layer = this.add.container(0, 0).setDepth(200);
        const dim = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x020617, 0.72).setInteractive();
        const cardX = GAME_WIDTH / 2;
        const cardY = GAME_HEIGHT / 2;
        const card = this.add.graphics();
        card.fillStyle(0x020617, 0.5);
        card.fillRoundedRect(cardX - 215, cardY - 105, 430, 210, 26);
        card.fillGradientStyle(success ? 0x47b9c8 : 0xc23b4b, success ? 0x47b9c8 : 0xc23b4b, success ? 0x157a9b : 0x8e263b, success ? 0x157a9b : 0x8e263b, 1);
        card.fillRoundedRect(cardX - 220, cardY - 110, 430, 210, 26);
        card.fillStyle(0xffffff, 0.18);
        card.fillRoundedRect(cardX - 204, cardY - 98, 398, 40, 18);
        card.lineStyle(4, 0xe8faff, 0.95);
        card.strokeRoundedRect(cardX - 220, cardY - 110, 430, 210, 26);

        const title = this.add
            .text(cardX, cardY - 72, titleText, { fontFamily: FONT_DISPLAY, fontSize: '24px', color: '#ffffff', stroke: '#0a3d91', strokeThickness: 4, align: 'center' })
            .setOrigin(0.5);
        const body = this.add
            .text(cardX, cardY - 10, bodyText, { fontFamily: FONT, fontSize: '16px', color: '#ffffff', stroke: '#0a3d91', strokeThickness: 2, align: 'center', lineSpacing: 6 })
            .setOrigin(0.5);
        const ok = this.add
            .text(cardX, cardY + 66, 'OK', { fontFamily: FONT_DISPLAY, fontSize: '18px', color: '#ffffff', backgroundColor: '#22c55e', padding: { x: 36, y: 10 } })
            .setOrigin(0.5)
            .setInteractive({ useHandCursor: true });
        ok.setName('popup-ok');

        const close = (): void => {
            layer.destroy(true);
            this.popup = null;
            this.purchasing = false;
        };
        ok.on('pointerdown', close);
        dim.on('pointerdown', close);
        addPressFx(this, ok, ok, { hoverScale: 1.05, pressScale: 0.95 });
        layer.add([dim, card, title, body, ok]);
        this.popup = layer;
    }

    private goBack(): void {
        if (this.locked || this.purchasing) {
            return;
        }

        this.locked = true;
        if (this.returnTo === 'GameScene') {
            goToScene(this, this.returnTo, { level: this.returnLevel }, 180);
        } else {
            goToScene(this, this.returnTo, undefined, 180);
        }
    }
}
