import type { Scene } from 'phaser';
import { FONT_DISPLAY } from '../game/config';
import { gameAudio } from '../game/audio/GameAudio';
import { acquireModalInputLock, releaseModalInputLock } from '../game/input/modalInputLock';
import { getPowerUpQuantity } from '../game/powerups/inventory';
import { worldHeight, worldWidth } from '../game/layout';
import { addPressFx } from './uiFx';

/**
 * Level-start popup shown over the Level Section.
 *
 * Layout mirrors the reference artwork: blue gradient header with the
 * selected level number, three 3D golden stars, the purple objective line,
 * a light power-up panel with live inventory counts, and a green PLAY button.
 * It reads the shared power-up inventory directly (no second inventory) and
 * is a singleton per scene: `show()` is a no-op while one is already open.
 */

export interface LevelPopupOptions {
    /** 1-based level number shown in the header. */
    levelNumber: number;
    /** Called after the popup closes (X or PLAY). */
    onClose?: () => void;
    /** Called after the popup is dismissed by PLAY. */
    onPlay: () => void;
}

const CARD_WIDTH = 470;
const CARD_HEIGHT = 690;
const CARD_TOP = -CARD_HEIGHT / 2;
const CARD_RADIUS = 30;
const HEADER_HEIGHT = 122;
const STARS_Y = -160;
const OBJECTIVE_Y = -68;
const SECTION_TOP = -8;
const SECTION_WIDTH = CARD_WIDTH - 56;
const SECTION_HEIGHT = 168;
const PLAY_Y = 252;
const PLAY_WIDTH = 300;
const PLAY_HEIGHT = 78;
const LOCK_ID = 'level-popup';

const POWER_UPS = [
    { texture: 'powerup-bomb', type: 'bomb' as const },
    { texture: 'powerup-color', type: 'colorChanger' as const },
];

const starPoints = (
    cx: number,
    cy: number,
    outer: number,
    inner: number
): { x: number; y: number }[] => {
    const points: { x: number; y: number }[] = [];
    for (let index = 0; index < 10; index += 1) {
        const radius = index % 2 === 0 ? outer : inner;
        const angle = -Math.PI / 2 + (index * Math.PI) / 5;
        points.push({
            x: cx + Math.cos(angle) * radius,
            y: cy + Math.sin(angle) * radius,
        });
    }
    return points;
};

const drawStarShape = (
    graphics: Phaser.GameObjects.Graphics,
    cx: number,
    cy: number,
    outer: number,
    inner: number
): void => {
    const points = starPoints(cx, cy, outer, inner);
    graphics.beginPath();
    graphics.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) {
        graphics.lineTo(points[index].x, points[index].y);
    }
    graphics.closePath();
};

export class LevelPopup {
    private readonly scene: Scene;
    private container: Phaser.GameObjects.Container | null = null;
    private card: Phaser.GameObjects.Container | null = null;
    private options: LevelPopupOptions | null = null;

    constructor(scene: Scene) {
        this.scene = scene;
    }

    get isOpen(): boolean {
        return this.container !== null;
    }

    show(options: LevelPopupOptions): void {
        if (this.container) {
            return;
        }

        acquireModalInputLock(LOCK_ID);
        this.options = options;

        const scene = this.scene;
        const width = worldWidth();
        const height = worldHeight();
        const fitScale = Math.min(
            1,
            (width - 24) / CARD_WIDTH,
            (height - 24) / CARD_HEIGHT
        );

        const root = scene.add.container(0, 0).setDepth(200);
        this.container = root;

        const dim = scene.add
            .rectangle(width / 2, height / 2, width, height, 0x0f0a2e, 0.72)
            .setInteractive();
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
        root.add(dim);

        const card = scene.add.container(width / 2, height / 2).setScale(fitScale);
        this.card = card;
        root.add(card);

        this.buildCard(card, options);

        root.setAlpha(0);
        card.setScale(fitScale * 0.92);
        scene.tweens.add({ targets: root, alpha: 1, duration: 150, ease: 'Quad.easeOut' });
        scene.tweens.add({
            targets: card,
            scaleX: fitScale,
            scaleY: fitScale,
            duration: 220,
            ease: 'Back.easeOut',
        });
        gameAudio.playSfx('popupOpen');
    }

    hide(): void {
        const wasOpen = this.container !== null;
        this.options = null;
        releaseModalInputLock(LOCK_ID);

        if (this.card) {
            this.scene.tweens.killTweensOf(this.card);
        }
        if (this.container) {
            this.scene.tweens.killTweensOf(this.container);
            this.container.destroy(true);
        }
        this.card = null;
        this.container = null;
        if (wasOpen) {
            gameAudio.playSfx('popupClose');
        }
    }

    private buildCard(card: Phaser.GameObjects.Container, options: LevelPopupOptions): void {
        const scene = this.scene;
        const graphics = scene.add.graphics();
        card.add(graphics);

        // Outer drop shadow + lavender body with a soft purple rim.
        graphics.fillStyle(0x1e1b4b, 0.42);
        graphics.fillRoundedRect(
            -CARD_WIDTH / 2 + 3,
            CARD_TOP + 12,
            CARD_WIDTH,
            CARD_HEIGHT,
            CARD_RADIUS + 4
        );
        graphics.fillStyle(0xf3eeff, 1);
        graphics.fillRoundedRect(-CARD_WIDTH / 2, CARD_TOP, CARD_WIDTH, CARD_HEIGHT, CARD_RADIUS);

        // Blue gradient header (rounded top, square bottom edge).
        graphics.fillGradientStyle(0x6fd8ff, 0x46b4ff, 0x1d6fe0, 0x1557c0, 1);
        graphics.fillRoundedRect(
            -CARD_WIDTH / 2,
            CARD_TOP,
            CARD_WIDTH,
            HEADER_HEIGHT,
            CARD_RADIUS
        );
        graphics.fillRect(
            -CARD_WIDTH / 2,
            CARD_TOP + HEADER_HEIGHT - CARD_RADIUS,
            CARD_WIDTH,
            CARD_RADIUS
        );
        graphics.fillStyle(0xffffff, 0.18);
        graphics.fillRoundedRect(-CARD_WIDTH / 2 + 12, CARD_TOP + 8, CARD_WIDTH - 24, 28, 14);
        graphics.fillStyle(0x0d47a1, 0.45);
        graphics.fillRect(-CARD_WIDTH / 2, CARD_TOP + HEADER_HEIGHT - 3, CARD_WIDTH, 3);

        // Purple popup border on top of the header.
        graphics.lineStyle(4, 0x8b5cf6, 0.95);
        graphics.strokeRoundedRect(-CARD_WIDTH / 2, CARD_TOP, CARD_WIDTH, CARD_HEIGHT, CARD_RADIUS);

        const title = scene.add
            .text(0, CARD_TOP + 62, `LEVEL ${options.levelNumber}`, {
                fontFamily: FONT_DISPLAY,
                fontSize: '44px',
                color: '#ffffff',
                stroke: '#0a2c66',
                strokeThickness: 7,
            })
            .setOrigin(0.5);
        title.setShadow(0, 4, 'rgba(4, 20, 52, 0.55)', 4, true, true);
        card.add(title);

        this.createCloseButton(card);
        this.drawStars(graphics);
        this.createObjective(card);
        this.createPowerUpSection(card);
        this.createPlayButton(card);
    }

    /** Three layered 3D stars, centre one slightly larger. */
    private drawStars(graphics: Phaser.GameObjects.Graphics): void {
        const stars: { x: number; outer: number; inner: number; y: number }[] = [
            { x: -98, y: STARS_Y + 3, outer: 44, inner: 19 },
            { x: 0, y: STARS_Y - 2, outer: 53, inner: 23 },
            { x: 98, y: STARS_Y + 3, outer: 44, inner: 19 },
        ];

        for (const star of stars) {
            // Ground shadow.
            graphics.fillStyle(0x7a3d00, 0.35);
            drawStarShape(graphics, star.x, star.y + 5, star.outer + 1, star.inner + 1);
            graphics.fillPath();

            // Dark base / bevel.
            graphics.fillStyle(0xe6a200, 1);
            drawStarShape(graphics, star.x, star.y + 2, star.outer, star.inner);
            graphics.fillPath();
            graphics.lineStyle(4, 0x8a4a00, 0.9);
            graphics.strokePath();

            // Golden face.
            graphics.fillStyle(0xffc928, 1);
            drawStarShape(graphics, star.x, star.y, star.outer - 2, star.inner - 2);
            graphics.fillPath();

            // Top-left light band for the 3D look.
            graphics.fillStyle(0xffe38a, 0.95);
            drawStarShape(
                graphics,
                star.x - 2,
                star.y - 3,
                star.outer - 7,
                star.inner - 7
            );
            graphics.fillPath();
            graphics.lineStyle(2, 0xfff6c9, 0.85);
            graphics.strokePath();

            // Small specular highlight.
            graphics.fillStyle(0xffffff, 0.55);
            drawStarShape(
                graphics,
                star.x - star.outer * 0.26,
                star.y - star.outer * 0.32,
                star.outer * 0.26,
                star.outer * 0.12
            );
            graphics.fillPath();
        }
    }

    private createObjective(card: Phaser.GameObjects.Container): void {
        const objective = this.scene.add
            .text(0, OBJECTIVE_Y, 'POP ALL BUBBLES!', {
                fontFamily: FONT_DISPLAY,
                fontSize: '30px',
                color: '#a21caf',
                align: 'center',
            })
            .setOrigin(0.5);
        objective.setShadow(0, 2, 'rgba(88, 20, 110, 0.35)', 3, true, true);
        card.add(objective);
    }

    private createPowerUpSection(card: Phaser.GameObjects.Container): void {
        const scene = this.scene;
        const graphics = scene.add.graphics();
        card.add(graphics);

        const sectionX = -SECTION_WIDTH / 2;

        // Light horizontal panel.
        graphics.fillStyle(0xffffff, 0.82);
        graphics.fillRoundedRect(sectionX, SECTION_TOP, SECTION_WIDTH, SECTION_HEIGHT, 22);
        graphics.lineStyle(2, 0xd8ccff, 0.95);
        graphics.strokeRoundedRect(sectionX, SECTION_TOP, SECTION_WIDTH, SECTION_HEIGHT, 22);
        graphics.fillStyle(0xffffff, 0.6);
        graphics.fillRoundedRect(sectionX + 12, SECTION_TOP + 6, SECTION_WIDTH - 24, 8, 4);

        const heading = scene.add
            .text(0, SECTION_TOP + 28, 'START THE LEVEL WITH:', {
                fontFamily: FONT_DISPLAY,
                fontSize: '15px',
                color: '#5b21b6',
                letterSpacing: 1,
            })
            .setOrigin(0.5);
        card.add(heading);

        const iconY = SECTION_TOP + 104;
        const iconSize = 98;
        POWER_UPS.forEach((powerUp, index) => {
            const cardX = index === 0 ? -66 : 66;
            const quantity = getPowerUpQuantity(powerUp.type);
            card.add(this.createPowerUpTile(cardX, iconY, iconSize, powerUp.texture, quantity));
        });
    }

    private createPowerUpTile(
        x: number,
        y: number,
        size: number,
        texture: string,
        quantity: number
    ): Phaser.GameObjects.Container {
        const scene = this.scene;
        const tile = scene.add.container(x, y);
        const graphics = scene.add.graphics();

        // Rounded square with a soft blue rim and inner highlight.
        graphics.fillStyle(0x020617, 0.16);
        graphics.fillRoundedRect(-size / 2, -size / 2 + 5, size, size, 22);
        graphics.fillStyle(0xeaf4ff, 1);
        graphics.fillRoundedRect(-size / 2, -size / 2, size, size, 22);
        graphics.lineStyle(2.5, 0x9cc8ff, 0.95);
        graphics.strokeRoundedRect(-size / 2, -size / 2, size, size, 22);
        graphics.lineStyle(1.5, 0xffffff, 0.85);
        graphics.strokeRoundedRect(-size / 2 + 4, -size / 2 + 4, size - 8, size - 8, 18);
        tile.add(graphics);

        const icon = scene.add.image(0, -2, texture).setDisplaySize(58, 58);
        tile.add(icon);

        // Green quantity badge at the bottom-right corner.
        const badgeRadius = 17;
        const badgeX = size / 2 - 12;
        const badgeY = size / 2 - 12;
        const badge = scene.add.graphics();
        badge.fillStyle(0x0f5132, 0.35);
        badge.fillCircle(badgeX, badgeY + 2, badgeRadius);
        badge.fillStyle(0x22c55e, 1);
        badge.fillCircle(badgeX, badgeY, badgeRadius);
        badge.lineStyle(2.5, 0xffffff, 0.98);
        badge.strokeCircle(badgeX, badgeY, badgeRadius);
        badge.fillStyle(0xffffff, 0.22);
        badge.fillCircle(badgeX - 5, badgeY - 6, 7);
        tile.add(badge);

        const quantityText = scene.add
            .text(badgeX, badgeY + 1, String(quantity), {
                fontFamily: FONT_DISPLAY,
                fontSize: '15px',
                color: '#ffffff',
                stroke: '#14532d',
                strokeThickness: 3,
            })
            .setOrigin(0.5);
        tile.add(quantityText);

        return tile;
    }

    private createPlayButton(card: Phaser.GameObjects.Container): void {
        const scene = this.scene;
        const button = scene.add.container(0, PLAY_Y);
        const graphics = scene.add.graphics();

        const halfWidth = PLAY_WIDTH / 2;
        const halfHeight = PLAY_HEIGHT / 2;

        // Depth shadow + dark green base.
        graphics.fillStyle(0x0e5a1f, 0.4);
        graphics.fillRoundedRect(-halfWidth, -halfHeight + 8, PLAY_WIDTH, PLAY_HEIGHT, 39);
        graphics.fillStyle(0x0e7a2e, 1);
        graphics.fillRoundedRect(-halfWidth, -halfHeight, PLAY_WIDTH, PLAY_HEIGHT, 39);

        // Green gradient face.
        graphics.fillGradientStyle(0x8cffa8, 0x6dff9b, 0x2fc24a, 0x1e9e3a, 1);
        graphics.fillRoundedRect(
            -halfWidth + 3,
            -halfHeight + 3,
            PLAY_WIDTH - 6,
            PLAY_HEIGHT - 6,
            36
        );

        // Gloss + bright rim.
        graphics.fillStyle(0xffffff, 0.28);
        graphics.fillRoundedRect(-halfWidth + 18, -halfHeight + 10, PLAY_WIDTH - 36, 22, 11);
        graphics.lineStyle(3, 0xb6ffc8, 0.9);
        graphics.strokeRoundedRect(-halfWidth + 2, -halfHeight + 2, PLAY_WIDTH - 4, PLAY_HEIGHT - 4, 37);

        const label = scene.add
            .text(0, 1, 'PLAY', {
                fontFamily: FONT_DISPLAY,
                fontSize: '34px',
                color: '#ffffff',
                stroke: '#0c5b22',
                strokeThickness: 5,
            })
            .setOrigin(0.5);
        label.setShadow(0, 3, 'rgba(5, 46, 16, 0.45)', 3, true, true);

        const hit = scene.add
            .rectangle(0, 0, PLAY_WIDTH, PLAY_HEIGHT, 0xffffff, 0.001)
            .setInteractive({ useHandCursor: true });
        hit.on(
            'pointerdown',
            (
                _pointer: Phaser.Input.Pointer,
                _localX: number,
                _localY: number,
                event: Phaser.Types.Input.EventData
            ) => {
                event.stopPropagation();
                this.play();
            }
        );

        button.add([graphics, label, hit]);
        addPressFx(scene, hit, button, { hoverScale: 1.04, pressScale: 0.95 });
        card.add(button);
    }

    private createCloseButton(card: Phaser.GameObjects.Container): void {
        const scene = this.scene;
        const x = CARD_WIDTH / 2 - 34;
        const y = CARD_TOP + 34;
        const radius = 23;

        const button = scene.add.container(x, y);
        const graphics = scene.add.graphics();
        graphics.fillStyle(0x020617, 0.22);
        graphics.fillCircle(1, 2, radius);
        graphics.fillStyle(0xffffff, 1);
        graphics.fillCircle(0, 0, radius);
        graphics.lineStyle(2.5, 0x168bff, 0.9);
        graphics.strokeCircle(0, 0, radius);

        const arm = 7;
        graphics.lineStyle(4, 0x168bff, 1);
        graphics.beginPath();
        graphics.moveTo(-arm, -arm);
        graphics.lineTo(arm, arm);
        graphics.moveTo(arm, -arm);
        graphics.lineTo(-arm, arm);
        graphics.strokePath();

        const hit = scene.add
            .circle(0, 0, radius + 4, 0xffffff, 0.001)
            .setInteractive({ useHandCursor: true });
        hit.on(
            'pointerdown',
            (
                _pointer: Phaser.Input.Pointer,
                _localX: number,
                _localY: number,
                event: Phaser.Types.Input.EventData
            ) => {
                event.stopPropagation();
                this.close();
            }
        );

        button.add([graphics, hit]);
        addPressFx(scene, hit, button, { hoverScale: 1.08, pressScale: 0.92 });
        card.add(button);
    }

    private close(): void {
        const options = this.options;
        this.hide();
        options?.onClose?.();
    }

    private play(): void {
        const options = this.options;
        if (!options) {
            return;
        }
        this.hide();
        options.onPlay();
    }
}
