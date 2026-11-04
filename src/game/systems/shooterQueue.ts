import type { BubbleColorName } from '../config';

/**
 * Smart shooter queue logic (pure, unit-testable).
 *
 * Chooses the colours the launcher serves based on the actual board state:
 * - if only one colour remains on the board, that colour must be served
 *   (both the loaded bubble and the preview);
 * - colours that no longer exist on the board are never served;
 * - colours that can complete a match immediately (an existing same-colour
 *   pair) and colours with a larger remaining count are prioritised;
 * - the colour the player just used is mildly deprioritised so the queue
 *   varies without becoming useless.
 */

export interface ColorStat {
    readonly color: BubbleColorName;
    /** Bubbles of this colour still on the board. */
    readonly count: number;
    /** Same-colour adjacency pairs: 1 means single-bubble match potential. */
    readonly pairs: number;
}

export interface ShooterQueueState {
    readonly currentColor: BubbleColorName;
    readonly nextColor: BubbleColorName;
}

export interface ShooterQueueUpdate {
    readonly current: BubbleColorName | null;
    readonly next: BubbleColorName | null;
}

const weightFor = (stat: ColorStat, previousColor: BubbleColorName | null): number => {
    // Distribution weight: bigger remaining share is more useful, sqrt keeps
    // one dominant colour from starving everything else.
    let weight = Math.sqrt(Math.max(1, stat.count));
    // Match-in-one-shot potential is the strongest signal.
    weight += Math.min(4, stat.pairs) * 1.6;
    // Do not hand the same colour back right away unless it is mandatory.
    if (previousColor && stat.color === previousColor) {
        weight *= 0.55;
    }
    return weight;
};

/** Weighted pick over the supplied per-colour stats (deterministic with `random`). */
export const pickSmartShooterColor = (
    stats: readonly ColorStat[],
    previousColor: BubbleColorName | null,
    random: () => number = Math.random
): BubbleColorName | null => {
    if (stats.length === 0) {
        return null;
    }

    if (stats.length === 1) {
        return stats[0].color;
    }

    const weights = stats.map((stat) => weightFor(stat, previousColor));
    const total = weights.reduce((sum, value) => sum + value, 0);
    let roll = random() * Math.max(total, Number.EPSILON);

    for (let index = 0; index < stats.length; index++) {
        roll -= weights[index];
        if (roll <= 0) {
            return stats[index].color;
        }
    }

    return stats[stats.length - 1].color;
};

/**
 * Decides the queue updates for the launcher. Returns colour changes only;
 * `null` fields mean "keep the current value".
 */
export const computeShooterQueueUpdate = (
    state: ShooterQueueState,
    stats: readonly ColorStat[],
    random: () => number = Math.random
): ShooterQueueUpdate => {
    if (stats.length === 0) {
        return { current: null, next: null };
    }

    const present = new Set(stats.map((stat) => stat.color));

    // Every other colour is gone: the remaining colour is mandatory for both
    // the loaded bubble and the preview.
    if (present.size === 1) {
        const only = stats[0].color;
        return {
            current: state.currentColor === only ? null : only,
            next: state.nextColor === only ? null : only,
        };
    }

    const current = present.has(state.currentColor)
        ? null
        : pickSmartShooterColor(stats, state.nextColor, random);

    const previousForNext = current !== null ? current : state.currentColor;
    const next = present.has(state.nextColor)
        ? null
        : pickSmartShooterColor(stats, previousForNext, random);

    // Avoid both queue slots collapsing onto one colour when a pick happens.
    if (current !== null && next !== null && next === current) {
        const alternatives = stats.filter((stat) => stat.color !== current);
        const alternative = pickSmartShooterColor(alternatives, current, random);
        return { current, next: alternative ?? next };
    }

    return { current, next };
};
