import { Input, type Scene } from 'phaser';
import type { Shooter } from '../objects/Shooter';

export interface AimControllerConfig {
    shooter: Shooter;
    /** Pointer positions outside this band are ignored so HUD taps never aim or fire. */
    minPointerY: number;
    maxPointerY?: number;
    canAim: () => boolean;
    canFire: () => boolean;
    onFire: () => void;
    onPause: () => void;
}

interface AimKeys {
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
    a: Phaser.Input.Keyboard.Key;
    d: Phaser.Input.Keyboard.Key;
    space: Phaser.Input.Keyboard.Key;
    pause: Phaser.Input.Keyboard.Key;
}

const KEYBOARD_AIM_SPEED = 0.0022;
const KEY_CAPTURE = 'LEFT,RIGHT,A,D,SPACE,P';

/**
 * Translates mouse, touch and keyboard input into launcher aim changes and
 * fire requests. It owns input plumbing only; scene state and shot resolution
 * stay in GameScene.
 */
export class AimController {
    private readonly scene: Scene;
    private readonly config: AimControllerConfig;
    private keys: AimKeys | null = null;
    private pressedInPlayfield = false;
    private ignoreNextPointerUp = false;

    constructor(scene: Scene, config: AimControllerConfig) {
        this.scene = scene;
        this.config = config;

        scene.input.on('pointermove', this.handlePointerMove, this);
        scene.input.on('pointerdown', this.handlePointerDown, this);
        scene.input.on('pointerup', this.handlePointerUp, this);

        const keyboard = scene.input.keyboard;

        if (!keyboard) {
            return;
        }

        this.keys = {
            left: keyboard.addKey('LEFT'),
            right: keyboard.addKey('RIGHT'),
            a: keyboard.addKey('A'),
            d: keyboard.addKey('D'),
            space: keyboard.addKey('SPACE'),
            pause: keyboard.addKey('P'),
        };

        keyboard.addCapture(KEY_CAPTURE);
    }

    update(deltaMs: number): void {
        if (!this.keys) {
            return;
        }

        if (Input.Keyboard.JustDown(this.keys.pause)) {
            this.config.onPause();
        }

        if (this.config.canAim()) {
            let direction = 0;

            if (this.keys.left.isDown || this.keys.a.isDown) {
                direction -= 1;
            }

            if (this.keys.right.isDown || this.keys.d.isDown) {
                direction += 1;
            }

            if (direction !== 0) {
                this.config.shooter.rotateAim(direction * KEYBOARD_AIM_SPEED * deltaMs);
            }
        }

        if (Input.Keyboard.JustDown(this.keys.space) && this.config.canFire()) {
            this.config.onFire();
        }
    }

    destroy(): void {
        this.scene.input.off('pointermove', this.handlePointerMove, this);
        this.scene.input.off('pointerdown', this.handlePointerDown, this);
        this.scene.input.off('pointerup', this.handlePointerUp, this);
        this.scene.input.keyboard?.removeCapture(KEY_CAPTURE);
        this.pressedInPlayfield = false;
        this.ignoreNextPointerUp = false;
    }

    cancelPointerInput(): void {
        this.pressedInPlayfield = false;
        this.ignoreNextPointerUp = true;
    }

    private handlePointerMove(pointer: Phaser.Input.Pointer): void {
        if (!this.config.canAim() || !this.isPlayfieldPointer(pointer)) {
            return;
        }

        this.config.shooter.setAimAt(pointer.x, pointer.y);
    }

    private handlePointerDown(pointer: Phaser.Input.Pointer): void {
        this.pressedInPlayfield = false;

        if (!this.config.canAim() || !this.isPlayfieldPointer(pointer)) {
            return;
        }

        this.pressedInPlayfield = true;
        this.config.shooter.setAimAt(pointer.x, pointer.y);
    }

    private handlePointerUp(pointer: Phaser.Input.Pointer): void {
        if (this.ignoreNextPointerUp) {
            this.ignoreNextPointerUp = false;
            this.pressedInPlayfield = false;
            return;
        }

        // Require the press to start in the playfield. This prevents a pointerup
        // from a HUD button (or the pause overlay) from firing a bubble.
        const shouldFire =
            this.pressedInPlayfield &&
            this.config.canFire() &&
            this.isPlayfieldPointer(pointer);

        this.pressedInPlayfield = false;

        if (!shouldFire) {
            return;
        }

        this.config.shooter.setAimAt(pointer.x, pointer.y);
        this.config.onFire();
    }

    private isPlayfieldPointer(pointer: Phaser.Input.Pointer): boolean {
        return (
            pointer.y >= this.config.minPointerY &&
            (this.config.maxPointerY === undefined || pointer.y <= this.config.maxPointerY)
        );
    }
}
