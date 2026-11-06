import type { PowerUpInventory } from '../powerups/inventory';

export type StoreCategory = 'bomb' | 'fire' | 'color' | 'bundle' | 'special';
export type StoreBadge = 'POPULAR' | 'BEST VALUE' | 'LIMITED' | 'SALE' | 'NEW';

export interface StoreReward {
    grants: Partial<PowerUpInventory>;
    extraShots?: number;
    coins?: number;
    description: string;
}

export interface StoreProduct {
    id: string;
    name: string;
    category: StoreCategory;
    price: number;
    reward: StoreReward;
    badge?: StoreBadge;
    mystery?: boolean;
    icon: 'bomb' | 'fire' | 'color' | 'bundle' | 'special' | 'mystery';
}

const b = (bomb = 0, fireball = 0, colorChanger = 0): StoreReward['grants'] => {
    const grants: Partial<PowerUpInventory> = {};
    if (bomb) grants.bomb = bomb;
    if (fireball) grants.fireball = fireball;
    if (colorChanger) grants.colorChanger = colorChanger;
    return grants;
};

// Rewards keep quantity in `reward` text for UI; grants mirror the same numbers.
// Unit values: bomb 5, fire 8, color 5, extra shot 4 — bundles discount on top.
export const STORE_PRODUCTS: readonly StoreProduct[] = [
    // A. Bomb Packs (10)
    { id: 'bomb-small', name: 'Small Bomb Pack', category: 'bomb', price: 5, reward: { grants: b(1), description: '1 Bomb' }, icon: 'bomb' },
    { id: 'bomb-double', name: 'Double Bomb Pack', category: 'bomb', price: 10, reward: { grants: b(2), description: '2 Bombs' }, badge: 'POPULAR', icon: 'bomb' },
    { id: 'bomb-triple', name: 'Triple Bomb Pack', category: 'bomb', price: 15, reward: { grants: b(3), description: '3 Bombs' }, icon: 'bomb' },
    { id: 'bomb-mega', name: 'Mega Bomb Pack', category: 'bomb', price: 25, reward: { grants: b(5), description: '5 Bombs' }, badge: 'SALE', icon: 'bomb' },
    { id: 'bomb-super', name: 'Super Bomb Pack', category: 'bomb', price: 40, reward: { grants: b(8), description: '8 Bombs' }, icon: 'bomb' },
    { id: 'bomb-starter', name: 'Bomb Starter Bundle', category: 'bomb', price: 25, reward: { grants: b(3, 0, 2), description: '3 Bombs + 2 Color Changes' }, icon: 'bomb' },
    { id: 'bomb-master', name: 'Bomb Master Bundle', category: 'bomb', price: 50, reward: { grants: b(10), description: '10 Bombs' }, icon: 'bomb' },
    { id: 'bomb-ultimate', name: 'Ultimate Bomb Bundle', category: 'bomb', price: 75, reward: { grants: b(15), description: '15 Bombs' }, badge: 'NEW', icon: 'bomb' },
    { id: 'bomb-power', name: 'Power Bomb Pack', category: 'bomb', price: 50, reward: { grants: b(12), description: '12 Bombs' }, icon: 'bomb' },
    { id: 'bomb-premium', name: 'Premium Bomb Pack', category: 'bomb', price: 100, reward: { grants: b(25), description: '25 Bombs' }, badge: 'BEST VALUE', icon: 'bomb' },
    // B. Fire Power Packs (10)
    { id: 'fire-single', name: 'Single Fire', category: 'fire', price: 10, reward: { grants: b(0, 1), description: '1 Fire Power' }, icon: 'fire' },
    { id: 'fire-double', name: 'Double Fire', category: 'fire', price: 15, reward: { grants: b(0, 2), description: '2 Fire Powers' }, badge: 'POPULAR', icon: 'fire' },
    { id: 'fire-triple', name: 'Triple Fire', category: 'fire', price: 20, reward: { grants: b(0, 3), description: '3 Fire Powers' }, icon: 'fire' },
    { id: 'fire-starter', name: 'Fire Starter Pack', category: 'fire', price: 30, reward: { grants: b(0, 4), description: '4 Fire Powers' }, icon: 'fire' },
    { id: 'fire-booster', name: 'Fire Booster', category: 'fire', price: 40, reward: { grants: b(0, 5), description: '5 Fire Powers' }, badge: 'SALE', icon: 'fire' },
    { id: 'fire-mega', name: 'Mega Fire Pack', category: 'fire', price: 50, reward: { grants: b(0, 8), description: '8 Fire Powers' }, icon: 'fire' },
    { id: 'fire-super', name: 'Super Fire Pack', category: 'fire', price: 75, reward: { grants: b(0, 10), description: '10 Fire Powers' }, icon: 'fire' },
    { id: 'fire-master', name: 'Fire Master Bundle', category: 'fire', price: 100, reward: { grants: b(0, 15), description: '15 Fire Powers' }, icon: 'fire' },
    { id: 'fire-ultimate', name: 'Ultimate Fire Pack', category: 'fire', price: 125, reward: { grants: b(0, 20), description: '20 Fire Powers' }, badge: 'NEW', icon: 'fire' },
    { id: 'fire-premium', name: 'Premium Fire Bundle', category: 'fire', price: 150, reward: { grants: b(0, 25), description: '25 Fire Powers' }, badge: 'BEST VALUE', icon: 'fire' },
    // C. Bubble Color Packs (10)
    { id: 'color-5', name: '5 Color Changes', category: 'color', price: 25, reward: { grants: b(0, 0, 5), description: '5 Color Changes' }, icon: 'color' },
    { id: 'color-10', name: '10 Color Changes', category: 'color', price: 50, reward: { grants: b(0, 0, 10), description: '10 Color Changes' }, badge: 'POPULAR', icon: 'color' },
    { id: 'color-15', name: '15 Color Changes', category: 'color', price: 75, reward: { grants: b(0, 0, 15), description: '15 Color Changes' }, icon: 'color' },
    { id: 'color-20', name: '20 Color Changes', category: 'color', price: 100, reward: { grants: b(0, 0, 20), description: '20 Color Changes' }, icon: 'color' },
    { id: 'color-25', name: '25 Color Changes', category: 'color', price: 100, reward: { grants: b(0, 0, 25), description: '25 Color Changes' }, badge: 'BEST VALUE', icon: 'color' },
    { id: 'color-30', name: '30 Color Changes', category: 'color', price: 150, reward: { grants: b(0, 0, 30), description: '30 Color Changes' }, icon: 'color' },
    { id: 'color-40', name: '40 Color Changes', category: 'color', price: 150, reward: { grants: b(0, 0, 40), description: '40 Color Changes' }, icon: 'color' },
    { id: 'color-50', name: '50 Color Changes', category: 'color', price: 200, reward: { grants: b(0, 0, 50), description: '50 Color Changes' }, icon: 'color' },
    { id: 'color-master', name: 'Color Master Pack', category: 'color', price: 250, reward: { grants: b(0, 0, 60), description: '60 Color Changes' }, icon: 'color' },
    { id: 'color-ultimate', name: 'Ultimate Color Bundle', category: 'color', price: 400, reward: { grants: b(0, 0, 100), description: '100 Color Changes' }, badge: 'NEW', icon: 'color' },
    // D. Mixed Power Bundles (10)
    { id: 'bundle-starter', name: 'Starter Power Bundle', category: 'bundle', price: 25, reward: { grants: b(1, 1, 3), description: '1 Bomb + 1 Fire + 3 Color' }, badge: 'POPULAR', icon: 'bundle' },
    { id: 'bundle-bomb-fire', name: 'Bomb + Fire Bundle', category: 'bundle', price: 10, reward: { grants: b(2, 1), description: '2 Bombs + 1 Fire Power' }, icon: 'bundle' },
    { id: 'bundle-fire-color', name: 'Fire + Color Bundle', category: 'bundle', price: 30, reward: { grants: b(0, 1, 5), description: '1 Fire + 5 Color Changes' }, icon: 'bundle' },
    { id: 'bundle-bomb-color', name: 'Bomb + Color Bundle', category: 'bundle', price: 25, reward: { grants: b(1, 0, 5), description: '1 Bomb + 5 Color Changes' }, icon: 'bundle' },
    { id: 'bundle-triple', name: 'Triple Power Bundle', category: 'bundle', price: 50, reward: { grants: b(2, 2, 5), description: '2 Bombs + 2 Fire + 5 Color' }, icon: 'bundle' },
    { id: 'bundle-mega', name: 'Mega Power Bundle', category: 'bundle', price: 100, reward: { grants: b(5, 5, 10), extraShots: 5, description: '5 Bombs + 5 Fire + 10 Color + 5 Shots' }, icon: 'bundle' },
    { id: 'bundle-super', name: 'Super Shooter Bundle', category: 'bundle', price: 125, reward: { grants: b(5, 3, 10), extraShots: 10, description: '5 Bombs + 3 Fire + 10 Color + 10 Shots' }, icon: 'bundle' },
    { id: 'bundle-pro', name: 'Pro Player Bundle', category: 'bundle', price: 150, reward: { grants: b(8, 8, 15), description: '8 Bombs + 8 Fire + 15 Color' }, badge: 'SALE', icon: 'bundle' },
    { id: 'bundle-ultimate', name: 'Ultimate Power Bundle', category: 'bundle', price: 200, reward: { grants: b(10, 10, 20), description: '10 Bombs + 10 Fire + 20 Color' }, badge: 'NEW', icon: 'bundle' },
    { id: 'bundle-legendary', name: 'Legendary Bundle', category: 'bundle', price: 300, reward: { grants: b(15, 15, 30), extraShots: 10, description: '15 Bombs + 15 Fire + 30 Color + 10 Shots' }, badge: 'BEST VALUE', icon: 'bundle' },
    // E. Special Items (10)
    { id: 'special-shots3', name: 'Extra 3 Shots', category: 'special', price: 15, reward: { grants: {}, extraShots: 3, description: '3 Extra Shots' }, icon: 'special' },
    { id: 'special-shots5', name: 'Extra 5 Shots', category: 'special', price: 25, reward: { grants: {}, extraShots: 5, description: '5 Extra Shots' }, badge: 'POPULAR', icon: 'special' },
    { id: 'special-shots10', name: 'Extra 10 Shots', category: 'special', price: 40, reward: { grants: {}, extraShots: 10, description: '10 Extra Shots' }, icon: 'special' },
    { id: 'special-life', name: 'Extra Life', category: 'special', price: 20, reward: { grants: b(1), extraShots: 3, description: '1 Bomb + 3 Extra Shots' }, icon: 'special' },
    { id: 'special-score', name: 'Score Booster', category: 'special', price: 25, reward: { grants: b(0, 2, 5), description: '2 Fire + 5 Color Changes' }, icon: 'special' },
    { id: 'special-star', name: 'Star Booster', category: 'special', price: 30, reward: { grants: b(0, 3, 5), description: '3 Fire + 5 Color Changes' }, icon: 'special' },
    { id: 'special-lucky', name: 'Lucky Reward Pack', category: 'special', price: 40, reward: { grants: b(2, 2, 5), description: '2 Bombs + 2 Fire + 5 Color' }, badge: 'SALE', icon: 'special' },
    { id: 'special-mystery', name: 'Mystery Power Box', category: 'special', price: 75, reward: { grants: {}, description: 'Mystery Reward' }, badge: 'LIMITED', mystery: true, icon: 'mystery' },
    { id: 'special-daily', name: 'Daily Special Bundle', category: 'special', price: 30, reward: { grants: b(1, 1, 3), extraShots: 3, description: '1 Bomb + 1 Fire + 3 Color + 3 Shots' }, badge: 'LIMITED', icon: 'special' },
    { id: 'special-mega-mystery', name: 'Mega Mystery Bundle', category: 'special', price: 150, reward: { grants: {}, description: 'Mega Mystery Reward' }, badge: 'BEST VALUE', mystery: true, icon: 'mystery' },
];

export const STORE_CATEGORIES: readonly { id: 'all' | StoreCategory; label: string }[] = [
    { id: 'all', label: 'ALL' },
    { id: 'bomb', label: 'BOMB' },
    { id: 'fire', label: 'FIRE' },
    { id: 'color', label: 'BUBBLE COLORS' },
    { id: 'bundle', label: 'BUNDLES' },
    { id: 'special', label: 'SPECIAL' },
] as const;

export const MYSTERY_TABLE: readonly StoreReward[] = [
    { grants: b(1), description: '1 Bomb' },
    { grants: b(0, 1), description: '1 Fire Power' },
    { grants: b(0, 0, 5), description: '5 Color Changes' },
    { grants: b(2, 1), description: '2 Bombs + 1 Fire Power' },
    { grants: {}, extraShots: 5, description: '5 Extra Shots' },
];

export const MEGA_MYSTERY_TABLE: readonly StoreReward[] = [
    { grants: b(3, 2), description: '3 Bombs + 2 Fire Power' },
    { grants: b(0, 0, 15), description: '15 Color Changes' },
    { grants: b(2, 2, 5), extraShots: 3, description: '2 Bombs + 2 Fire + 5 Color + 3 Shots' },
    { grants: {}, extraShots: 10, description: '10 Extra Shots' },
    { grants: b(5, 5), description: '5 Bombs + 5 Fire Power' },
];

export function rollMysteryReward(product: StoreProduct, random: () => number = Math.random): StoreReward {
    const table = product.id === 'special-mega-mystery' ? MEGA_MYSTERY_TABLE : MYSTERY_TABLE;
    const index = Math.min(table.length - 1, Math.max(0, Math.floor(random() * table.length)));
    return table[index];
}
