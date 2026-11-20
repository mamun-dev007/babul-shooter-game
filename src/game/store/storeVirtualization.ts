import type { StoreCategory } from './catalog';

/**
 * Geometry-only plan for the Coin Store catalogue.
 *
 * The scene used to instantiate every product card (and its Graphics, Text
 * and Image children) inside one synchronous pass, which stutters on mobile
 * for the ~60-card catalogue. These helpers describe where each card *would*
 * sit without touching Phaser, so the scene can create only the cards near
 * the viewport, preload the next row, and keep the original order, card
 * dimensions and layout untouched.
 *
 * `index` is always the slot's array position; callers use it as the
 * virtualization key and as the lookup key into `StoreCardSlot[]`.
 */

export type StoreFilter = 'all' | StoreCategory | 'real';

export type StoreCardKind = 'rewarded' | 'real' | 'coin';

export interface StoreCardSlot {
    readonly index: number;
    readonly kind: StoreCardKind;
    /** Card centre X inside the grid container. */
    readonly x: number;
    /** Card centre Y inside the grid container. */
    readonly y: number;
    readonly w: number;
    readonly h: number;
    /** Real-money product id (`kind === 'real'`). */
    readonly realProductId?: string;
    /** Coin catalogue product id (`kind === 'coin'`). */
    readonly coinProductId?: string;
}

/** Gap between cards, unchanged from the original grid build. */
export const STORE_CARD_GAP = 16;
/** Height of the single rewarded-ad banner shown above the "all" grid. */
export const REWARDED_CARD_HEIGHT = 84;

/**
 * Responsive column count. Phones always show exactly two product cards per
 * row; tablet/iPad and desktop bands keep their original counts.
 */
export function storeColumnsForWidth(width: number): number {
    if (width < 560) return 2;
    if (width < 900) return 2;
    if (width < 1300) return 3;
    return 4;
}

export interface StorePlanOptions {
    readonly category: StoreFilter;
    readonly cols: number;
    /** Usable grid width (the mask width). */
    readonly gridWidth: number;
    readonly cardHeight: number;
    readonly realProducts: readonly { readonly id: string }[];
    readonly coinProducts: readonly { readonly id: string }[];
}

const cardWidth = (gridWidth: number, cols: number): number =>
    Math.floor((gridWidth - STORE_CARD_GAP * (cols - 1)) / cols);

/**
 * Builds the card plan in the exact order the store rendered before:
 * rewarded banner (category "all" only), real-money packs, then coin packs,
 * filled left-to-right / top-to-bottom with the responsive column count.
 */
export function buildStoreCardSlots(options: StorePlanOptions): StoreCardSlot[] {
    const { category, gridWidth, cardHeight, realProducts, coinProducts } = options;
    const cols = Math.max(1, Math.floor(options.cols));
    const w = cardWidth(gridWidth, cols);
    const showRewarded = category === 'all';
    const topOffset = showRewarded ? REWARDED_CARD_HEIGHT + STORE_CARD_GAP : 0;
    const slots: StoreCardSlot[] = [];

    if (showRewarded) {
        slots.push({
            index: 0,
            kind: 'rewarded',
            x: gridWidth / 2,
            y: REWARDED_CARD_HEIGHT / 2,
            w: gridWidth,
            h: REWARDED_CARD_HEIGHT,
        });
    }

    const placeRow = (kind: 'real' | 'coin', flatIndex: number, productId: string): void => {
        const col = flatIndex % cols;
        const row = Math.floor(flatIndex / cols);
        slots.push({
            index: slots.length,
            kind,
            x: col * (w + STORE_CARD_GAP) + w / 2,
            y: topOffset + row * (cardHeight + STORE_CARD_GAP) + cardHeight / 2,
            w,
            h: cardHeight,
            ...(kind === 'real' ? { realProductId: productId } : { coinProductId: productId }),
        });
    };

    realProducts.forEach((product, index) => placeRow('real', index, product.id));
    coinProducts.forEach((product, index) => placeRow('coin', realProducts.length + index, product.id));

    return slots;
}

/** Bottom edge of the last planned card, in grid-container coordinates. */
export function storePlanContentHeight(slots: readonly StoreCardSlot[]): number {
    let bottom = 0;

    for (const slot of slots) {
        bottom = Math.max(bottom, slot.y + slot.h / 2);
    }

    return bottom;
}

/**
 * Indices of the slots intersecting the vertical band, in plan order.
 * Bounds are inclusive so a card touching the edge still counts as visible.
 */
export function slotIndicesInBand(
    slots: readonly StoreCardSlot[],
    bandTop: number,
    bandBottom: number
): number[] {
    if (bandBottom < bandTop) {
        return [];
    }

    const indices: number[] = [];

    for (const slot of slots) {
        if (slot.y + slot.h / 2 >= bandTop && slot.y - slot.h / 2 <= bandBottom) {
            indices.push(slot.index);
        }
    }

    return indices;
}

/**
 * Picks the pending card closest to the focus line (the viewport centre by
 * default), so the row the player is looking at is always built first.
 */
export function nearestSlotIndex(
    slots: readonly StoreCardSlot[],
    candidates: Iterable<number>,
    targetY: number
): number | null {
    let best: number | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const index of candidates) {
        const slot = slots[index];

        if (!slot) {
            continue;
        }

        const distance = Math.abs(slot.y - targetY);

        if (distance < bestDistance) {
            bestDistance = distance;
            best = index;
        }
    }

    return best;
}

/** Stable cache key for the "remember where the player was" scroll restore. */
export function storeScrollKey(category: StoreFilter, cols: number): string {
    return `${category}:${cols}`;
}
