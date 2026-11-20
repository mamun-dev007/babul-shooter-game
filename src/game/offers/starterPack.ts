import type { PowerUpInventory } from '../powerups/inventory';
import { REAL_MONEY_PRODUCTS, type RealMoneyProduct } from '../store/realMoneyCatalog';

export const STARTER_PACK_TITLE = 'STARTER PACK';
export const STARTER_OFFER_DURATION_MS = 24 * 60 * 60 * 1000;
export const STARTER_PACK_DURATION_MS = STARTER_OFFER_DURATION_MS;

const STORAGE_KEY = 'bubble-shooter-starter-offer.v2';
const LEGACY_STORAGE_KEY = 'bubble-shooter-starter-offer.v1';

interface StarterOfferConfig {
    readonly id: string;
    readonly sku: string;
    readonly discountPercent: number;
}

export interface StarterPackOffer {
    readonly id: string;
    readonly productId: string;
    readonly sku: string;
    readonly coins: number;
    readonly price: string;
    readonly discountPercent: number;
    readonly discountLabel: string;
    readonly grants: Readonly<Partial<PowerUpInventory>>;
}

export interface StarterPackState {
    readonly offer: StarterPackOffer;
    readonly cycleIndex: number;
    readonly startedAt: number;
    readonly remainingMs: number;
    readonly purchased: boolean;
}

interface PersistedState {
    startedAt: number;
    cycleIndex: number;
    offerId: string;
    purchasedCycleIndex: number | null;
}

const OFFER_CONFIGS: readonly StarterOfferConfig[] = [
    { id: 'starter-bronze', sku: 'coins_bronze_500', discountPercent: 60 },
    { id: 'starter-silver', sku: 'coins_silver_1000', discountPercent: 70 },
    { id: 'starter-basic', sku: 'coins_basic_250', discountPercent: 45 },
    { id: 'starter-gold', sku: 'coins_gold_2000', discountPercent: 80 },
    { id: 'starter-mini', sku: 'coins_starter_100', discountPercent: 35 },
    { id: 'starter-platinum', sku: 'coins_platinum_3500', discountPercent: 85 },
];

const buildOffer = (config: StarterOfferConfig): StarterPackOffer => {
    const product = REAL_MONEY_PRODUCTS.find((item) => item.sku === config.sku);
    if (!product) {
        throw new Error(`Starter offer ${config.id} references missing product ${config.sku}.`);
    }

    return {
        id: config.id,
        productId: `starter-${product.id}`,
        sku: product.sku,
        coins: product.coins,
        price: `USD ${product.usdPrice}`,
        discountPercent: config.discountPercent,
        discountLabel: `${config.discountPercent}% OFF`,
        grants: { ...product.grants },
    };
};

export const STARTER_PACK_OFFERS: readonly StarterPackOffer[] = OFFER_CONFIGS.map(buildOffer);

export const STARTER_PACK_COINS = STARTER_PACK_OFFERS[0].coins;
export const STARTER_PACK_PRICE_BDT = STARTER_PACK_OFFERS[0].price;
export const STARTER_PACK_DISCOUNT = STARTER_PACK_OFFERS[0].discountLabel;

let memoryState: PersistedState | null = null;

const storage = (): Storage | null => {
    try {
        if (typeof localStorage !== 'undefined') {
            return localStorage;
        }
        if (typeof window !== 'undefined') {
            return window.localStorage;
        }
    } catch {
        return null;
    }
    return null;
};

const offerForCycle = (cycleIndex: number): StarterPackOffer => {
    const index = ((Math.floor(cycleIndex) % STARTER_PACK_OFFERS.length) + STARTER_PACK_OFFERS.length) % STARTER_PACK_OFFERS.length;
    return STARTER_PACK_OFFERS[index];
};

const normalizeState = (value: Partial<PersistedState> | null): PersistedState | null => {
    if (!value) {
        return null;
    }
    const startedAt = Number(value.startedAt);
    const cycleIndex = Number(value.cycleIndex);
    if (!Number.isFinite(startedAt) || startedAt <= 0 || !Number.isInteger(cycleIndex) || cycleIndex < 0) {
        return null;
    }
    const offer = offerForCycle(cycleIndex);
    if (value.offerId !== undefined && value.offerId !== offer.id) {
        return null;
    }
    const purchasedCycleIndex = value.purchasedCycleIndex;
    return {
        startedAt,
        cycleIndex,
        offerId: offer.id,
        purchasedCycleIndex:
            typeof purchasedCycleIndex === 'number' && Number.isInteger(purchasedCycleIndex)
                ? purchasedCycleIndex
                : null,
    };
};

const readState = (): PersistedState | null => {
    const active = storage();
    if (active) {
        try {
            const raw = active.getItem(STORAGE_KEY);
            if (raw) {
                const normalized = normalizeState(JSON.parse(raw) as Partial<PersistedState>);
                if (normalized) {
                    memoryState = normalized;
                    return normalized;
                }
            }
            active.removeItem(LEGACY_STORAGE_KEY);
        } catch {
            return memoryState;
        }
    }
    return memoryState;
};

const persistState = (state: PersistedState): void => {
    memoryState = state;
    const active = storage();
    if (!active) {
        return;
    }
    try {
        active.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
        return;
    }
};

const resolveState = (nowMs: number): PersistedState => {
    const existing = readState();
    if (!existing) {
        const offer = offerForCycle(0);
        const next: PersistedState = {
            startedAt: nowMs,
            cycleIndex: 0,
            offerId: offer.id,
            purchasedCycleIndex: null,
        };
        persistState(next);
        return next;
    }

    const elapsed = Math.max(0, nowMs - existing.startedAt);
    const cycles = Math.floor(elapsed / STARTER_OFFER_DURATION_MS);
    if (cycles <= 0) {
        return existing;
    }

    const cycleIndex = existing.cycleIndex + cycles;
    const next: PersistedState = {
        startedAt: existing.startedAt + cycles * STARTER_OFFER_DURATION_MS,
        cycleIndex,
        offerId: offerForCycle(cycleIndex).id,
        purchasedCycleIndex: existing.purchasedCycleIndex,
    };
    persistState(next);
    return next;
};

const stateToResult = (state: PersistedState, nowMs: number): StarterPackState => ({
    offer: offerForCycle(state.cycleIndex),
    cycleIndex: state.cycleIndex,
    startedAt: state.startedAt,
    remainingMs: Math.max(0, Math.min(STARTER_OFFER_DURATION_MS, state.startedAt + STARTER_OFFER_DURATION_MS - nowMs)),
    purchased: state.purchasedCycleIndex === state.cycleIndex,
});

export function getStarterPackState(now: Date = new Date()): StarterPackState {
    return stateToResult(resolveState(now.getTime()), now.getTime());
}

export function getStarterPackDeadline(now: Date = new Date()): number {
    const state = resolveState(now.getTime());
    return state.startedAt + STARTER_OFFER_DURATION_MS;
}

export function starterPackRemainingMs(now: Date = new Date()): number {
    return getStarterPackState(now).remainingMs;
}

export function isStarterPackPurchased(now: Date = new Date()): boolean {
    return getStarterPackState(now).purchased;
}

export function markStarterPackPurchased(cycleIndex: number, now: Date = new Date()): boolean {
    const state = resolveState(now.getTime());
    if (state.cycleIndex !== cycleIndex || state.purchasedCycleIndex === state.cycleIndex) {
        return false;
    }
    persistState({ ...state, purchasedCycleIndex: state.cycleIndex });
    return true;
}

export function starterPackProduct(offer: StarterPackOffer): RealMoneyProduct {
    return {
        id: offer.productId,
        sku: offer.sku,
        name: STARTER_PACK_TITLE,
        coins: offer.coins,
        grants: { ...offer.grants },
        usdPrice: offer.price.replace(/^USD\s*/, ''),
    };
}

export function formatOfferCountdown(remainingMs: number): string {
    const totalSeconds = Math.ceil(Math.max(0, remainingMs) / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
