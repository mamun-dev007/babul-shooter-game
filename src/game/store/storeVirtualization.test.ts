import { describe, expect, it } from 'vitest';
import {
    REWARDED_CARD_HEIGHT,
    STORE_CARD_GAP,
    buildStoreCardSlots,
    nearestSlotIndex,
    slotIndicesInBand,
    storeColumnsForWidth,
    storePlanContentHeight,
    storeScrollKey,
} from './storeVirtualization';

const catalog = (prefix: string, count: number) =>
    Array.from({ length: count }, (_, index) => ({ id: `${prefix}-${index}` }));

const build = (overrides: Partial<Parameters<typeof buildStoreCardSlots>[0]> = {}) =>
    buildStoreCardSlots({
        category: 'all',
        cols: 2,
        gridWidth: 400,
        cardHeight: 194,
        realProducts: catalog('real', 2),
        coinProducts: catalog('coin', 5),
        ...overrides,
    });

describe('store card plan', () => {
    it('keeps the rewarded banner first and the original product order', () => {
        const slots = build();

        expect(slots).toHaveLength(8);
        expect(slots[0]).toMatchObject({ index: 0, kind: 'rewarded', x: 200, y: REWARDED_CARD_HEIGHT / 2, w: 400 });
        expect(slots.map((slot) => slot.kind)).toEqual([
            'rewarded',
            'real',
            'real',
            'coin',
            'coin',
            'coin',
            'coin',
            'coin',
        ]);
        expect(slots.map((slot) => slot.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
        expect(slots[1].realProductId).toBe('real-0');
        expect(slots[2].realProductId).toBe('real-1');
        expect(slots[3].coinProductId).toBe('coin-0');
        expect(slots[7].coinProductId).toBe('coin-4');
    });

    it('places cards on the same columns and rows as the original grid', () => {
        const slots = build();
        // cardW = (400 - 16) / 2 = 192, topOffset = 84 + 16 = 100.
        expect(slots[1]).toMatchObject({ x: 96, y: 197, w: 192, h: 194 });
        expect(slots[2]).toMatchObject({ x: 304, y: 197 });
        expect(slots[3]).toMatchObject({ x: 96, y: 407 });
        expect(slots[4]).toMatchObject({ x: 304, y: 407 });
    });

    it('omits the rewarded banner for filtered categories', () => {
        const bombs = build({
            category: 'bomb',
            realProducts: [],
            coinProducts: catalog('bomb', 3),
        });

        expect(bombs[0]).toMatchObject({ kind: 'coin', x: 96, y: 97 });
        expect(bombs.every((slot) => slot.kind === 'coin')).toBe(true);

        const realOnly = build({ category: 'real', coinProducts: [] });

        expect(realOnly).toHaveLength(2);
        expect(realOnly.every((slot) => slot.kind === 'real')).toBe(true);
        expect(realOnly[0].y).toBe(97);
    });

    it('reports a content height that matches the old row formula', () => {
        // 2 real + 5 coin = 7 cards, 2 columns -> 4 rows.
        // 84 + 16 + 4 x 194 + 3 x 16 = 924 (the rewarded gap is included).
        expect(storePlanContentHeight(build())).toBe(924);
        expect(storePlanContentHeight(build())).toBe(
            REWARDED_CARD_HEIGHT + STORE_CARD_GAP + 4 * 194 + 3 * STORE_CARD_GAP
        );

        const singleColumn = build({ category: 'bomb', realProducts: [], coinProducts: catalog('bomb', 3), cols: 1 });

        expect(storePlanContentHeight(singleColumn)).toBe(3 * 194 + 2 * STORE_CARD_GAP);
        expect(storePlanContentHeight([])).toBe(0);
    });

    it('keeps card geometry independent of how many cards are loaded', () => {
        const small = build();
        const large = build({ coinProducts: catalog('coin', 60) });

        expect(large[1]).toMatchObject({ w: small[1].w, h: small[1].h, x: small[1].x, y: small[1].y });
        expect(storePlanContentHeight(large)).toBeGreaterThan(storePlanContentHeight(small));
    });
});

describe('viewport band queries', () => {
    it('returns only intersecting slots in plan order', () => {
        const slots = build();

        // Rewarded banner (0-84) and the first row (100-294).
        expect(slotIndicesInBand(slots, 0, 250)).toEqual([0, 1, 2]);
        // Second row only (310-504).
        expect(slotIndicesInBand(slots, 300, 400)).toEqual([3, 4]);
        expect(slotIndicesInBand(slots, 0, 0)).toEqual([0]);
    });

    it('treats both band edges as inclusive', () => {
        const slots = build();
        const firstRowBottom = 294;

        // A card whose bottom edge touches the band top still counts.
        expect(slotIndicesInBand(slots, firstRowBottom, firstRowBottom)).toEqual([1, 2]);
    });

    it('returns nothing for an inverted or empty band', () => {
        const slots = build();

        expect(slotIndicesInBand(slots, 500, 100)).toEqual([]);
        expect(slotIndicesInBand([], 0, 1000)).toEqual([]);
    });
});

describe('build order', () => {
    it('picks the pending card closest to the viewport focus', () => {
        const slots = build();

        expect(nearestSlotIndex(slots, [1, 2, 3], 197)).toBe(1);
        expect(nearestSlotIndex(slots, [1, 2, 3], 400)).toBe(3);
        // Slots 3 and 4 share a row; the first pending one wins ties.
        expect(nearestSlotIndex(slots, [3, 4, 5, 6], 300)).toBe(3);
        expect(nearestSlotIndex(slots, [4, 5, 6], 300)).toBe(4);
    });

    it('ignores empty or invalid candidate sets', () => {
        const slots = build();

        expect(nearestSlotIndex(slots, [], 0)).toBeNull();
        expect(nearestSlotIndex(slots, [999], 0)).toBeNull();
    });

    it('keeps scroll memory separate per filter and column count', () => {
        expect(storeScrollKey('all', 1)).toBe('all:1');
        expect(storeScrollKey('all', 1)).not.toBe(storeScrollKey('all', 2));
        expect(storeScrollKey('bomb', 1)).not.toBe(storeScrollKey('all', 1));
    });
});

describe('device breakpoints', () => {
    it('keeps the original responsive column counts', () => {
        // Small / standard / large phones stay single column.
        expect([320, 359, 360, 429, 430, 559].map(storeColumnsForWidth)).toEqual([1, 1, 1, 1, 1, 1]);
        // Tablets and small laptops.
        expect([560, 768, 899].map(storeColumnsForWidth)).toEqual([2, 2, 2]);
        expect([900, 1024, 1299].map(storeColumnsForWidth)).toEqual([3, 3, 3]);
        expect([1300, 1440, 2560].map(storeColumnsForWidth)).toEqual([4, 4, 4]);
    });

    it('produces positive card sizes on every supported width', () => {
        const gridWidths = [300, 462, 540, 760, 1024];

        for (const gridWidth of gridWidths) {
            for (const cols of [1, 2, 3, 4]) {
                const slots = buildStoreCardSlots({
                    category: 'all',
                    cols,
                    gridWidth,
                    cardHeight: 194,
                    realProducts: catalog('real', 10),
                    coinProducts: catalog('coin', 50),
                });

                expect(slots).toHaveLength(61);
                expect(slots.every((slot) => slot.w > 0 && slot.h > 0)).toBe(true);
                expect(slots.every((slot) => slot.x >= slot.w / 2 - 0.001 && slot.x <= gridWidth - slot.w / 2 + 0.001)).toBe(true);
            }
        }
    });
});
