import { FONT, FONT_DISPLAY, GAME_HEIGHT, GAME_WIDTH } from '../game/config';
import { LEVELS } from '../game/data/levels';
import {
    resolveLevelProgressState,
    resolveLevelStars,
    suggestedLevelIndex,
} from '../game/data/levels/progress';
import { loadProgress } from '../game/utils/storage';
import { addPressFx } from './uiFx';
import { uiFitScale } from '../game/responsive';

export interface LevelSelectPanelOptions {
    onLevelSelect: (levelIndex: number) => void;
    onBack: () => void;
}

const PAGE_SIZE = 20;
const COLUMNS = 4;
const CARD_WIDTH = 100;
const CARD_HEIGHT = 60;
const CARD_GAP_X = 8;
const CARD_GAP_Y = 10;
const GRID_LEFT = -212;
const GRID_TOP = -270;

export class LevelSelectPanel {
    private readonly scene: Phaser.Scene;
    private container: Phaser.GameObjects.Container | null = null;
    private options: LevelSelectPanelOptions | null = null;
    private page = 0;
    private transitioning = false;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
    }

    show(options: LevelSelectPanelOptions): void {
        this.hide();
        this.options = options;
        this.transitioning = false;

        const progress = loadProgress();
        const suggested = suggestedLevelIndex(LEVELS.length, progress);
        this.page = Math.floor(suggested / PAGE_SIZE);

        this.render();

        if (this.container) {
            this.container.setAlpha(0).setScale(0.94);
            this.scene.tweens.add({
                targets: this.container,
                alpha: 1,
                scaleX: 1,
                scaleY: 1,
                duration: 220,
                ease: 'Back.easeOut',
            });
        }
    }

    hide(): void {
        if (this.container) {
            this.scene.tweens.killTweensOf(this.container);
        }

        this.container?.destroy(true);
        this.container = null;
        this.transitioning = false;
    }

    private render(): void {
        const options = this.options;

        if (!options) {
            return;
        }

        if (this.container) {
            this.scene.tweens.killTweensOf(this.container);
        }

        this.container?.destroy(true);

        const scene = this.scene;
        const container = scene.add
            .container(GAME_WIDTH / 2, GAME_HEIGHT / 2)
            .setDepth(250)
            .setScale(uiFitScale());
        this.container = container;

        const dim = scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x02050d, 0.9);
        dim.setInteractive();
        dim.on('pointerdown', () => undefined);
        container.add(dim);

        const card = scene.add.graphics();
        card.fillStyle(0x0c1730, 0.99);
        card.fillRoundedRect(-230, -400, 460, 800, 28);
        card.lineStyle(2, 0x31507f, 0.95);
        card.strokeRoundedRect(-230, -400, 460, 800, 28);
        card.lineStyle(1, 0x1d3356, 0.9);
        card.lineBetween(-190, -300, 190, -300);
        container.add(card);

        const title = scene.add
            .text(0, -360, 'SELECT LEVEL', {
                fontFamily: FONT_DISPLAY,
                fontSize: '28px',
                color: '#ffffff',
                stroke: '#071023',
                strokeThickness: 5,
            })
            .setOrigin(0.5);
        container.add(title);

        const progress = loadProgress();
        let cleared = 0;
        let stars = 0;

        for (let index = 0; index < LEVELS.length; index++) {
            if (resolveLevelProgressState(index, progress) === 'completed') {
                cleared += 1;
            }
            stars += resolveLevelStars(index, progress);
        }

        const summary = scene.add
            .text(
                0,
                -325,
                `${cleared} / ${LEVELS.length} CLEARED  ·  ★ ${stars} / ${LEVELS.length * 3}`,
                {
                    fontFamily: FONT,
                    fontSize: '10px',
                    color: '#9fb7dd',
                }
            )
            .setOrigin(0.5);
        container.add(summary);

        const pageCount = Math.max(1, Math.ceil(LEVELS.length / PAGE_SIZE));
        const pageText = scene.add
            .text(0, 118, `PAGE ${this.page + 1} / ${pageCount}`, {
                fontFamily: FONT_DISPLAY,
                fontSize: '12px',
                color: '#cfe8ff',
                letterSpacing: 1,
            })
            .setOrigin(0.5);
        container.add(pageText);

        const grid = scene.add.container(0, 0);
        container.add(grid);

        for (let slot = 0; slot < PAGE_SIZE; slot++) {
            const index = this.page * PAGE_SIZE + slot;

            if (index >= LEVELS.length) {
                break;
            }

            const column = slot % COLUMNS;
            const row = Math.floor(slot / COLUMNS);
            const x = GRID_LEFT + column * (CARD_WIDTH + CARD_GAP_X);
            const y = GRID_TOP + row * (CARD_HEIGHT + CARD_GAP_Y);

            grid.add(this.createLevelCard(index, x, y, options));
        }

        this.createPageButton(container, -132, 118, '‹', this.page > 0, () => {
            if (this.page <= 0) return;
            this.page -= 1;
            this.render();
        });

        this.createPageButton(
            container,
            132,
            118,
            '›',
            this.page < pageCount - 1,
            () => {
                if (this.page >= pageCount - 1) return;
                this.page += 1;
                this.render();
            }
        );

        const backBg = scene.add.graphics();
        backBg.fillStyle(0x152747, 0.96);
        backBg.fillRoundedRect(-80, 300, 160, 48, 24);
        backBg.lineStyle(1.5, 0x40618f, 0.9);
        backBg.strokeRoundedRect(-80, 300, 160, 48, 24);
        container.add(backBg);

        const backText = scene.add
            .text(0, 324, 'BACK', {
                fontFamily: FONT_DISPLAY,
                fontSize: '15px',
                color: '#cfe8ff',
            })
            .setOrigin(0.5);
        container.add(backText);

        const backHit = scene.add
            .rectangle(0, 324, 160, 48, 0xffffff, 0.001)
            .setInteractive({ useHandCursor: true });
        backHit.on('pointerdown', () => options.onBack());
        container.add(backHit);
    }

    private createLevelCard(
        index: number,
        x: number,
        y: number,
        options: LevelSelectPanelOptions
    ): Phaser.GameObjects.Container {
        const scene = this.scene;
        const level = LEVELS[index];
        const state = resolveLevelProgressState(index, loadProgress());
        const stars = resolveLevelStars(index, loadProgress());
        const card = scene.add.container(x, y);

        const graphics = scene.add.graphics();
        const fill =
            state === 'completed' ? 0x0f2f2a : state === 'unlocked' ? 0x172447 : 0x1b1730;
        const border =
            state === 'completed' ? 0x34d399 : state === 'unlocked' ? 0x60a5fa : 0x475569;

        graphics.fillStyle(fill, 1);
        graphics.fillRoundedRect(0, 0, CARD_WIDTH, CARD_HEIGHT, 12);
        graphics.lineStyle(1.5, border, state === 'locked' ? 0.55 : 0.95);
        graphics.strokeRoundedRect(0, 0, CARD_WIDTH, CARD_HEIGHT, 12);
        card.add(graphics);

        const number = scene.add
            .text(CARD_WIDTH / 2, 19, String(index + 1), {
                fontFamily: FONT_DISPLAY,
                fontSize: '19px',
                color: state === 'locked' ? '#64748b' : '#f8fafc',
            })
            .setOrigin(0.5);
        card.add(number);

        const statusLabel =
            state === 'completed'
                ? stars > 0
                    ? `${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}`
                    : 'CLEARED'
                : state === 'unlocked'
                  ? 'READY'
                  : 'LOCKED';
        const status = scene.add
            .text(CARD_WIDTH / 2, 43, statusLabel, {
                fontFamily: state === 'completed' ? FONT : FONT_DISPLAY,
                fontSize: state === 'completed' ? '12px' : '8px',
                color:
                    state === 'completed'
                        ? '#fbbf24'
                        : state === 'unlocked'
                          ? '#93c5fd'
                          : '#64748b',
                letterSpacing: state === 'completed' ? 0 : 1,
            })
            .setOrigin(0.5);
        card.add(status);

        if (state === 'locked') {
            card.setAlpha(0.72);
        }

        const hit = scene.add
            .rectangle(CARD_WIDTH / 2, CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT, 0xffffff, 0.001)
            .setInteractive({ useHandCursor: state !== 'locked' });
        card.add(hit);

        if (state !== 'locked') {
            // Hover scaling removed on purpose — the card should only react to
            // presses. hoverScale: 1 keeps addPressFx's press feedback intact.
            addPressFx(scene, hit, card, { hoverScale: 1, pressScale: 0.95 });
        }

        hit.on('pointerdown', () => {
            if (state === 'locked' || this.transitioning) return;
            this.transitioning = true;
            scene.time.delayedCall(90, () => options.onLevelSelect(index));
        });

        // Keep the level name available for tooling / future UI without
        // crowding the 100-level grid.
        card.setData('levelName', level.name);

        return card;
    }

    private createPageButton(
        parent: Phaser.GameObjects.Container,
        x: number,
        y: number,
        label: string,
        enabled: boolean,
        onClick: () => void
    ): void {
        const scene = this.scene;
        const bg = scene.add.circle(x, y, 17, enabled ? 0x312e81 : 0x1e293b, enabled ? 1 : 0.55);
        bg.setStrokeStyle(1.5, enabled ? 0x8b5cf6 : 0x475569, enabled ? 0.9 : 0.45);
        parent.add(bg);

        const text = scene.add
            .text(x, y - 1, label, {
                fontFamily: FONT_DISPLAY,
                fontSize: '18px',
                color: enabled ? '#ede9fe' : '#64748b',
            })
            .setOrigin(0.5);
        parent.add(text);

        if (!enabled) {
            return;
        }

        bg.setInteractive({ useHandCursor: true });
        bg.on('pointerover', () => bg.setScale(1.08));
        bg.on('pointerout', () => bg.setScale(1));
        bg.on('pointerdown', () => {
            bg.setScale(0.92);
            scene.time.delayedCall(80, () => {
                if (bg.active) bg.setScale(1);
            });
            onClick();
        });
    }
}
