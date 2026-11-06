import { Scene } from 'phaser';
import { FONT, FONT_DISPLAY, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { loadProgress } from '../utils/storage';
import { gameAudio, installUiAudio } from '../audio/GameAudio';
import { fadeInScene, goToScene } from './transitions';
import { addPressFx } from '../../ui/uiFx';
import { attachRelayout, worldHeight, worldWidth } from '../layout';
import {
    DAILY_MISSIONS,
    claimDailyReward,
    completedCount,
    dhakaCountdownMs,
    formatCountdown,
    loadDailyProgress,
    missionProgress,
    type DailyProgress,
} from '../daily/dailyTasks';

export interface DailyTasksSceneData {
    returnTo?: string;
    level?: number;
}

const SCROLL_TOP = 150;
const DRAG_THRESHOLD = 10;

export class DailyTasksScene extends Scene {
    private locked = false;
    private claiming = false;
    private returnTo = 'LevelSelectionScene';
    private returnLevel = 0;
    private coinsText!: Phaser.GameObjects.Text;
    private countdownText!: Phaser.GameObjects.Text;
    private progressText!: Phaser.GameObjects.Text;
    private progressFill!: Phaser.GameObjects.Graphics;
    private popup: Phaser.GameObjects.Container | null = null;
    private listContainer: Phaser.GameObjects.Container | null = null;
    private listMaskShape: Phaser.GameObjects.Graphics | null = null;
    private scrollY = 0;
    private dragging = false;
    private dragMoved = false;
    private dragStartY = 0;
    private dragStartScroll = 0;
    private renderedDay = '';
    private countdownEvent: Phaser.Time.TimerEvent | null = null;
    private championCards: Phaser.GameObjects.Container[] = [];

    constructor() {
        super('DailyTasksScene');
    }

    init(data: DailyTasksSceneData = {}): void {
        this.returnTo = data.returnTo ?? 'LevelSelectionScene';
        this.returnLevel = Number.isFinite(data.level) ? (data.level ?? 0) : 0;
    }

    create(): void {
        this.locked = false;
        this.claiming = false;
        this.popup = null;
        this.scrollY = 0;
        installUiAudio(this);
        this.createBackground();
        this.createHeader();
        this.createSummary();
        this.buildList();
        this.bindScrollInput();
        this.countdownEvent = this.time.addEvent({ delay: 1000, loop: true, callback: () => this.tickCountdown() });
        fadeInScene(this, 240, [5, 57, 91]);
        attachRelayout(this, () => {
            this.scene.restart({ returnTo: this.returnTo, level: this.returnLevel });
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
            .text(width / 2, 52, 'DAILY TASKS', { fontFamily: FONT_DISPLAY, fontSize: '28px', color: '#ffffff', stroke: '#0a3d91', strokeThickness: 5 })
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
    }

    private createSummary(): void {
        const width = worldWidth();
        this.countdownText = this.add
            .text(width / 2, 86, '', { fontFamily: FONT_DISPLAY, fontSize: '13px', color: '#fde68a', stroke: '#0a3d91', strokeThickness: 3 })
            .setOrigin(0.5)
            .setDepth(40);
        this.countdownText.setName('daily-countdown');
        this.progressText = this.add
            .text(width / 2, 108, '', { fontFamily: FONT_DISPLAY, fontSize: '13px', color: '#ffffff', stroke: '#0a3d91', strokeThickness: 3 })
            .setOrigin(0.5)
            .setDepth(40);
        this.progressText.setName('daily-progress');
        this.progressFill = this.add.graphics().setDepth(40);
        this.refreshSummary();
    }

    private refreshSummary(): void {
        const state = loadDailyProgress();
        this.renderedDay = state.day;
        this.countdownText?.setText(`Resets in ${formatCountdown(dhakaCountdownMs())}`);
        const done = completedCount(state);
        this.progressText?.setText(`${done}/6 Completed`);
        if (this.progressFill) {
            const barW = Math.min(420, worldWidth() - 64);
            const barX = worldWidth() / 2 - barW / 2;
            const barY = 122;
            const barH = 12;
            this.progressFill.clear();
            this.progressFill.fillStyle(0x020617, 0.85);
            this.progressFill.fillRoundedRect(barX, barY, barW, barH, 6);
            const ratio = done / DAILY_MISSIONS.length;
            if (ratio > 0) {
                this.progressFill.fillGradientStyle(0xffe38a, 0xffe38a, 0xffb300, 0xffb300, 1);
                this.progressFill.fillRoundedRect(barX, barY, Math.max(barH, barW * ratio), barH, 6);
            }
            this.progressFill.lineStyle(1.5, 0xffffff, 0.7);
            this.progressFill.strokeRoundedRect(barX, barY, barW, barH, 6);
        }
    }

    private tickCountdown(): void {
        if (!this.countdownText) {
            return;
        }

        const state = loadDailyProgress();
        if (state.day !== this.renderedDay) {
            // Dhaka day rolled over while this page was open.
            this.buildList();
        }
        this.refreshSummary();
    }

    private listWidth(): number {
        return Math.min(640, worldWidth() - 32);
    }

    private buildList(): void {
        this.listContainer?.destroy(true);
        this.listMaskShape?.destroy();
        const origin = { x: worldWidth() / 2 - this.listWidth() / 2, y: SCROLL_TOP, w: this.listWidth(), h: worldHeight() - SCROLL_TOP - 16 };
        this.listContainer = this.add.container(origin.x, origin.y).setDepth(5);
        this.listMaskShape = this.make.graphics({ x: origin.x, y: origin.y }, false);
        this.listMaskShape.fillStyle(0xffffff, 1);
        this.listMaskShape.fillRect(0, 0, origin.w, origin.h);
        this.listContainer.setMask(this.listMaskShape.createGeometryMask());

        const state = loadDailyProgress();
        this.renderedDay = state.day;
        const cardH = 116;
        const gap = 14;
        this.championCards = [];
        DAILY_MISSIONS.forEach((mission, index) => {
            const x = this.listWidth() / 2;
            const y = index * (cardH + gap) + cardH / 2;
            this.listContainer?.add(this.createMissionCard(x, y, this.listWidth(), cardH, mission, state));
        });
        this.scrollY = 0;
        this.listContainer.setY(origin.y);
        this.refreshSummary();
    }

    private createMissionCard(
        x: number,
        y: number,
        width: number,
        height: number,
        mission: (typeof DAILY_MISSIONS)[number],
        state: DailyProgress
    ): Phaser.GameObjects.Container {
        const card = this.add.container(x, y);
        const progress = missionProgress(state, mission);
        const complete = progress >= mission.target;
        const claimed = state.claimed.includes(mission.id);
        const g = this.add.graphics();
        g.fillStyle(0x020617, 0.5);
        g.fillRoundedRect(-width / 2, -height / 2 + 7, width, height, 20);
        g.fillGradientStyle(0x47b9c8, 0x47b9c8, 0x157a9b, 0x157a9b, 1);
        g.fillRoundedRect(-width / 2, -height / 2, width, height, 20);
        g.fillStyle(0xffffff, 0.16);
        g.fillRoundedRect(-width / 2 + 12, -height / 2 + 8, width - 24, 30, 12);
        g.lineStyle(3, complete && !claimed ? 0xffc928 : 0xe8faff, 0.95);
        g.strokeRoundedRect(-width / 2, -height / 2, width, height, 20);
        card.add(g);

        // Icon (drawn, matching the bubble-shooter palette).
        const icon = this.add.graphics();
        const iconX = -width / 2 + 38;
        if (mission.icon === 'play') {
            icon.fillStyle(0xffffff, 1);
            icon.fillTriangle(iconX - 7, -10, iconX - 7, 10, iconX + 10, 0);
        } else if (mission.icon === 'target') {
            icon.lineStyle(4, 0xffffff, 1);
            icon.strokeCircle(iconX, 0, 11);
            icon.fillStyle(0xffc928, 1);
            icon.fillCircle(iconX, 0, 5);
        } else if (mission.icon === 'fire') {
            icon.fillStyle(0xff8d1f, 1);
            icon.fillTriangle(iconX - 9, 6, iconX + 9, 6, iconX, -12);
            icon.fillCircle(iconX, 6, 9);
            icon.fillStyle(0xffe38a, 1);
            icon.fillTriangle(iconX - 4, 6, iconX + 4, 6, iconX, -4);
        } else if (mission.icon === 'bomb') {
            icon.fillStyle(0x1f2937, 1);
            icon.fillCircle(iconX, 2, 11);
            icon.lineStyle(3, 0x1f2937, 1);
            icon.lineBetween(iconX + 5, -6, iconX + 10, -13);
            icon.fillStyle(0xffc928, 1);
            icon.fillCircle(iconX + 12, -14, 3);
        } else {
            icon.fillStyle(0xffc928, 1);
            icon.fillCircle(iconX, 0, 12);
            icon.fillStyle(0xfff1a8, 1);
            icon.fillTriangle(iconX, -8, iconX - 3, -2, iconX + 3, -2);
            icon.fillTriangle(iconX - 7, 1, iconX - 3, 1, iconX - 3, 6);
            icon.fillTriangle(iconX + 7, 1, iconX + 3, 1, iconX + 3, 6);
        }
        card.add(icon);

        const leftW = width - 180;
        const leftCenter = -width / 2 + 76 + leftW / 2;
        const title = this.add
            .text(leftCenter, -height / 2 + 24, mission.title, { fontFamily: FONT_DISPLAY, fontSize: '15px', color: '#ffffff', stroke: '#075a8a', strokeThickness: 3 })
            .setOrigin(0.5);
        const description = this.add
            .text(leftCenter, -height / 2 + 44, mission.description, { fontFamily: FONT, fontSize: '11px', color: '#e0fbff', align: 'center' })
            .setOrigin(0.5);
        const counter = this.add
            .text(leftCenter, -height / 2 + 62, `${progress}/${mission.target}`, { fontFamily: FONT_DISPLAY, fontSize: '12px', color: '#fff8e1' })
            .setOrigin(0.5);
        counter.setName(`progress-${mission.id}`);
        card.add([title, description, counter]);

        // Progress bar.
        const barW = Math.min(200, leftW);
        const barX = leftCenter - barW / 2;
        const barY = height / 2 - 44;
        const bar = this.add.graphics();
        bar.fillStyle(0x020617, 0.85);
        bar.fillRoundedRect(barX, barY, barW, 10, 5);
        const ratio = progress / mission.target;
        if (ratio > 0) {
            bar.fillGradientStyle(0xffe38a, 0xffe38a, 0xffb300, 0xffb300, 1);
            bar.fillRoundedRect(barX, barY, Math.max(10, barW * ratio), 10, 5);
        }
        bar.lineStyle(1.5, 0xffffff, 0.7);
        bar.strokeRoundedRect(barX, barY, barW, 10, 5);
        card.add(bar);

        // Reward + Claim state on the right.
        const rightX = width / 2 - 78;
        const reward = this.add
            .text(rightX, -height / 2 + 36, `+${mission.reward} Coins`, { fontFamily: FONT_DISPLAY, fontSize: '13px', color: '#fff8e1', stroke: '#7c2d12', strokeThickness: 2 })
            .setOrigin(0.5);
        card.add(reward);

        if (claimed) {
            const done = this.add
                .text(rightX, height / 2 - 32, '✓ Claimed', { fontFamily: FONT_DISPLAY, fontSize: '13px', color: '#bbf7d0', stroke: '#064e2a', strokeThickness: 2 })
                .setOrigin(0.5);
            done.setName(`claimed-${mission.id}`);
            card.add(done);
        } else {
            const claimW = Math.min(120, width - leftW - 60);
            const claimX = rightX;
            const claimY = height / 2 - 32;
            const claimBg = this.add.graphics();
            const drawClaim = (hover: boolean): void => {
                claimBg.clear();
                claimBg.fillStyle(0x020617, 0.45);
                claimBg.fillRoundedRect(claimX - claimW / 2, claimY - 14 + 3, claimW, 28, 14);
                const top = complete ? (hover ? 0xffe38a : 0xffd54d) : 0x64748b;
                const bottom = complete ? (hover ? 0xffb300 : 0xf59e0b) : 0x475569;
                claimBg.fillGradientStyle(top, top, bottom, bottom, 1);
                claimBg.fillRoundedRect(claimX - claimW / 2, claimY - 14, claimW, 28, 14);
                claimBg.lineStyle(2, 0xffffff, 0.95);
                claimBg.strokeRoundedRect(claimX - claimW / 2, claimY - 14, claimW, 28, 14);
            };
            drawClaim(false);
            const claimText = this.add
                .text(claimX, claimY, complete ? 'CLAIM' : 'IN PROGRESS', { fontFamily: FONT_DISPLAY, fontSize: '11px', color: '#ffffff', stroke: '#7c2d12', strokeThickness: 2 })
                .setOrigin(0.5);
            claimText.setName(`claim-${mission.id}`);
            const claimHit = this.add.rectangle(claimX, claimY, claimW, 28, 0xffffff, 0.001).setInteractive({ useHandCursor: complete });
            claimHit.setData('claimMission', mission.id);
            claimHit.on('pointerup', () => {
                if (!this.dragMoved && complete) {
                    this.claimMission(mission.id);
                }
            });
            if (complete) {
                claimHit.on('pointerover', () => drawClaim(true));
                claimHit.on('pointerout', () => drawClaim(false));
                addPressFx(this, claimHit, claimText, { hoverScale: 1.04, pressScale: 0.96 });
            }
            card.add([claimBg, claimText, claimHit]);
        }

        if (mission.id === 'champion' && complete && !claimed) {
            this.championCards.push(card);
            this.tweens.add({ targets: card, scaleX: 1.03, scaleY: 1.03, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        }

        const stateLabel = claimed ? 'Reward Claimed' : complete ? 'Completed' : progress > 0 ? 'In Progress' : 'Not Started';
        const stateText = this.add
            .text(-width / 2 + 76, -height / 2 + 24, stateLabel, { fontFamily: FONT_DISPLAY, fontSize: '9px', color: '#e0fbff' })
            .setOrigin(0, 0.5)
            .setName(`state-${mission.id}`);
        card.add(stateText);
        return card;
    }

    private claimMission(missionId: string): void {
        if (this.locked || this.claiming || this.popup) {
            return;
        }

        this.claiming = true;
        const result = claimDailyReward(missionId);
        if (!result.claimed) {
            this.claiming = false;
            return;
        }

        gameAudio.playSfx('click');
        this.refreshBalances();
        this.showPopup('Reward Claimed!', `+${result.coins} Coins Added!`, true);
        // purchasing-style lock is released by showPopup's close handler.
    }

    private refreshBalances(): void {
        this.coinsText?.setText(loadProgress().coins.toLocaleString('en-US'));
        this.refreshSummary();
    }

    private bindScrollInput(): void {
        this.input.on('pointerdown', this.onScrollDown, this);
        this.input.on('pointermove', this.onScrollMove, this);
        this.input.on('pointerup', this.onScrollUp, this);
        this.input.on('pointerupoutside', this.onScrollUp, this);
        this.input.on('wheel', this.onScrollWheel, this);
    }

    private inList(pointer: Phaser.Input.Pointer): boolean {
        const width = this.listWidth();
        const originX = worldWidth() / 2 - width / 2;
        return pointer.x >= originX && pointer.x <= originX + width && pointer.y >= SCROLL_TOP && pointer.y <= worldHeight();
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
        const originY = SCROLL_TOP;
        const contentHeight = DAILY_MISSIONS.length * 116 + (DAILY_MISSIONS.length - 1) * 14;
        const min = Math.min(0, worldHeight() - originY - 16 - contentHeight);
        this.scrollY = Math.max(min, Math.min(0, next));
        this.listContainer?.setY(originY + this.scrollY);
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
        addPressFx(this, ok, ok, { hoverScale: 1.05, pressScale: 0.95 });
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
