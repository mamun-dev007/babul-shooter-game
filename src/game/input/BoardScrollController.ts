import { GRID_TOP } from '../config';
import { boardViewBottomY, worldWidth } from '../layout';
import type { GridSystem } from '../systems/GridSystem';

/**
 * Natural drag scrolling for the bubble board (finger on mobile, mouse on
 * desktop). Only visible when the board is taller than the viewport: dragging
 * up/down moves the existing bubbles through `GridSystem.setScrollOffset`,
 * which never creates, removes or respawns a bubble.
 *
 * The controller deliberately uses invisible mechanics: there is no scrollbar
 * or thumb to click — the board itself is the handle. A vertical-dominant drag
 * (past a small threshold) becomes a scroll gesture and cancels any pending
 * aim/fire input so releasing the drag never shoots a bubble.
 */

/** Vertical distance a pointer must travel before a press becomes a scroll. */
const DRAG_START_PX = 10;
/** How strongly the live drag preserves momentum for the release glide. */
const VELOCITY_SMOOTHING = 0.35;
/** Per-frame pull the glide decays with (half-life ≈ 220 ms). */
const INERTIA_DECAY_PER_MS = 0.0031;
/** Speed below which the glide is stopped to avoid endless micro-drift. */
const INERTIA_STOP_PX_PER_S = 24;
/** Dragged pixels map 1:1 to board pixels, clamped for very fast flicks. */
const MAX_TRACK_PX_PER_EVENT = 90;

export interface BoardScrollConfig {
    grid: GridSystem;
    /** Scrolling is ignored while a shot is in flight, the game is paused or ended. */
    canScroll: () => boolean;
    /** Called once when a drag becomes a scroll gesture; the scene cancels aim/fire. */
    onScrollStart?: () => void;
    /** Called whenever user motion scrolled the board (aim guide refresh). */
    onScroll?: () => void;
}

/** Pure gesture test: vertical-dominant movement past the start threshold. */
export const shouldStartBoardScroll = (dx: number, dy: number): boolean =>
    Math.abs(dy) >= DRAG_START_PX && Math.abs(dy) > Math.abs(dx) * 1.35;

/** Pure inertia step: exponential decay, clamped below the stop speed. */
export const decayedVelocity = (velocityPxPerS: number, deltaMs: number): number => {
    const next = velocityPxPerS * Math.exp(-INERTIA_DECAY_PER_MS * deltaMs);
    return Math.abs(next) < INERTIA_STOP_PX_PER_S ? 0 : next;
};

export class BoardScrollController {
    private readonly scene: Phaser.Scene;
    private readonly config: BoardScrollConfig;
    private pointerId = -1;
    private lastX = 0;
    private lastY = 0;
    private startUsed = false;
    private velocityPxPerS = 0;
    private lastMoveTime = 0;

    /** True while the player is actively dragging the board. */
    get isDragging(): boolean {
        return this.pointerId !== -1 && this.startUsed;
    }

    /** True while dragging or gliding (used to keep the aim guide settled). */
    get isEngaged(): boolean {
        return this.isDragging || Math.abs(this.velocityPxPerS) > 0;
    }

    constructor(scene: Phaser.Scene, config: BoardScrollConfig) {
        this.scene = scene;
        this.config = config;

        scene.input.on('pointerdown', this.handlePointerDown, this);
        scene.input.on('pointermove', this.handlePointerMove, this);
        scene.input.on('pointerup', this.handlePointerUp, this);
        scene.input.on('pointerupoutside', this.handlePointerUp, this);
        scene.input.on('wheel', this.handleWheel, this);
    }

    /** Applies inertia glide; freezes instantly when gameplay seeks stillness. */
    update(deltaMs: number): void {
        if (this.isDragging) {
            return;
        }

        if (Math.abs(this.velocityPxPerS) > 0 && this.config.canScroll()) {
            this.config.grid.scrollBy((this.velocityPxPerS * deltaMs) / 1000);
            this.velocityPxPerS = decayedVelocity(this.velocityPxPerS, deltaMs);
            this.config.onScroll?.();
            return;
        }

        this.velocityPxPerS = 0;
    }

    destroy(): void {
        this.scene.input.off('pointerdown', this.handlePointerDown, this);
        this.scene.input.off('pointermove', this.handlePointerMove, this);
        this.scene.input.off('pointerup', this.handlePointerUp, this);
        this.scene.input.off('pointerupoutside', this.handlePointerUp, this);
        this.scene.input.off('wheel', this.handleWheel, this);
        this.pointerId = -1;
        this.velocityPxPerS = 0;
    }

    private inBoardBand(pointer: Phaser.Input.Pointer): boolean {
        return (
            pointer.y >= GRID_TOP - 4 &&
            pointer.y <= boardViewBottomY() &&
            pointer.x >= 0 &&
            pointer.x <= worldWidth()
        );
    }

    private handlePointerDown(pointer: Phaser.Input.Pointer): void {
        // A new press always takes over and stops any glide.
        this.pointerId = -1;
        this.velocityPxPerS = 0;

        if (!this.inBoardBand(pointer) || !this.config.canScroll()) {
            return;
        }

        this.pointerId = pointer.id;
        this.lastX = pointer.x;
        this.lastY = pointer.y;
        this.lastMoveTime = performance.now();
        this.startUsed = false;
    }

    private handlePointerMove(pointer: Phaser.Input.Pointer): void {
        if (pointer.id !== this.pointerId || !this.config.canScroll()) {
            return;
        }

        const dx = pointer.x - this.lastX;
        const dy = pointer.y - this.lastY;

        // Track the pointer continuously so the gesture decision compares
        // incremental movement, not movement since the press.
        this.lastX = pointer.x;
        this.lastY = pointer.y;

        if (!this.startUsed) {
            if (!shouldStartBoardScroll(dx, dy)) {
                return;
            }

            this.startUsed = true;
            this.config.onScrollStart?.();
        }

        const stepY = Math.max(-MAX_TRACK_PX_PER_EVENT, Math.min(MAX_TRACK_PX_PER_EVENT, dy));
        const now = performance.now();
        const elapsedS = Math.max(0.006, (now - this.lastMoveTime) / 1000);
        const instantVelocity = dy / elapsedS;
        this.velocityPxPerS =
            this.velocityPxPerS * (1 - VELOCITY_SMOOTHING) + instantVelocity * VELOCITY_SMOOTHING;

        if (!Number.isFinite(this.velocityPxPerS)) {
            this.velocityPxPerS = 0;
        }

        this.config.grid.scrollBy(stepY);
        this.lastMoveTime = now;
        this.config.onScroll?.();
    }

    private handlePointerUp(pointer: Phaser.Input.Pointer): void {
        if (pointer.id !== this.pointerId) {
            return;
        }

        // Keep the tracked velocity as the glide seed; stop instantly when a
        // gesture never became a scroll.
        if (!this.startUsed) {
            this.velocityPxPerS = 0;
        }

        this.pointerId = -1;
        this.startUsed = false;
    }

    private handleWheel(
        pointer: Phaser.Input.Pointer,
        _over: Phaser.GameObjects.GameObject[],
        _deltaX: number,
        deltaY: number
    ): void {
        if (!this.inBoardBand(pointer) || !this.config.canScroll()) {
            return;
        }

        this.config.grid.scrollBy(deltaY * 0.8);
        this.config.onScroll?.();
    }
}
