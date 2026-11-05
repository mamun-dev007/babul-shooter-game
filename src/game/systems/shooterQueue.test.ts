import { describe, expect, it } from 'vitest';
import {
    computeShooterQueueUpdate,
    pickRandomDifferentColor,
    pickSmartShooterColor,
    type ColorStat,
} from './shooterQueue';
import type { BubbleColorName } from '../config';

const stat = (color: BubbleColorName, count: number, pairs = 0): ColorStat => ({ color, count, pairs });

describe('smart shooter queue', () => {
    it('serves the only remaining colour for both bubble slots', () => {
        const update = computeShooterQueueUpdate(
            { currentColor: 'blue', nextColor: 'yellow' },
            [stat('red', 9)]
        );

        expect(update).toEqual({ current: 'red', next: 'red' });

        const aligned = computeShooterQueueUpdate(
            { currentColor: 'red', nextColor: 'red' },
            [stat('red', 9)]
        );
        expect(aligned).toEqual({ current: null, next: null });
    });

    it('never serves a colour that no longer exists on the board', () => {
        const update = computeShooterQueueUpdate(
            { currentColor: 'red', nextColor: 'red' },
            [stat('green', 12, 3), stat('yellow', 8, 0)]
        );

        expect(update.current).not.toBeNull();
        expect(update.current).not.toBe('red');
        expect(['green', 'yellow']).toContain(update.current);
        expect(['green', 'yellow']).toContain(update.next);
    });

    it('prioritises colours that can complete a match immediately', () => {
        const stats = [stat('green', 9, 0), stat('yellow', 2, 4)];
        // High roll walks to the tail of the weight list; the pair-rich colour
        // must outweigh the larger cluster-free colour.
        const pick = pickSmartShooterColor(stats, null, () => 0.999999);
        expect(pick).toBe('yellow');

        const single = pickSmartShooterColor([stat('purple', 5)], null);
        expect(single).toBe('purple');

        expect(pickSmartShooterColor([], null)).toBeNull();
    });

    it('keeps valid colours untouched and returns no-op updates otherwise', () => {
        const update = computeShooterQueueUpdate(
            { currentColor: 'green', nextColor: 'yellow' },
            [stat('green', 10, 1), stat('yellow', 5, 0), stat('blue', 5, 0)]
        );

        expect(update).toEqual({ current: null, next: null });
    });

    it('separates the two queue slots when both need replacing', () => {
        const update = computeShooterQueueUpdate(
            { currentColor: 'red', nextColor: 'red' },
            [stat('green', 4), stat('yellow', 4)],
            () => 0 // first candidate wins every pick
        );

        expect(update.current).toBe('green');
        expect(update.next).toBe('yellow');
    });
});

describe('pickRandomDifferentColor (colour-change button)', () => {
    it('always serves a colour different from the loaded bubble', () => {
        const pool = ['red', 'green', 'blue'] as const;
        const currentColor: BubbleColorName = 'green';

        for (let roll = 0; roll < 20; roll++) {
            const picked = pickRandomDifferentColor(pool, currentColor, () => roll / 20);

            expect(picked).not.toBe(currentColor);
            expect(['red', 'blue']).toContain(picked);
        }
    });

    it('draws only from the supplied level pool', () => {
        // Level serves only green/yellow: excluding green leaves yellow only.
        const picked = pickRandomDifferentColor(
            ['green', 'yellow'] as const,
            'green',
            () => 0.999999
        );

        expect(picked).toBe('yellow');
    });

    it('keeps the loaded bubble when no different colour exists', () => {
        expect(pickRandomDifferentColor(['red'] as const, 'red')).toBeNull();
        expect(pickRandomDifferentColor([], 'red')).toBeNull();
    });
});
