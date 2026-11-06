import { Input, type Scene } from 'phaser';
import type { Shooter } from '../objects/Shooter';
import { aimBandBottomY, aimBandTopY } from '../layout';
import { isModalInputLocked } from './modalInputLock';

export interface AimControllerConfig {
    shooter: Shooter;
    /**
     * Optional playfield band override. When omitted the controller derives
     * the band from the responsive layout (`aimBandTopY` / `aimBandBottomY`)
     * on every check, so resizes never desync aiming from the playfield.
     * Pointer positions outside the band are never the playfield, which keeps
     * HUD taps and bottom controls from aiming, dragging or firing.
     */
    minPointerY?: number;
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
 *
 * Pointer lifecycle guarantees:
 * - A press is tracked by its pointer id, so a multi-touch interaction can
 *   never create two armed presses or fire twice from one finger.
 * - A press that begins on an interactive UI object (HUD buttons, popups,
 *   shooter swap targets) is UX input and never arms a shot.
 * - While any modal popup is open (`isModalInputLocked()`), all launcher
 *   input is locked: presses, moves and releases are swallowed for that
 *   pointer, so background shooting is impossible and popup clicks only
 *   trigger their own actions.
 * - `cancelPointerInput` swallows the in-flight release of every currently
 *   held pointer. This covers the resume/close case, where the gameobject
 *   handler closes the popup BEFORE the scene-level pointerdown for the
 *   same gesture runs: the closing pointer is captured while it is still
 *   down and can therefore neither arm nor fire after the popup closes.
 * - One release fires at most one bubble: the press latch clears before the
 *   fire callback runs, so duplicate `pointerup` deliveries are inert.
 */
export class AimController {
    private readonly scene: Scene;
    private readonly config: AimControllerConfig;
    private keys: AimKeys | null = null;
    /** Id of the pointer that pressed down inside the playfield, or null. */
    private pressedPointerId: number | null = null;
    /**
     * Ids of pointers whose gestures must be fully ignored (modal open,
     * popup/UI press, or cancelled). A swallowed pointer can neither arm,
     * aim, nor fire — including after the modal that caused the swallow
     * closes while the finger/mouse is still held. Each id is cleared by
     * its own pointerup.
     */
    private readonly swallowedPointerIds = new Set<number>();

    constructor(scene: Scene, config: AimControllerConfig) {
        this.scene = scene;
        this.config = config;

        scene.input.on('pointermove', this.handlePointerMove, this);
        scene.input.on('pointerdown', this.handlePointerDown, this);
        scene.input.on('pointerup', this.handlePointerUp, this);
        // Releases outside the canvas surface only surface as this event;
        // without it a drag that leaves the screen would never stop pressing.
        scene.input.on('pointerupoutside', this.handlePointerUp, this);

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

        if (this.config.canAim() && !isModalInputLocked()) {
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

        if (Input.Keyboard.JustDown(this.keys.space) && this.config.canFire() && !isModalInputLocked()) {
            this.config.onFire();
        }
    }

    destroy(): void {
        this.scene.input.off('pointermove', this.handlePointerMove, this);
        this.scene.input.off('pointerdown', this.handlePointerDown, this);
        this.scene.input.off('pointerup', this.handlePointerUp, this);
        this.scene.input.off('pointerupoutside', this.handlePointerUp, this);
        this.scene.input.keyboard?.removeCapture(KEY_CAPTURE);
        this.pressedPointerId = null;
        this.swallowedPointerIds.clear();
    }

    /**
     * Disarms all in-flight pointer input and swallows every currently held
     * pointer. The release of a swallowed press is ignored, so board-scroll
     * gestures, pauses, bubble swaps and — crucially — the popup button
     * press that closes a modal can never end in a shot, even though the
     * scene-level pointerdown for that same gesture runs after the popup
     * has already closed. An explicit pointer id may be passed when the
     * caller knows it (e.g. a popup button handler).
     */
    cancelPointerInput(pointerId?: number): void {
        if (this.pressedPointerId !== null) {
            this.swallowedPointerIds.add(this.pressedPointerId);
            this.pressedPointerId = null;
        }

        if (pointerId !== undefined) {
            this.swallowedPointerIds.add(pointerId);
            return;
        }

        // Capture every pointer that is physically down right now. On the
        // resume/close path the closing pointer is down but not yet armed
        // (its scene-level pointerdown has not run), so the armed-press
        // case above alone cannot see it — the manager's pointer list can.
        const pointers = this.scene.input.manager?.pointers;
        if (Array.isArray(pointers)) {
            pointers.forEach((pointer) => {
                if (pointer?.isDown) {
                    this.swallowedPointerIds.add(pointer.id);
                }
            });
        }
    }

    private handlePointerMove(pointer: Phaser.Input.Pointer): void {
        if (this.swallowedPointerIds.has(pointer.id)) {
            return;
        }

        if (isModalInputLocked() || !this.config.canAim() || !this.isPlayfieldPointer(pointer)) {
            return;
        }

        this.config.shooter.setAimAt(pointer.x, pointer.y);
    }

    private handlePointerDown(pointer: Phaser.Input.Pointer): void {
        // A fresh press always re-evaluates cleanly: an armed press from a
        // previous interaction must not leak in. Swallowed pointers stay
        // swallowed until their own release (see below).
        this.pressedPointerId = null;

        // A pointer swallowed by a modal close / cancel must never arm,
        // even though the popup it started on is already gone by the time
        // this scene-level handler runs.
        if (this.swallowedPointerIds.has(pointer.id)) {
            return;
        }

        // Only the primary button means "shoot" — right/middle clicks and
        // context-menu shortcuts never aim or fire.
        if (pointer.button !== 0) {
            return;
        }

        // While any modal popup is open, launcher input is fully locked.
        // The press is swallowed so its move/release stay inert even if
        // the modal closes while the finger/mouse is still held.
        if (isModalInputLocked() || !this.config.canAim()) {
            this.swallowedPointerIds.add(pointer.id);
            return;
        }

        // Presses that start on an interactive UI object (HUD toolbar, pause
        // buttons, popups, shooter swap targets) belong to the UI layer.
        // Phaser delivers these gameobject events before the scene-level
        // pointerdown, so this check also covers handlers that already ran.
        if (this.isOverInteractiveUi(pointer)) {
            this.swallowedPointerIds.add(pointer.id);
            return;
        }

        if (!this.isPlayfieldPointer(pointer)) {
            return;
        }

        this.pressedPointerId = pointer.id;
        this.config.shooter.setAimAt(pointer.x, pointer.y);
    }

    private handlePointerUp(pointer: Phaser.Input.Pointer): void {
        // A swallowed press releases silently exactly once — the latch
        // clears on its first delivery and never fires.
        if (this.swallowedPointerIds.delete(pointer.id)) {
            if (this.pressedPointerId === pointer.id) {
                this.pressedPointerId = null;
            }
            return;
        }

        // Exactly one fire per pointer interaction: the press must still be
        // armed, i.e. this release belongs to the pointer that pressed down.
        // Clearing the latch here also makes any duplicated up event inert.
        if (this.pressedPointerId !== pointer.id) {
            return;
        }

        this.pressedPointerId = null;

        if (
            pointer.button !== 0 ||
            isModalInputLocked() ||
            !this.config.canFire() ||
            !this.isPlayfieldPointer(pointer)
        ) {
            return;
        }

        this.config.shooter.setAimAt(pointer.x, pointer.y);
        this.config.onFire();
    }

    private isOverInteractiveUi(pointer: Phaser.Input.Pointer): boolean {
        // hitTestPointer only checks interactive game objects (buttons,
        // overlays); the bubbles and backdrop never match, so genuine
        // playfield presses stay armed.
        return this.scene.input.hitTestPointer(pointer).length > 0;
    }

    private isPlayfieldPointer(pointer: Phaser.Input.Pointer): boolean {
        const minY = this.config.minPointerY ?? aimBandTopY();
        const maxY = this.config.maxPointerY ?? aimBandBottomY();

        return pointer.y >= minY && pointer.y <= maxY;
    }
}
