import type { PowerUpInventory } from '../powerups/inventory';

export type RealMoneyBadge = 'BONUS' | 'POPULAR' | 'BEST VALUE' | 'LIMITED' | 'SALE' | 'NEW';

export interface RealMoneyProduct {
    /** Store product ID (Google Play / StoreKit / web SKU). */
    id: string;
    sku: string;
    name: string;
    coins: number;
    grants: Partial<PowerUpInventory>;
    badge?: RealMoneyBadge;
    /** Configured USD list price. Localized store prices override this. */
    usdPrice: string;
}

/**
 * Real-money pack definitions. Reward quantities and the configured USD
 * list prices live here (kept separate from UI); localized prices from
 * the platform store (via ../payments queryProducts) override the USD
 * display at runtime, and checkout always goes through the provider.
 */
export const REAL_MONEY_PRODUCTS: readonly RealMoneyProduct[] = [
    { id: 'real-starter', sku: 'coins_starter_100', name: 'Starter Pack', coins: 100, grants: { bomb: 2, fireball: 1, colorChanger: 5 }, badge: 'BONUS', usdPrice: '$0.99' },
    { id: 'real-basic', sku: 'coins_basic_250', name: 'Basic Pack', coins: 250, grants: { bomb: 5, fireball: 2, colorChanger: 10 }, badge: 'POPULAR', usdPrice: '$1.49' },
    { id: 'real-bronze', sku: 'coins_bronze_500', name: 'Bronze Pack', coins: 500, grants: { bomb: 8, fireball: 5, colorChanger: 15 }, usdPrice: '$1.99' },
    { id: 'real-silver', sku: 'coins_silver_1000', name: 'Silver Pack', coins: 1000, grants: { bomb: 15, fireball: 8, colorChanger: 25 }, badge: 'BONUS', usdPrice: '$2.59' },
    { id: 'real-gold', sku: 'coins_gold_2000', name: 'Gold Pack', coins: 2000, grants: { bomb: 25, fireball: 15, colorChanger: 50 }, badge: 'POPULAR', usdPrice: '$2.99' },
    { id: 'real-platinum', sku: 'coins_platinum_3500', name: 'Platinum Pack', coins: 3500, grants: { bomb: 40, fireball: 25, colorChanger: 75 }, badge: 'BONUS', usdPrice: '$3.99' },
    { id: 'real-diamond', sku: 'coins_diamond_5000', name: 'Diamond Pack', coins: 5000, grants: { bomb: 60, fireball: 40, colorChanger: 100 }, badge: 'BEST VALUE', usdPrice: '$4.99' },
    { id: 'real-master', sku: 'coins_master_8000', name: 'Master Pack', coins: 8000, grants: { bomb: 100, fireball: 60, colorChanger: 150 }, badge: 'POPULAR', usdPrice: '$6.99' },
    { id: 'real-ultimate', sku: 'coins_ultimate_12000', name: 'Ultimate Pack', coins: 12000, grants: { bomb: 150, fireball: 100, colorChanger: 250 }, badge: 'BEST VALUE', usdPrice: '$9.99' },
    { id: 'real-legendary', sku: 'coins_legendary_20000', name: 'Legendary Pack', coins: 20000, grants: { bomb: 300, fireball: 200, colorChanger: 500 }, badge: 'BEST VALUE', usdPrice: '$19.99' },
] as const;
