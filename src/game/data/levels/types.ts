import type { BubbleColorName } from '../../config';

/**
 * A level objective. New objective kinds can be added without changing the
 * level catalog format; the runtime and validator should switch exhaustively.
 */
export type LevelObjective =
    | { readonly type: 'score'; readonly targetScore: number }
    | { readonly type: 'clear-board' };

export interface LevelDefinition {
    /** Stable, positive identifier. The array index is not the source of truth. */
    readonly id: number;
    readonly chapter: number;
    readonly chapterName: string;
    readonly name: string;
    readonly description: string;
    /**
     * Eleven-character rows. Each character is either '.' (empty) or a bubble
     * colour token: R red, O orange, Y yellow, G green, B blue, P purple.
     * Layouts are authored data, never generated while the game is running.
     */
    readonly layout: readonly string[];
    /** All colours allowed in this level. Must exactly match the layout tokens. */
    readonly colors: readonly BubbleColorName[];
    /**
     * Total shots permitted before the level is failed.
     *
     * Kept as the legacy alias of `totalShots` so hand-authored fixtures and
     * older saves keep working. Progression levels set both to the same value.
     */
    readonly maxShots: number;
    /** Optional manually validated successful-shot estimate. Otherwise the layout is analyzed deterministically. */
    readonly estimatedRequiredShots?: number;
    /** Shots between automatic ceiling-row drops. 0 means drops are disabled. */
    readonly shotsPerDrop: number;
    readonly objective: LevelObjective;
    /**
     * Legacy score thresholds (ascending).
     *
     * Progression levels no longer rate stars by score; their authoritative
     * limits are `threeStarLimit` / `twoStarLimit` / `oneStarLimit`.
     */
    readonly starThresholds: readonly [number, number, number];
    /** True only after a human has played and signed off the balance. */
    readonly playtested: boolean;
    /** Coarse difficulty band 1 (easiest) … 8 (hardest) across the milestones. */
    readonly difficulty?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
    readonly balanceNotes?: string;
}

/**
 * A progression level is a normal level plus the fixed-board configuration
 * used by the 1000-level campaign. The extra fields are required here so the
 * runtime never has to guess a shot budget or bubble count.
 */
export interface ProgressionLevelDefinition extends LevelDefinition {
    readonly objective: { readonly type: 'clear-board' };
    /** Exact number of bubbles generated when the level starts. */
    readonly totalBubbles: number;
    /** Exact number of shots allowed before the level fails. */
    readonly totalShots: number;
    /** Shots used must be <= this value for three stars. */
    readonly threeStarLimit: number;
    /** Shots used must be <= this value for two stars. */
    readonly twoStarLimit: number;
    /** Shots used must be <= this value for one star. */
    readonly oneStarLimit: number;
    /** Fixed boards never add ceiling rows or respawn removed bubbles. */
    readonly fixedBoard: true;
    /** Tall, scrollable boards must not use the legacy danger-line failure. */
    readonly dangerEnabled: false;
}

export type ChapterDefinition = {
    readonly id: number;
    readonly name: string;
    readonly levels: readonly Omit<LevelDefinition, 'chapter' | 'chapterName'>[];
};

export interface LayoutCell {
    readonly row: number;
    readonly col: number;
    readonly color: BubbleColorName;
}
