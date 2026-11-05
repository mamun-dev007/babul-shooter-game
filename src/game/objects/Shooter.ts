import { GameObjects } from 'phaser';
import {
    BUBBLE_DIAMETER,
    COLOR_NAMES,
    FONT,
    MAX_AIM_ANGLE,
    bubbleTexture,
    type BubbleColorName,
} from '../config';
import { SHOOTER_TOP_CLEARANCE } from '../layout';

const PREVIEW_SIZE = 27;
const BARREL_TIP = 76;

interface Velocity {
    x: number;
    y: number;
}

export class Shooter extends GameObjects.Container {
    private readonly barrel: Phaser.GameObjects.Container;
    private readonly loadedBubble: Phaser.GameObjects.Image;
    private readonly nextBubble: Phaser.GameObjects.Image;

    private colorPool: BubbleColorName[] = [...COLOR_NAMES];
    private colorPicker: (() => BubbleColorName) | null = null;
    private aimAngle = 0;
    private onBubbleSwap: (() => boolean) | null = null;

    currentColor: BubbleColorName;
    nextColor: BubbleColorName;

    constructor(scene: Phaser.Scene, x: number, y: number) {
        super(scene, x, y);

        this.currentColor = COLOR_NAMES[0];
        this.nextColor = COLOR_NAMES[1];

        const baseShadow = scene.add.circle(0, 5, 28, 0x123a35, 0.28);
        const base = scene.add.circle(0, 0, 24, 0x248b57).setStrokeStyle(3, 0xb9ffd1);
        const baseGlow = scene.add.circle(0, 0, 18, 0x42c66f, 0.92);
        const baseCore = scene.add.circle(0, 0, 12, 0x1c744b);

        const barrel = scene.add.container(0, 0);
        const barrelGfx = scene.add.graphics();
        barrelGfx.fillStyle(0x247e54, 0.72);
        barrelGfx.fillRoundedRect(-9, -SHOOTER_TOP_CLEARANCE, 18, 80, 9);
        barrelGfx.lineStyle(2, 0xcaffd9, 0.92);
        barrelGfx.strokeRoundedRect(-9, -SHOOTER_TOP_CLEARANCE, 18, 80, 9);
        barrelGfx.fillStyle(0x91f0a8, 0.48);
        barrelGfx.fillRoundedRect(-4, -72, 8, 66, 4);
        barrel.add(barrelGfx);

        const loadedBubble = scene.add
            .image(0, -BARREL_TIP, bubbleTexture(this.currentColor))
            .setDisplaySize(BUBBLE_DIAMETER, BUBBLE_DIAMETER);
        barrel.add(loadedBubble);

        const loadedHit = scene.add
            .circle(0, -BARREL_TIP, 24, 0xffffff, 0.001)
            .setInteractive({ useHandCursor: true });
        loadedHit.on('pointerdown', () => this.swapWithNext());
        this.add(loadedHit);

        const nextBackdrop = scene.add.circle(68, 0, 18, 0x2868d6, 0.94).setStrokeStyle(2, 0xffffff);
        const nextHit = scene.add
            .circle(68, 0, 24, 0xffffff, 0.001)
            .setInteractive({ useHandCursor: true });
        nextHit.on('pointerdown', () => this.swapWithNext());

        const nextBubble = scene.add
            .image(68, 0, bubbleTexture(this.nextColor))
            .setDisplaySize(PREVIEW_SIZE, PREVIEW_SIZE);

        const spinner = scene.add.container(68, 0);
        const createSpinnerArrow = (angle: number) => {
            const arrow = scene.add.graphics();
            arrow.fillStyle(0xff5a32, 1);
            arrow.lineStyle(3, 0xff8a4c, 1);
            arrow.beginPath();
            arrow.arc(0, 0, 11, -Math.PI * 0.72, Math.PI * 0.72, false);
            arrow.strokePath();
            arrow.fillTriangle(7, -11, 17, -3, 5, -1);
            arrow.setPosition(Math.cos(angle) * 23, Math.sin(angle) * 23);
            arrow.setRotation(angle + Math.PI / 2);
            return arrow;
        };
        spinner.add([createSpinnerArrow(0), createSpinnerArrow(Math.PI)]);
        scene.tweens.add({
            targets: spinner,
            angle: 360,
            duration: 2400,
            repeat: -1,
            ease: 'Linear',
        });

        const nextLabel = scene.add
            .text(68, 22, 'NEXT', {
                fontFamily: FONT,
                fontSize: '8px',
                color: '#ffffff',
                stroke: '#27608a',
                strokeThickness: 2,
            })
            .setOrigin(0.5);

        this.barrel = barrel;
        this.loadedBubble = loadedBubble;
        this.nextBubble = nextBubble;

        this.add([baseShadow, base, baseGlow, baseCore, barrel, nextBackdrop, spinner, nextBubble, nextHit, nextLabel]);

        this.setDepth(30);
        scene.add.existing(this);

        this.refreshTextures();
    }

    setOnBubbleSwap(callback: () => boolean): void {
        this.onBubbleSwap = callback;
    }

    /**
     * Installs a smart colour picker used whenever the queue advances. When
     * set it replaces the random pool pick so served colours always make sense
     * for the current board state.
     */
    setColorPicker(picker: (() => BubbleColorName) | null): void {
        this.colorPicker = picker;
    }

    swapWithNext(): boolean {
        if (!this.scene || !this.active || (this.onBubbleSwap && !this.onBubbleSwap())) {
            return false;
        }

        const previous = this.currentColor;
        this.currentColor = this.nextColor;
        this.nextColor = this.colorPool.includes(previous)
            ? previous
            : this.pickColor();
        this.refreshTextures();
        this.loadedBubble.setAlpha(0.72);
        this.nextBubble.setAlpha(0.72);
        this.scene.tweens.add({ targets: [this.loadedBubble, this.nextBubble], alpha: 1, duration: 140 });
        return true;
    }

    setColorPool(colors: BubbleColorName[]): void {
        this.colorPool = colors.length > 0 ? colors : [...COLOR_NAMES];

        if (!this.colorPool.includes(this.currentColor)) {
            this.currentColor = this.pickColor();
        }

        if (!this.colorPool.includes(this.nextColor)) {
            this.nextColor = this.pickColor();
        }

        this.refreshTextures();
    }

    setCurrentColor(color: BubbleColorName): void {
        this.currentColor = color;
        this.refreshTextures();
    }

    /** Sets the previewed next bubble (used by the smart queue sync). */
    setNextColor(color: BubbleColorName): void {
        this.nextColor = color;
        this.refreshTextures();
    }

    setCurrentFireTint(fire: boolean): void {
        this.loadedBubble.setTint(fire ? 0xff8a1f : 0xffffff);
        this.loadedBubble.setAlpha(fire ? 0.96 : 1);
    }

    setLoadedPower(power: 'bomb' | 'fireball' | null, texture: string | null = null): void {
        if (power && texture) {
            this.loadedBubble.setTexture(texture);
            this.loadedBubble.setDisplaySize(BUBBLE_DIAMETER * 1.05, BUBBLE_DIAMETER * 1.05);
            this.loadedBubble.clearTint();
            this.loadedBubble.setAlpha(1);
        } else {
            this.loadedBubble.setDisplaySize(BUBBLE_DIAMETER, BUBBLE_DIAMETER);
            this.refreshTextures();
        }
    }

    setAimAt(x: number, y: number): void {
        const offsetX = x - this.x;
        const offsetY = y - this.y;

        // A pointer at or below the launcher can never produce a downward shot.
        // Snap to the nearest upward limit instead, and keep the current aim
        // when the pointer is directly beneath the launcher.
        if (offsetY >= 0) {
            if (Math.abs(offsetX) < 0.5) {
                return;
            }

            this.setAim(offsetX > 0 ? MAX_AIM_ANGLE : -MAX_AIM_ANGLE);
            return;
        }

        this.setAim(Math.atan2(offsetX, -offsetY));
    }

    setAim(angle: number): void {
        this.aimAngle = Math.max(-MAX_AIM_ANGLE, Math.min(MAX_AIM_ANGLE, angle));
        this.barrel.setRotation(this.aimAngle);
    }

    rotateAim(deltaRadians: number): void {
        this.setAim(this.aimAngle + deltaRadians);
    }

    getAimAngle(): number {
        return this.aimAngle;
    }

    getMuzzlePosition(): Velocity {
        return {
            x: this.x + Math.sin(this.aimAngle) * BARREL_TIP,
            y: this.y - Math.cos(this.aimAngle) * BARREL_TIP,
        };
    }

    getLaunchVelocity(speed: number): Velocity {
        return {
            x: Math.sin(this.aimAngle) * speed,
            y: -Math.cos(this.aimAngle) * speed,
        };
    }

    consume(): BubbleColorName {
        const fired = this.currentColor;

        this.currentColor = this.nextColor;
        this.nextColor = this.pickColor();
        this.refreshTextures();

        return fired;
    }

    private pickColor(): BubbleColorName {
        if (this.colorPicker) {
            const picked = this.colorPicker();
            return picked ?? this.colorPool[0];
        }

        return this.colorPool[Math.floor(Math.random() * this.colorPool.length)];
    }

    private refreshTextures(): void {
        this.loadedBubble.setTexture(bubbleTexture(this.currentColor));
        this.nextBubble.setTexture(bubbleTexture(this.nextColor));
    }
}
