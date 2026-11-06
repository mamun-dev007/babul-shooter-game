import { GameObjects, Math as PhaserMath } from 'phaser';
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
    /** Fire Launcher Mode visual (animated flame) replacing the loaded bubble. */
    private fireLauncher: Phaser.GameObjects.Container | null = null;
    private fireSparkTimer: Phaser.Time.TimerEvent | null = null;

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

    /**
     * Fire Launcher Mode: replaces the normal bubble inside the launcher with
     * an animated burning flame at the bubble's exact position. Nothing is
     * moved or resized — the launcher, barrel and swap widgets stay put, and
     * the flame is extinguished layer by layer when the mode ends.
     */
    setFireLauncherMode(active: boolean): void {
        if (active) {
            this.enableFireLauncher();
        } else {
            this.disableFireLauncher();
        }
    }

    private enableFireLauncher(): void {
        if (this.fireLauncher || !this.scene) {
            return; // already burning
        }

        // The normal bubble icon disappears for the whole mode.
        this.loadedBubble.setVisible(false);

        // Attach the flame to the barrel, not the Shooter container. Barrel
        // rotation and any launcher reflow therefore transform the fire icon
        // exactly like the normal loaded bubble.
        const flame = this.scene.add.container(0, -BARREL_TIP);

        // Soft glowing light around the fire: a slow breathing pulse in
        // orange — screen-cheap (one circle, one tween). Added first so it
        // renders behind every flame layer.
        const glow = this.scene.add.circle(0, 3, 27, 0xff7a1f, 0.3);
        this.scene.tweens.add({
            targets: glow,
            scale: 1.16,
            alpha: 0.12,
            duration: 640,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });
        flame.add(glow);

        // Three stacked flame layers (red body, orange wrap, yellow core)
        // flicker independently: scaleY stretches and a small sway makes the
        // fire read as alive without ever touching the launcher geometry.
        const layers = [
            { y: 4, width: 27, height: 32, color: 0xe8420e, alpha: 0.94, flicker: 470, stretch: 0.3, sway: 1.6 },
            { y: 1, width: 20, height: 25, color: 0xff8d1f, alpha: 0.97, flicker: 380, stretch: 0.24, sway: -2.1 },
            { y: -2, width: 13, height: 17, color: 0xffd24a, alpha: 1, flicker: 300, stretch: 0.34, sway: 1.2 },
        ];

        for (const layer of layers) {
            const tongue = this.scene.add.circle(0, layer.y, layer.width / 2, layer.color, layer.alpha);
            tongue.setDisplaySize(layer.width, layer.height);
            this.scene.tweens.add({
                targets: tongue,
                scaleY: { from: 1, to: 1 + layer.stretch },
                x: { from: -layer.sway, to: layer.sway },
                duration: layer.flicker,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut',
            });
            flame.add(tongue);
        }

        // White-hot centre that pulses like the heart of a real fire.
        const core = this.scene.add.circle(0, -4, 3.2, 0xfff2c0, 1);
        this.scene.tweens.add({
            targets: core,
            alpha: { from: 0.65, to: 1 },
            scale: { from: 0.8, to: 1.25 },
            duration: 260,
            yoyo: true,
            repeat: -1,
            ease: 'Quad.easeInOut',
        });
        flame.add(core);

        this.fireLauncher = flame;
        this.barrel.add(flame);

        // Subtle rising sparks: a few small circles at a time, each fading
        // and destroying itself — never more than a handful live at once.
        this.fireSparkTimer = this.scene.time.addEvent({
            delay: 150,
            loop: true,
            callback: () => this.spawnFireSpark(),
        });
    }

    private spawnFireSpark(): void {
        if (!this.scene || !this.fireLauncher) {
            return;
        }

        const spark = this.scene.add.circle(
            PhaserMath.Between(-9, 9),
            PhaserMath.Between(-4, 4),
            PhaserMath.FloatBetween(1.4, 2.8),
            PhaserMath.RND.pick([0xffd24a, 0xff8d1f, 0xe8420e]),
            PhaserMath.FloatBetween(0.7, 0.95)
        );
        this.fireLauncher.add(spark);

        this.scene.tweens.add({
            targets: spark,
            y: spark.y - PhaserMath.Between(18, 32),
            scale: 0.15,
            alpha: 0,
            duration: PhaserMath.Between(420, 720),
            ease: 'Quad.easeOut',
            onComplete: () => spark.destroy(),
        });
    }

    private disableFireLauncher(): void {
        this.fireSparkTimer?.remove();
        this.fireSparkTimer = null;
        this.fireLauncher?.destroy(true);
        this.fireLauncher = null;
        // Restore the normal loaded bubble exactly as it was (texture is
        // driven by refreshTextures; reveal is the only state change here).
        this.loadedBubble.setVisible(true);
    }

    setLoadedPower(power: 'bomb' | 'fireball' | null, texture: string | null = null): void {
        if (power && texture) {
            this.loadedBubble.setTexture(texture);
            this.loadedBubble.setDisplaySize(BUBBLE_DIAMETER * 1.05, BUBBLE_DIAMETER * 1.05);
            this.loadedBubble.clearTint();
            this.loadedBubble.setAlpha(1);
        } else {
            this.loadedBubble.setDisplaySize(BUBBLE_DIAMETER, BUBBLE_DIAMETER);
            this.loadedBubble.clearTint();
            this.refreshTextures();
        }
    }

    /** Shows the Bomb icon in the launcher while Bomb Launcher Mode is active. */
    setLoadedBomb(active: boolean): void {
        if (active) {
            this.loadedBubble.setTexture('powerup-bomb');
            this.loadedBubble.setDisplaySize(BUBBLE_DIAMETER * 1.12, BUBBLE_DIAMETER * 1.12);
            this.loadedBubble.clearTint();
            this.loadedBubble.setAlpha(1);
            this.loadedBubble.setVisible(true);
        } else {
            this.setLoadedPower(null);
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

    override destroy(fromScene?: boolean): void {
        // Never leave the spark timer ticking after the launcher is gone.
        this.fireSparkTimer?.remove();
        this.fireSparkTimer = null;
        this.fireLauncher = null;
        super.destroy(fromScene);
    }
}
