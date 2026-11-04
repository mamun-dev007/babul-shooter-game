import {
    BUBBLE_RADIUS,
    GRID_COLS,
    GRID_ROWS,
    GRID_TOP,
    ROW_HEIGHT,
    type BubbleColorName,
} from '../config';
import { boardViewBottomY, dangerLineY } from '../layout';
import { Bubble } from '../objects/Bubble';
import {
    cellCenter,
    chooseSnapCell,
    isInsideGrid,
    neighbourCells as geometryNeighbours,
    type Cell,
    type Point,
} from './geometry';
import {
    boardScrollMetrics,
    clampScrollOffset,
    type BoardScrollMetrics,
} from './gridScroll';

export type { Cell, Point } from './geometry';

export class GridSystem {
    private readonly scene: Phaser.Scene;
    private cells: (Bubble | null)[][] = [];
    private parity = 0;
    private scrollOffset = 0;
    private mask: Phaser.Display.Masks.GeometryMask | null = null;
    private ceilingDropsEnabled = false;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
        this.rebuildCells();
    }

    get bubbleCount(): number {
        return this.getBubbles().length;
    }

    get scrollOffsetY(): number {
        return this.scrollOffset;
    }

    get scrollMetrics(): BoardScrollMetrics {
        return boardScrollMetrics(
            this.contentTop,
            this.contentBottom,
            GRID_TOP,
            boardViewBottomY()
        );
    }

    get minScrollOffset(): number {
        return this.scrollMetrics.minOffset;
    }

    /** Ceiling collision follows the scrolled board instead of staying fixed. */
    get ceilingY(): number {
        return GRID_TOP + BUBBLE_RADIUS + this.scrollOffset;
    }

    /**
     * Ceiling used for shots and aim prediction. When the board is scrolled the
     * real top row is off-screen, so the projectile stops at the top of the
     * visible band instead of vanishing into hidden rows.
     */
    get collisionCeilingY(): number {
        return Math.max(this.ceilingY, GRID_TOP + BUBBLE_RADIUS);
    }

    /** Base (unscrolled) top and bottom of the occupied board content. */
    get contentTop(): number {
        return GRID_TOP + BUBBLE_RADIUS;
    }

    get contentBottom(): number {
        const maxRow = this.maxOccupiedRow();
        return GRID_TOP + BUBBLE_RADIUS + maxRow * ROW_HEIGHT + BUBBLE_RADIUS;
    }

    positionFor(row: number, col: number): Point {
        const position = cellCenter(row, col, this.parity);
        position.y += this.scrollOffset;
        return position;
    }

    setMask(mask: Phaser.Display.Masks.GeometryMask | null): void {
        this.mask = mask;

        for (const bubble of this.getBubbles()) {
            if (mask) {
                bubble.setMask(mask);
            } else {
                bubble.clearMask();
            }
        }
    }

    setCeilingDropsEnabled(enabled: boolean): void {
        this.ceilingDropsEnabled = enabled;
    }

    /**
     * Live world reflow: re-clamps the scroll against the current viewport and
     * repositions every bubble (horizontal centres move when the world widens,
     * vertical positions follow the re-clamped scroll). Only existing bubbles
     * are moved — never created, removed or respawned.
     */
    relayout(): void {
        this.setScrollOffset(this.scrollOffset);
    }

    /**
     * Moves the board viewport. This only repositions existing bubbles; it
     * never creates, removes or respawns a bubble.
     */
    setScrollOffset(offset: number): void {
        this.scrollOffset = clampScrollOffset(offset, this.scrollMetrics);

        for (const bubble of this.getBubbles()) {
            const position = this.positionFor(bubble.row, bubble.col);
            bubble.setPosition(position.x, position.y);
        }
    }

    scrollBy(delta: number): void {
        this.setScrollOffset(this.scrollOffset + delta);
    }

    /**
     * Anchors the occupied board so its frontier (bottom edge) sits at the
     * viewport's vertical middle: the formation occupies the upper-middle of
     * the playfield and extends upward, leaving the lower half clear for the
     * shooter and trajectory. Boards that already end above the middle stay
     * ceiling-aligned. Only existing bubbles are repositioned.
     */
    followBoard(): void {
        this.setScrollOffset(this.minScrollOffset);
    }

    maxOccupiedRow(): number {
        let maxRow = 0;

        for (const bubble of this.getBubbles()) {
            maxRow = Math.max(maxRow, bubble.row);
        }

        return maxRow;
    }

    minOccupiedRow(): number {
        let minRow = GRID_ROWS - 1;
        let found = false;

        for (const bubble of this.getBubbles()) {
            minRow = Math.min(minRow, bubble.row);
            found = true;
        }

        return found ? minRow : 0;
    }

    bubbleAt(row: number, col: number): Bubble | null {
        if (!this.isInside(row, col)) {
            return null;
        }

        return this.cells[row][col];
    }

    /**
     * Bubbles currently inside the visible board band. Off-screen rows stay in
     * the grid (scrolling can reveal them) but cannot be hit by a projectile.
     */
    shootableBubbles(): Bubble[] {
        return this.getBubbles().filter((bubble) => this.isBubbleShootable(bubble));
    }

    isBubbleShootable(bubble: Bubble): boolean {
        const position = this.positionFor(bubble.row, bubble.col);
        const viewBottom = boardViewBottomY();
        return (
            position.y - BUBBLE_RADIUS >= GRID_TOP - 0.5 &&
            position.y + BUBBLE_RADIUS <= viewBottom + 0.5
        );
    }

    private isCellShootable(row: number, col: number): boolean {
        const position = this.positionFor(row, col);
        const viewBottom = boardViewBottomY();
        return (
            position.y - BUBBLE_RADIUS >= GRID_TOP - 0.5 &&
            position.y + BUBBLE_RADIUS <= viewBottom + 0.5
        );
    }

    spawnBubble(row: number, col: number, color: BubbleColorName, animate = false): Bubble {
        // A cell can only ever hold one bubble. Returning the existing bubble
        // makes a repeated board build harmless instead of duplicating objects.
        const existing = this.cells[row]?.[col];

        if (existing) {
            return existing;
        }

        const position = this.positionFor(row, col);
        const bubble = new Bubble(this.scene, position.x, position.y, color);

        bubble.setCell(row, col);
        this.cells[row][col] = bubble;

        if (this.mask) {
            bubble.setMask(this.mask);
        }

        if (animate) {
            bubble.setScale(bubble.baseScale * 0.2);
            bubble.setAlpha(0);
            this.scene.tweens.add({
                targets: bubble,
                scale: bubble.baseScale,
                alpha: 1,
                duration: 220,
                ease: 'Back.easeOut',
            });
        }

        return bubble;
    }

    placeBubble(bubble: Bubble, row: number, col: number): void {
        if (!this.isInside(row, col)) {
            bubble.destroy();
            return;
        }

        // Remove any previous registration so a bubble can never occupy two
        // cells at once (and therefore can never overlap its own snapshot).
        if (
            this.isInside(bubble.row, bubble.col) &&
            this.cells[bubble.row][bubble.col] === bubble
        ) {
            this.cells[bubble.row][bubble.col] = null;
        }

        const existing = this.cells[row][col];

        if (existing && existing !== bubble) {
            existing.destroy();
        }

        this.cells[row][col] = bubble;
        bubble.setCell(row, col);

        const position = this.positionFor(row, col);
        bubble.snapTo(position.x, position.y);
    }

    clearBubble(bubble: Bubble): void {
        if (this.isInside(bubble.row, bubble.col) && this.cells[bubble.row][bubble.col] === bubble) {
            this.cells[bubble.row][bubble.col] = null;
        }

        bubble.setCell(-1, -1);
    }

    findSnapCell(x: number, y: number, hitCell: Cell | null): Cell | null {
        // cellCenter() works in unscrolled board coordinates, so remove the
        // viewport offset before comparing distances.
        const localY = y - this.scrollOffset;

        return chooseSnapCell({
            x,
            y: localY,
            hitCell,
            parity: this.parity,
            isFree: (cell) =>
                this.bubbleAt(cell.row, cell.col) === null &&
                this.isCellShootable(cell.row, cell.col),
            isConnected: (cell) =>
                this.isConnectedCell(cell.row, cell.col) &&
                this.isCellShootable(cell.row, cell.col),
        });
    }

    neighbourCells(row: number, col: number): Cell[] {
        return geometryNeighbours(row, col, this.parity);
    }

    colorCluster(row: number, col: number): Bubble[] {
        const start = this.bubbleAt(row, col);

        if (!start) {
            return [];
        }

        const cluster: Bubble[] = [];
        const visited = new Set<string>();
        const queue: Cell[] = [{ row, col }];

        while (queue.length > 0) {
            const current = queue.shift();

            if (!current) {
                break;
            }

            const key = this.cellKey(current.row, current.col);

            if (visited.has(key)) {
                continue;
            }

            const bubble = this.bubbleAt(current.row, current.col);

            if (!bubble || bubble.color !== start.color) {
                continue;
            }

            visited.add(key);
            cluster.push(bubble);

            for (const neighbour of this.neighbourCells(current.row, current.col)) {
                if (!visited.has(this.cellKey(neighbour.row, neighbour.col))) {
                    queue.push(neighbour);
                }
            }
        }

        return cluster;
    }

    floatingBubbles(): Bubble[] {
        const anchored = new Set<string>();
        const queue: Cell[] = [];

        for (let col = 0; col < GRID_COLS; col++) {
            if (this.cells[0][col]) {
                queue.push({ row: 0, col });
            }
        }

        while (queue.length > 0) {
            const current = queue.shift();

            if (!current) {
                break;
            }

            const key = this.cellKey(current.row, current.col);

            if (anchored.has(key) || !this.bubbleAt(current.row, current.col)) {
                continue;
            }

            anchored.add(key);

            for (const neighbour of this.neighbourCells(current.row, current.col)) {
                if (!anchored.has(this.cellKey(neighbour.row, neighbour.col))) {
                    queue.push(neighbour);
                }
            }
        }

        return this.getBubbles().filter(
            (bubble) => !anchored.has(this.cellKey(bubble.row, bubble.col))
        );
    }

    presentColors(): BubbleColorName[] {
        return Array.from(new Set(this.getBubbles().map((bubble) => bubble.color)));
    }

    getBubbles(): Bubble[] {
        const bubbles: Bubble[] = [];

        for (let row = 0; row < GRID_ROWS; row++) {
            for (let col = 0; col < GRID_COLS; col++) {
                const bubble = this.cells[row][col];

                if (bubble) {
                    bubbles.push(bubble);
                }
            }
        }

        return bubbles;
    }

    isEmpty(): boolean {
        return this.getBubbles().length === 0;
    }

    isDanger(): boolean {
        const dangerY = dangerLineY();
        return this.getBubbles().some((bubble) => {
            const position = this.positionFor(bubble.row, bubble.col);
            return position.y + BUBBLE_RADIUS >= dangerY;
        });
    }

    wouldOverflowOnDrop(): boolean {
        const dangerY = dangerLineY();
        return this.getBubbles().some((bubble) => {
            const position = this.positionFor(bubble.row, bubble.col);
            return position.y + BUBBLE_RADIUS + ROW_HEIGHT >= dangerY;
        });
    }

    dropRow(pickColor: () => BubbleColorName): boolean {
        // Fixed progression boards must never gain bubbles after generation.
        if (!this.ceilingDropsEnabled || this.wouldOverflowOnDrop()) {
            return false;
        }

        const removed = this.cells.pop();
        removed?.forEach((bubble) => bubble?.destroy());

        this.cells.unshift(new Array<Bubble | null>(GRID_COLS).fill(null));
        this.parity = (this.parity + 1) % 2;

        for (let row = 0; row < GRID_ROWS; row++) {
            for (let col = 0; col < GRID_COLS; col++) {
                const bubble = this.cells[row][col];

                if (!bubble) {
                    continue;
                }

                bubble.setCell(row, col);
                const position = this.positionFor(row, col);
                bubble.snapTo(position.x, position.y, 200);
            }
        }

        for (let col = 0; col < GRID_COLS; col++) {
            this.spawnBubble(0, col, pickColor(), true);
        }

        return true;
    }

    destroyAll(): void {
        for (const bubble of this.getBubbles()) {
            bubble.destroy();
        }

        this.parity = 0;
        this.rebuildCells();
    }

    private rebuildCells(): void {
        this.cells = [];

        for (let row = 0; row < GRID_ROWS; row++) {
            this.cells.push(new Array<Bubble | null>(GRID_COLS).fill(null));
        }
    }

    private isInside(row: number, col: number): boolean {
        return isInsideGrid(row, col);
    }

    private isConnectedCell(row: number, col: number): boolean {
        if (row === 0) {
            return true;
        }

        return this.neighbourCells(row, col).some(
            (cell) => this.bubbleAt(cell.row, cell.col) !== null
        );
    }

    private cellKey(row: number, col: number): string {
        return `${row}:${col}`;
    }
}
