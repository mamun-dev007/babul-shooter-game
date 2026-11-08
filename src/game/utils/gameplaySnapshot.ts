import type { BubbleColorName } from '../config';
import type { FireChargeProgress } from '../systems/fireChargeProgress';

/** One bubble cell (row/col/color) for Gameplay <-> Store restore. */
export interface GameplayCell {
    row: number;
    col: number;
    color: BubbleColorName;
}

/**
 * Live Gameplay state handed across the Coin Store round-trip so Back can
 * restore the attempt pixel-faithfully without restarting the level.
 * Bomb/Fire/Color counts and coins are shared persistent stores and are
 * therefore re-read on restore, not copied here.
 */
export interface GameplaySnapshot {
    level: number;
    score: number;
    shotsUsed: number;
    cells: GameplayCell[];
    currentColor: BubbleColorName;
    nextColor: BubbleColorName;
    selectedPower: 'bomb' | 'fireball' | null;
    fireCharge: FireChargeProgress;
}
