import { Scene } from 'phaser';
import { FONT, FONT_DISPLAY, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { loadProgress } from '../utils/storage';
import { gameAudio, installUiAudio } from '../audio/GameAudio';
import { fadeInScene, goToScene } from './transitions';
import { addPressFx } from '../../ui/uiFx';
import { attachRelayout, worldHeight, worldWidth } from '../layout';
import { showRewardedAd } from '../../ads/rewardedAds';
import {
    GIFT_ITEMS,
    adCooldownRemainingMs,
    formatGiftCountdown,
    giftCountdownMs,
    grantGiftReward,
    grantUnlockedLevelRewards,
    isGiftClaimed,
    isGiftUnlocked,
    loadGiftState,
    rollLuckyReward,
    type GiftItem,
} from '../gifts/gifts';

export interface GiftItemsSceneData {
    returnTo?: string;
    level?: number;
    instant?: boolean;
}

const SCROLL_TOP = 150;
const DRAG_THRESHOLD = 10;

const RARITY_LABEL: Record<string, string> = {
    common: 'COMMON',
    rare: 'RARE',
    epic: 'EPIC',
    legendary: 'LEGENDARY',
    special: 'SPECIAL',
};

const RARITY_COLOR: Record<string, number> = {
    common: 0x168bff,
    rare: 0x38d94a,
    epic: 0xa855f7,
    legendary: 0xffb300,
    special: 0xff454f,
};

export class GiftItemsScene extends Scene {
    private locked = false;
    private claiming = false;
    private returnTo = 'LevelSelectionScene';
    private returnLevel = 0;
    private instantOpen = false;
    private coinsText!: Phaser.GameObjects.Text;
    private countdownText!: Phaser.GameObjects.Text;
    private popup: Phaser.GameObjects.Container | null = null;
    private listContainer: Phaser.GameObjects.Container | null = null;
    private listMaskShape: Phaser.GameObjects.Graphics | null = null;
    private scrollY = 0;
    private dragging = false;
    private dragMoved = false;
    private dragStartY = 0;
    private dragStartScroll = 0;
    private countdownEvent: Phaser.Time.TimerEvent | null = null;
    private renderedDay = '';
    private giftIllustrations = new Map<string, Phaser.GameObjects.Container>();
    private cooldownTexts = new Map<string, Phaser.GameObjects.Text>();

    constructor() {
        super('GiftItemsScene');
    }

    init(data: GiftItemsSceneData = {}): void {
        this.returnTo = data.returnTo ?? 'LevelSelectionScene';
        this.returnLevel = Number.isFinite(data.level) ? (data.level ?? 0) : 0;
        this.instantOpen = data.instant === true;
    }

    create(): void {
        this.locked = false;
        this.claiming = false;
        this.popup = null;
        this.scrollY = 0;
        installUiAudio(this);
        this.createBackground();
        this.createHeader();
        this.buildList();
        this.bindScrollInput();
        this.countdownEvent = this.time.addEvent({ delay: 1000, loop: true, callback: () => this.tickCountdown() });
        // Gift-button navigation is instant: skip the fade-in when asked.
        if (!this.instantOpen) {
            fadeInScene(this, 240, [5, 57, 91]);
        }
        attachRelayout(this, () => {
            this.scene.restart({ returnTo: this.returnTo, level: this.returnLevel, instant: this.instantOpen });
        });
        this.events.once('shutdown', () => {
            this.popup = null;
            this.listMaskShape?.destroy();
            this.listMaskShape = null;
            this.countdownEvent?.remove();
            this.countdownEvent = null;
        });
    }

    private createBackground(): void {
        if (this.textures.exists('bg-level-map')) {
            const bg = this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'bg-level-map').setDepth(-30);
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
            .text(width / 2, 48, 'GIFT ITEMS', { fontFamily: FONT_DISPLAY, fontSize: '26px', color: '#ffffff', stroke: '#0a3d91', strokeThickness: 5 })
            .setOrigin(0.5)
            .setDepth(40);
        this.add
            .text(width / 2, 72, 'Collect amazing gifts and rewards!', { fontFamily: FONT, fontSize: '12px', color: '#e0fbff', stroke: '#0a3d91', strokeThickness: 2 })
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
        this.add.text(width - 122, 48, '$', { fontFamily: FONT_DISPLAY, fontSize: '11px', color: '#78350f', stroke: '#fff0a6', strokeThickness: 1 }).setOrigin(0.5).setDepth(41);
        this.coinsText = this.add
            .text(width - 82, 48, loadProgress().coins.toLocaleString('en-US'), { fontFamily: FONT_DISPLAY, fontSize: '15px', color: '#ffffff', stroke: '#0a3d91', strokeThickness: 3 })
            .setOrigin(0.5)
            .setDepth(41);
        this.coinsText.setName('coin-balance');

        this.countdownText = this.add
            .text(width / 2, 98, '', { fontFamily: FONT_DISPLAY, fontSize: '13px', color: '#fde68a', stroke: '#0a3d91', strokeThickness: 3 })
            .setOrigin(0.5)
            .setDepth(40);
        this.countdownText.setName('daily-countdown');
        this.refreshHeader();
    }

    private refreshHeader(): void {
        const state = loadGiftState();
        this.renderedDay = state.day;
        this.coinsText?.setText(loadProgress().coins.toLocaleString('en-US'));
        this.countdownText?.setText(`Daily Free Gift resets in ${formatGiftCountdown(giftCountdownMs())}`);
    }

    private tickCountdown(): void {
        const state = loadGiftState();
        if (state.day !== this.renderedDay) {
            this.buildList();
        }
        // Live-update ad cooldown timers; rebuild when one expires so the
        // WATCH AD button becomes available again.
        let expired = false;
        this.cooldownTexts.forEach((text, giftId) => {
            const gift = GIFT_ITEMS.find((item) => item.id === giftId);
            if (!gift) {
                return;
            }
            const remaining = adCooldownRemainingMs(gift);
            if (remaining <= 0) {
                expired = true;
                this.cooldownTexts.delete(giftId);
            } else if (text.active) {
                text.setText(formatGiftCountdown(remaining));
            }
        });
        if (expired) {
            this.buildList();
        }
        this.refreshHeader();
    }

    private get storeColumns(): number {
        const width = typeof window !== 'undefined' ? window.innerWidth : 0;
        const device = Number.isFinite(width) && width > 0 ? width : worldWidth();
        if (device < 560) return 1;
        if (device < 900) return 2;
        if (device < 1300) return 3;
        return 4;
    }

    private buildList(): void {
        this.giftIllustrations.clear();
        this.cooldownTexts.clear();
        this.listContainer?.destroy(true);
        this.listMaskShape?.destroy();
        const width = worldWidth();
        const cols = this.storeColumns;
        // Single-column mobile cards are narrower, leaving generous padding
        // on both sides with the card centred in the available width.
        const listW = cols === 1 ? Math.min(420, width - 48) : Math.min(820, width - 32);
        const originX = width / 2 - listW / 2;
        this.listContainer = this.add.container(originX, SCROLL_TOP).setDepth(5);
        this.listMaskShape = this.make.graphics({ x: originX, y: SCROLL_TOP }, false);
        this.listMaskShape.fillStyle(0xffffff, 1);
        this.listMaskShape.fillRect(0, 0, listW, worldHeight() - SCROLL_TOP - 16);
        this.listContainer.setMask(this.listMaskShape.createGeometryMask());

        const gap = 16;
        const cardW = Math.floor((listW - gap * (cols - 1)) / cols);
        const cardH = 210;
        // Progressive rewards: auto-pay every unlocked Level gift once via
        // the existing coin/inventory systems before rendering its state.
        grantUnlockedLevelRewards(loadProgress().highestLevel);
        this.refreshHeader();
        const state = loadGiftState();
        this.renderedDay = state.day;
        GIFT_ITEMS.forEach((gift, index) => {
            const col = index % cols;
            const row = Math.floor(index / cols);
            const x = col * (cardW + gap) + cardW / 2;
            const y = row * (cardH + gap) + cardH / 2;
            this.listContainer?.add(this.createGiftCard(x, y, cardW, cardH, gift, state));
        });
        this.scrollY = 0;
        this.listContainer.setY(SCROLL_TOP);
    }

    private createGiftCard(x: number, y: number, width: number, height: number, gift: GiftItem, state = loadGiftState()): Phaser.GameObjects.Container {
        const progress = loadProgress();
        const unlocked = isGiftUnlocked(gift, progress.highestLevel);
        const claimed = isGiftClaimed(gift, state);
        const card = this.add.container(x, y);
        const rarityColor = RARITY_COLOR[gift.rarity] ?? 0x168bff;
        // Premium rarity gradients: Common soft blue, Rare green, Epic
        // purple, Legendary golden, Special pink/orange.
        const rarityGradient: Record<string, [number, number]> = {
            common: [0x38bdf8, 0x1d4ed8],
            rare: [0x4ade80, 0x15803d],
            epic: [0xa78bfa, 0x6d28d9],
            legendary: [0xffe38a, 0xb45309],
            special: [0xfb7185, 0xc2410c],
        };
        const [gradTop, gradBottom] = rarityGradient[gift.rarity] ?? [0x38bdf8, 0x1d4ed8];
        const g = this.add.graphics();
        g.fillStyle(0x020617, 0.5);
        g.fillRoundedRect(-width / 2, -height / 2 + 7, width, height, 20);
        g.fillGradientStyle(gradTop, gradTop, gradBottom, gradBottom, 1);
        g.fillRoundedRect(-width / 2, -height / 2, width, height, 20);
        g.fillStyle(0xffffff, 0.3);
        g.fillRoundedRect(-width / 2 + 12, -height / 2 + 8, width - 24, 30, 12);
        g.lineStyle(3, 0xffffff, 0.95);
        g.strokeRoundedRect(-width / 2, -height / 2, width, height, 20);
        g.lineStyle(1.5, 0xffffff, 0.45);
        g.strokeRoundedRect(-width / 2 + 5, -height / 2 + 5, width - 10, height - 10, 16);
        card.add(g);

        // Side-by-side card layout: artwork left, name + vertical rewards
        // right, action in a bottom strip. No text overlaps the artwork.
        // Cards are completely static — no tweens, hover scale, or press FX.
        const imageW = Math.min(140, Math.max(72, Math.round(width * 0.36)));
        const sidePad = 14;
        const textX = -width / 2 + sidePad + imageW + 10;
        const textW = width - sidePad - sidePad - imageW - 10;
        const contentTop = -height / 2;
        const contentBottom = height / 2 - 56;
        const imageCx = -width / 2 + sidePad + imageW / 2;
        const imageCy = (contentTop + contentBottom) / 2;

        const titleFontSize = textW < 110 ? '11px' : textW < 160 ? '12px' : '14px';
        const title = this.add
            .text(textX, contentTop + 14, gift.name, { fontFamily: FONT_DISPLAY, fontSize: titleFontSize, color: '#ffffff', stroke: '#075a8a', strokeThickness: 3, align: 'left', wordWrap: { width: Math.max(52, textW - 70) } })
            .setOrigin(0, 0);
        card.add(title);

        // Static glow behind epic/legendary artwork (no pulsing).
        if (gift.rarity === 'epic' || gift.rarity === 'legendary') {
            const glow = this.add.graphics();
            glow.fillStyle(rarityColor, 0.3);
            glow.fillCircle(imageCx, imageCy, 50);
            card.add(glow);
        }
        // Extracted PNG artwork — one transparent asset per color (separate
        // files, no combined sheet), loaded per card.
        const ill = this.add.container(imageCx, imageCy);
        if (this.textures.exists(gift.artwork)) {
            const artwork = this.add.image(0, 0, gift.artwork);
            // Contain-fit: preserve aspect ratio inside the artwork area.
            const scale = Math.min((imageW - 8) / artwork.width, (contentBottom - (-height / 2) - 14) / artwork.height);
            artwork.setDisplaySize(artwork.width * scale, artwork.height * scale);
            artwork.setName(`artwork-${gift.id}`);
            ill.add(artwork);
        } else {
            // Fallback only if the PNG has not loaded: keep the card visible.
            const fallback = this.add.graphics();
            fallback.fillStyle(rarityColor, 1);
            fallback.fillRoundedRect(-28, -22, 56, 44, 8);
            ill.add(fallback);
        }
        if (!unlocked) {
            ill.setAlpha(0.6);
        }
        card.add(ill);
        this.giftIllustrations.set(gift.id, ill);

        // Vertical reward list beside the image: one benefit per line with a
        // small icon, bold gold quantity and a clear white label.
        const rewards: { qty: string; label: string; texture: string | null }[] = [];
        if (gift.reward.coins) {
            rewards.push({ qty: String(gift.reward.coins), label: 'Coins', texture: null });
        }
        const powerRows: { key: keyof NonNullable<GiftItem['reward']['grants']>; texture: string; label: string }[] = [
            { key: 'bomb', texture: 'powerup-bomb', label: 'Bombs' },
            { key: 'fireball', texture: 'icon-fire', label: 'Fire' },
            { key: 'colorChanger', texture: 'powerup-color', label: 'Color Changes' },
        ];
        powerRows.forEach(({ key, texture, label }) => {
            const amount = gift.reward.grants[key];
            if (amount) {
                const shortLabel = key === 'colorChanger' && textW < 150 ? 'Colors' : label;
                rewards.push({ qty: String(amount), label: shortLabel, texture: this.textures.exists(texture) ? texture : null });
            }
        });
        if (gift.id === 'lucky') {
            rewards.push({ qty: '?', label: 'Random', texture: null });
        }

        // Centre the title + reward block vertically so it balances the
        // artwork around the card centre, with padding left on all sides.
        const rewardGap = 21;
        const firstRewardY = title.y + title.height + 10;
        const blockBottom = rewards.length > 0 ? firstRewardY + (rewards.length - 1) * rewardGap + 9 : title.y + title.height;
        const blockCenter = (title.y + blockBottom) / 2;
        const shift = imageCy - blockCenter;
        title.setY(title.y + shift);
        const rewardStartY = firstRewardY + shift;

        // Rarity badge, aligned with the centred title line, top-right.
        const badge = this.add.graphics();
        badge.fillStyle(rarityColor, 1);
        badge.fillRoundedRect(width / 2 - 14 - 62, title.y - 2, 62, 18, 9);
        badge.lineStyle(1.5, 0xffffff, 0.9);
        badge.strokeRoundedRect(width / 2 - 14 - 62, title.y - 2, 62, 18, 9);
        const badgeText = this.add.text(width / 2 - 14 - 31, title.y + 7, RARITY_LABEL[gift.rarity], { fontFamily: FONT_DISPLAY, fontSize: '8px', color: '#ffffff' }).setOrigin(0.5);
        card.add([badge, badgeText]);

        rewards.forEach((reward, index) => {
            const ry = rewardStartY + index * rewardGap;
            if (ry > contentBottom - 10) {
                return;
            }
            if (reward.texture) {
                card.add(this.add.image(textX + 9, ry, reward.texture).setDisplaySize(18, 18));
            } else if (reward.label === 'Coins') {
                card.add(this.add.circle(textX + 9, ry, 8, 0xffc928, 1).setStrokeStyle(2, 0xfff1a8, 1));
                card.add(this.add.text(textX + 9, ry, '$', { fontFamily: FONT_DISPLAY, fontSize: '8px', color: '#78350f' }).setOrigin(0.5));
            } else {
                card.add(this.add.circle(textX + 9, ry, 8, rarityColor, 1).setStrokeStyle(2, 0xffffff, 0.9));
            }
            const qtyText = this.add.text(textX + 24, ry, reward.qty, { fontFamily: FONT_DISPLAY, fontSize: '12px', color: '#fde68a', stroke: '#0f2a4a', strokeThickness: 2 }).setOrigin(0, 0.5);
            card.add(qtyText);
            card.add(this.add.text(textX + 24 + qtyText.width + 5, ry, reward.label, { fontFamily: FONT, fontSize: '11px', color: '#ffffff', stroke: '#0f2a4a', strokeThickness: 2, wordWrap: { width: Math.max(28, textW - qtyText.width - 30) } }).setOrigin(0, 0.5));
        });

        if (!unlocked) {
            const stripY = height / 2 - 28;
            const lock = this.add.graphics();
            lock.fillStyle(0x64748b, 1);
            lock.fillCircle(-(width / 2) + 26, stripY, 13);
            lock.fillStyle(0xe5e7eb, 1);
            lock.fillRect(-(width / 2) + 20, stripY - 2, 12, 9);
            lock.lineStyle(3, 0xe5e7eb, 1);
            lock.strokeCircle(-(width / 2) + 26, stripY - 6, 5);
            const lockText = this.add
                .text(-(width / 2) + 46, stripY, `UNLOCK AT LEVEL ${gift.unlockLevel}`, { fontFamily: FONT_DISPLAY, fontSize: '11px', color: '#ffffff', stroke: '#334155', strokeThickness: 2, wordWrap: { width: width - 58 } })
                .setOrigin(0, 0.5);
            lockText.setName(`locked-${gift.id}`);
            card.add([lock, lockText]);
            return card;
        }

        if (claimed) {
            const done = this.add
                .text(0, height / 2 - 28, '✓ Claimed', { fontFamily: FONT_DISPLAY, fontSize: '13px', color: '#bbf7d0', stroke: '#064e2a', strokeThickness: 2 })
                .setOrigin(0.5);
            done.setName(`claimed-${gift.id}`);
            card.add(done);
            return card;
        }

        const giftIndex = GIFT_ITEMS.findIndex((item) => item.id === gift.id);
        const isAdCard = giftIndex >= 0 && giftIndex < 4 && gift.type === 'ad';
        const cooldownMs = isAdCard ? adCooldownRemainingMs(gift) : 0;

        if (isAdCard && cooldownMs > 0) {
            // Ad cooldown: show a live countdown instead of WATCH AD.
            const cdW = Math.min(160, width - 24);
            const cdY = height / 2 - 28;
            const cdBg = this.add.graphics();
            cdBg.fillStyle(0x1e293b, 0.9);
            cdBg.fillRoundedRect(-cdW / 2, cdY - 15, cdW, 30, 15);
            cdBg.lineStyle(2, 0x94a3b8, 0.9);
            cdBg.strokeRoundedRect(-cdW / 2, cdY - 15, cdW, 30, 15);
            const cdText = this.add.text(0, cdY, formatGiftCountdown(cooldownMs), { fontFamily: FONT_DISPLAY, fontSize: '13px', color: '#fde68a', stroke: '#0f172a', strokeThickness: 2 }).setOrigin(0.5);
            cdText.setName(`cooldown-${gift.id}`);
            this.cooldownTexts.set(gift.id, cdText);
            card.add([cdBg, cdText]);
            return card;
        }

        const buttonText = isAdCard ? 'WATCH AD' : 'UNLOCKED';

        const buyW = Math.min(160, width - 24);
        const buyY = height / 2 - 28;
        const buyBg = this.add.graphics();
        const btnGradient: Record<string, [number, number]> = {
            common: [0x38bdf8, 0x1d4ed8],
            rare: [0x4ade80, 0x15803d],
            epic: [0xa78bfa, 0x7c3aed],
            legendary: [0xffe38a, 0xd97706],
            special: [0xfb7185, 0xea580c],
        };
        const [btnTop, btnBottom] = btnGradient[gift.rarity] ?? [0xffe38a, 0xf59e0b];
        const drawBuy = (): void => {
            buyBg.clear();
            buyBg.fillStyle(0x020617, 0.45);
            buyBg.fillRoundedRect(-buyW / 2, buyY - 15 + 3, buyW, 30, 15);
            buyBg.fillGradientStyle(btnTop, btnTop, btnBottom, btnBottom, 1);
            buyBg.fillRoundedRect(-buyW / 2, buyY - 15, buyW, 30, 15);
            buyBg.fillStyle(0xffffff, 0.22);
            buyBg.fillRoundedRect(-buyW / 2 + 10, buyY - 12, buyW - 20, 10, 5);
            buyBg.lineStyle(2, 0xffffff, 0.95);
            buyBg.strokeRoundedRect(-buyW / 2, buyY - 15, buyW, 30, 15);
        };
        drawBuy();
        const buyText = this.add.text(0, buyY, buttonText, { fontFamily: FONT_DISPLAY, fontSize: '13px', color: '#ffffff', stroke: '#7c2d12', strokeThickness: 2 }).setOrigin(0.5);
        buyText.setName(`claim-${gift.id}`);
        const buyHit = this.add.rectangle(0, buyY, buyW, 30, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
        buyHit.setData('claimGift', gift.id);
        buyHit.on('pointerup', () => {
            if (!this.dragMoved) {
                void this.claimGiftHandler(gift);
            }
        });
        card.add([buyBg, buyText, buyHit]);
        return card;
    }

    private async claimGiftHandler(gift: GiftItem): Promise<void> {
        if (this.locked || this.claiming || this.popup) {
            return;
        }

        const progress = loadProgress();
        if (!isGiftUnlocked(gift, progress.highestLevel)) {
            return;
        }

        if (gift.type === 'ad') {
            const remaining = adCooldownRemainingMs(gift);
            if (remaining > 0) {
                this.showPopup('Ad Cooldown', `Please wait ${formatGiftCountdown(remaining)} before watching another ad for this gift.`, false);
                return;
            }

            this.claiming = true;
            const outcome = await showRewardedAd();
            if (outcome !== 'granted') {
                this.claiming = false;
                this.showPopup(outcome === 'unavailable' ? 'Ad Unavailable' : 'Ad Not Completed', outcome === 'unavailable' ? 'No rewarded ad is available right now. Please try again later.' : 'Watch the full ad to earn your reward. No gift was granted.', false);
                return;
            }

            this.grantAndShow(gift, gift.reward);
            return;
        }

        if (gift.id === 'lucky') {
            this.claiming = true;
            const rolled = rollLuckyReward();
            this.showLuckyPopup(gift, rolled);
            return;
        }

        this.claiming = true;
        this.grantAndShow(gift, gift.reward);
    }

    private grantAndShow(gift: GiftItem, reward: import('../gifts/gifts').GiftReward): void {
        const paid = grantGiftReward(gift, reward);
        if (!paid) {
            this.claiming = false;
            return;
        }

        gameAudio.playSfx('click');
        this.refreshHeader();
        // Static success feedback (no card animation): show the confirmation
        // popup and refresh immediately. The grant above is exactly-once.
        this.showPopup('Gift Collected Successfully!', `${gift.name}: ${reward.description}\nBalance: ${loadProgress().coins} Coins`, true);
        this.buildList();
    }

    private showLuckyPopup(gift: GiftItem, reward: import('../gifts/gifts').GiftReward): void {
        const layer = this.add.container(0, 0).setDepth(200);
        const dim = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x020617, 0.72).setInteractive();
        const cardX = GAME_WIDTH / 2;
        const cardY = GAME_HEIGHT / 2;
        const card = this.add.graphics();
        card.fillStyle(0x020617, 0.5);
        card.fillRoundedRect(cardX - 215, cardY - 105, 430, 210, 26);
        card.fillGradientStyle(0x3b1270, 0x3b1270, 0x1e1b4b, 0x1e1b4b, 1);
        card.fillRoundedRect(cardX - 220, cardY - 110, 430, 210, 26);
        card.lineStyle(4, 0xffc928, 0.95);
        card.strokeRoundedRect(cardX - 220, cardY - 110, 430, 210, 26);
        const title = this.add.text(cardX, cardY - 72, 'LUCKY GIFT', { fontFamily: FONT_DISPLAY, fontSize: '24px', color: '#ffffff', stroke: '#1e1b4b', strokeThickness: 4 }).setOrigin(0.5);
        const body = this.add.text(cardX, cardY - 10, `You won:\n${reward.description}`, { fontFamily: FONT_DISPLAY, fontSize: '20px', color: '#fff8e1', align: 'center' }).setOrigin(0.5);
        body.setName('lucky-reward');
        const collect = this.add.text(cardX, cardY + 66, 'COLLECT', { fontFamily: FONT_DISPLAY, fontSize: '18px', color: '#ffffff', backgroundColor: '#22c55e', padding: { x: 30, y: 10 } }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        collect.setName('lucky-collect');
        const close = (): void => {
            layer.destroy(true);
            this.popup = null;
            this.claiming = false;
            this.buildList();
        };
        collect.on('pointerdown', () => {
            const paid = grantGiftReward(gift, reward);
            if (paid) {
                gameAudio.playSfx('click');
                this.refreshHeader();
            }
            close();
        });
        layer.add([dim, card, title, body, collect]);
        this.popup = layer;
    }

    private bindScrollInput(): void {
        this.input.on('pointerdown', this.onScrollDown, this);
        this.input.on('pointermove', this.onScrollMove, this);
        this.input.on('pointerup', this.onScrollUp, this);
        this.input.on('pointerupoutside', this.onScrollUp, this);
        this.input.on('wheel', this.onScrollWheel, this);
    }

    private inList(pointer: Phaser.Input.Pointer): boolean {
        return pointer.y >= SCROLL_TOP && pointer.y <= worldHeight();
    }

    private onScrollDown(pointer: Phaser.Input.Pointer): void {
        if (this.locked || this.popup || !this.inList(pointer)) {
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
        if (this.locked || this.popup || !this.inList(pointer)) {
            return;
        }

        this.applyScroll(this.scrollY - deltaY * 0.55);
    }

    private applyScroll(next: number): void {
        const contentHeight = this.listContentHeight();
        const min = Math.min(0, worldHeight() - SCROLL_TOP - 16 - contentHeight);
        this.scrollY = Math.max(min, Math.min(0, next));
        this.listContainer?.setY(SCROLL_TOP + this.scrollY);
    }

    private listContentHeight(): number {
        const cols = this.storeColumns;
        const rows = Math.ceil(GIFT_ITEMS.length / cols);
        return rows * 210 + Math.max(0, rows - 1) * 16;
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
        const title = this.add.text(cardX, cardY - 72, titleText, { fontFamily: FONT_DISPLAY, fontSize: '24px', color: '#ffffff', stroke: '#0a3d91', strokeThickness: 4, align: 'center' }).setOrigin(0.5);
        const body = this.add.text(cardX, cardY - 10, bodyText, { fontFamily: FONT, fontSize: '16px', color: '#ffffff', stroke: '#0a3d91', strokeThickness: 2, align: 'center', lineSpacing: 6 }).setOrigin(0.5);
        const ok = this.add.text(cardX, cardY + 66, 'OK', { fontFamily: FONT_DISPLAY, fontSize: '18px', color: '#ffffff', backgroundColor: '#22c55e', padding: { x: 36, y: 10 } }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        ok.setName('popup-ok');
        const close = (): void => {
            layer.destroy(true);
            this.popup = null;
            this.claiming = false;
            this.buildList();
        };
        ok.on('pointerdown', close);
        dim.on('pointerdown', close);
        layer.add([dim, card, title, body, ok]);
        this.popup = layer;
    }

    private goBack(): void {
        if (this.locked || this.claiming) {
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
