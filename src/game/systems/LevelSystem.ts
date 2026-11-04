import type { BubbleColorName } from '../config';
import { LEVELS, type ProgressionLevelDefinition } from '../data/levels';
import { attemptShotBudgetFor, starLimitsForShots } from '../data/levels/progression';
import { cellsFromRows, countLayoutBubbles } from '../data/levels/layout';
import { generateLevelLayout } from '../data/levels/randomLayout';
import {
    isLevelObjectiveComplete,
    levelTargetScore,
    objectiveLabel,
    starsForShots,
    type ShotStarLimits,
} from '../data/levels/scoring';
import type { GridSystem } from './GridSystem';
import { BubbleBoardState } from './BubbleBoardState';
import { smartShotBudget } from '../data/levels/shotAnalysis';

export type LevelStatus = 'playing' | 'won' | 'lost';

export interface LevelEndState {
    readonly score: number;
    readonly boardEmpty: boolean;
    readonly danger: boolean;
}

export interface BuildBoardOptions {
    /** Force a deterministic layout seed (tests and diagnostics). */
    seed?: number;
}

export class LevelSystem {
    private index = 0;
    private shotsUsed = 0;
    /** Extra bubbles granted by rewarded ads; cleared per level attempt. */
    private bonusShots = 0;
    private readonly boardState = new BubbleBoardState();
    private bubblesRemoved = 0;
    private lastShotRemovedBubbles = false;
    private lastLayout: {
        readonly pattern: string;
        readonly seed: number;
        readonly requiredShots: number;
    } | null = null;
    private attemptBudget: number | null = null;
    private attemptLimits: ShotStarLimits | null = null;

    get level(): ProgressionLevelDefinition {
        return LEVELS[this.index];
    }

    get levelIndex(): number {
        return this.index;
    }

    get levelId(): number {
        return this.level.id;
    }

    get levelNumber(): number {
        return this.index + 1;
    }

    get levelCount(): number {
        return LEVELS.length;
    }

    get hasNext(): boolean {
        return this.index < LEVELS.length - 1;
    }

    get shotAnalysis() {
        return smartShotBudget(this.level);
    }

    get estimatedRequiredShots(): number {
        return this.shotAnalysis.estimatedRequiredShots;
    }

    get mistakeAllowance(): number {
        return this.shotAnalysis.mistakeAllowance;
    }

    get bubblesRemovedCount(): number {
        return this.bubblesRemoved;
    }

    get lastShotRemovedAny(): boolean {
        return this.lastShotRemovedBubbles;
    }

    /** Effective shot budget of the attempt: the level budget + ad bonuses. */
    get maxShots(): number {
        return (this.attemptBudget ?? this.level.totalShots) + this.bonusShots;
    }

    /**
     * Shot-star limits of the current attempt. Before a board is built these
     * fall back to the per-level catalogue limits.
     */
    get shotStarLimits(): ShotStarLimits {
        return this.attemptLimits ?? {
            threeStarLimit: this.level.threeStarLimit,
            twoStarLimit: this.level.twoStarLimit,
            oneStarLimit: this.level.oneStarLimit,
        };
    }

    /** Shot budget of the current attempt: verified requirement + allowance. */
    get attemptShotBudget(): number {
        return this.maxShots;
    }

    get shotsUsedCount(): number {
        return this.shotsUsed;
    }

    get shotsRemaining(): number {
        return Math.max(0, this.maxShots - this.shotsUsed);
    }

    get canShoot(): boolean {
        return this.shotsRemaining > 0;
    }

    /** Zero means ceiling drops are disabled for this fixed board. */
    get untilNextDrop(): number {
        const interval = Math.max(0, Math.floor(this.level.shotsPerDrop));

        if (interval <= 0) {
            return 0;
        }

        const elapsed = this.shotsUsed % interval;
        return elapsed === 0 ? interval : interval - elapsed;
    }

    get targetScore(): number {
        return levelTargetScore(this.level);
    }

    get objectiveLabel(): string {
        return objectiveLabel(this.level);
    }

    get initialTargetCount(): number {
        return this.boardState.initial;
    }

    get remainingTargetCount(): number {
        return this.boardState.remaining;
    }

    get boardProgress(): number {
        return this.boardState.progress;
    }

    // Legacy score objective helper. Progression levels are clear-board only.
    hasReachedTarget(score: number): boolean {
        return isLevelObjectiveComplete(this.level, score, false);
    }

    /** Stars for the current (or supplied) shot count. */
    starsForShots(shotsUsed = this.shotsUsed): number {
        return starsForShots(this.shotStarLimits, shotsUsed);
    }

    /** Danger only loses when the level actually enables the danger line. */
    resolveStatus(state: LevelEndState): LevelStatus {
        if (state.danger && this.level.dangerEnabled !== false) {
            return 'lost';
        }

        if (state.boardEmpty && this.boardState.remaining === 0) {
            return 'won';
        }

        if (this.shotsRemaining <= 0) {
            return 'lost';
        }

        return 'playing';
    }

    load(index: number): void {
        this.index = Math.max(0, Math.min(LEVELS.length - 1, Math.floor(Number(index)) || 0));
        this.shotsUsed = 0;
        this.bonusShots = 0;
        this.bubblesRemoved = 0;
        this.lastShotRemovedBubbles = false;
        this.lastLayout = null;
        this.attemptBudget = null;
        this.attemptLimits = null;
        const bubbleCount = countLayoutBubbles(this.level);

        if (bubbleCount !== this.level.totalBubbles) {
            throw new Error(
                `Level ${this.level.id} (${this.level.name}) configures ${this.level.totalBubbles} bubbles but its layout contains ${bubbleCount}.`
            );
        }

        this.boardState.load(bubbleCount);
    }

    recordBubbleRemovals(count: number): void {
        const removed = Math.max(0, Math.floor(Number(count) || 0));
        this.bubblesRemoved += removed;
        this.lastShotRemovedBubbles = removed > 0;
    }

    /** Synchronize counters with the one authoritative board stored by GridSystem. */
    syncBoard(grid: GridSystem): void {
        this.boardState.sync(grid.bubbleCount);
    }

    get remainingProgress(): number {
        return this.boardProgress;
    }

    /** Generates the random starting board for this attempt. */
    buildBoard(grid: GridSystem, options: BuildBoardOptions = {}): void {
        // Every attempt gets a fresh random arrangement. The bubble count,
        // palette and the budget ceiling are fixed level configuration — the
        // pattern, colours, seed and *effective shot budget* follow the
        // actually generated puzzle.
        const generated = generateLevelLayout(this.level, { seed: options.seed });
        this.lastLayout = generated;

        // Algorithmic budget: the verified shot requirement of this exact board
        // plus the level's (shrinking) mistake allowance. Never below the
        // requirement, never above the catalog ceiling.
        this.attemptBudget = attemptShotBudgetFor(
            this.level.id,
            this.level.totalShots,
            generated.requiredShots
        );
        this.attemptLimits = starLimitsForShots(this.attemptBudget);

        const cells = cellsFromRows(generated.layout, this.level);

        if (cells.length !== this.level.totalBubbles) {
            throw new Error(
                `Level ${this.level.id} (${this.level.name}) generated ${cells.length} bubbles; expected ${this.level.totalBubbles}.`
            );
        }

        for (const cell of cells) {
            grid.spawnBubble(cell.row, cell.col, cell.color);
        }

        this.syncBoard(grid);
    }

    /** Metadata of the most recent random layout (pattern, seed, estimate). */
    get layoutMeta(): { readonly pattern: string; readonly seed: number; readonly requiredShots: number } | null {
        return this.lastLayout;
    }

    /** Palette used by ceiling drops. The starting layout itself never changes. */
    randomColor(): BubbleColorName {
        const palette = this.level.colors;
        return palette[Math.floor(Math.random() * palette.length)] ?? 'red';
    }

    /**
     * Grants rewarded-ad bonus bubbles to the current attempt. The existing
     * remaining count is never overwritten — the bonus extends the budget, so
     * e.g. 5 remaining + 3 bonus = 8 shootable bubbles. Returns the new
     * remaining count so callers can update the HUD immediately.
     */
    addExtraShots(count: number): number {
        this.bonusShots += Math.max(0, Math.floor(count));
        return this.shotsRemaining;
    }

    registerShot(): boolean {
        if (this.shotsUsed >= this.maxShots) {
            return false;
        }

        this.shotsUsed += 1;
        this.lastShotRemovedBubbles = false;
        const interval = Math.max(0, Math.floor(this.level.shotsPerDrop));

        // A fixed board never drops a new ceiling row.
        if (interval <= 0) {
            return false;
        }

        return this.shotsUsed % interval === 0;
    }

    advance(): number {
        this.index = this.hasNext ? this.index + 1 : 0;
        this.shotsUsed = 0;
        this.bonusShots = 0;
        return this.index;
    }
}
