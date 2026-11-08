export interface PowerUpInventory {
    bomb: number;
    colorChanger: number;
    lightning: number;
    fireball: number;
}

const STORAGE_KEY = 'bubble-shooter-powerups.v1';
const BOMB_FIRE_RESET_KEY = 'bubble-shooter-bomb-fire-reset.v1';

const DEFAULT_INVENTORY: PowerUpInventory = {
    bomb: 3,
    colorChanger: 2,
    lightning: 2,
    fireball: 2,
};

let cached: PowerUpInventory | null = null;

/**
 * One-time migration (applied exactly once, then flagged): zeroes the
 * saved Bomb and Fire quantities so old stock cannot reappear. Coins,
 * other power-ups and progression are untouched; later grants stack from 0.
 */
function applyBombFireResetOnce(inv: PowerUpInventory): void {
    try {
        if (localStorage.getItem(BOMB_FIRE_RESET_KEY)) {
            return;
        }
        inv.bomb = 0;
        inv.fireball = 0;
        localStorage.setItem(BOMB_FIRE_RESET_KEY, '1');
    } catch {}
}

export function loadPowerUpInventory(): PowerUpInventory {
    if (cached) return cached;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            cached = { ...DEFAULT_INVENTORY };
            applyBombFireResetOnce(cached);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(cached));
            return cached;
        }
        const parsed = JSON.parse(raw) as Partial<PowerUpInventory>;
        cached = {
            bomb: typeof parsed.bomb === 'number' ? Math.max(0, parsed.bomb) : DEFAULT_INVENTORY.bomb,
            colorChanger: typeof parsed.colorChanger === 'number' ? Math.max(0, parsed.colorChanger) : DEFAULT_INVENTORY.colorChanger,
            lightning: typeof parsed.lightning === 'number' ? Math.max(0, parsed.lightning) : DEFAULT_INVENTORY.lightning,
            fireball: typeof parsed.fireball === 'number' ? Math.max(0, parsed.fireball) : DEFAULT_INVENTORY.fireball,
        };
        applyBombFireResetOnce(cached);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cached));
        return cached;
    } catch {
        cached = { ...DEFAULT_INVENTORY };
        return cached;
    }
}

export function savePowerUpInventory(inv: PowerUpInventory): void {
    cached = { ...inv };
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cached));
    } catch {}
}

export function consumePowerUp(type: keyof PowerUpInventory): boolean {
    const inv = loadPowerUpInventory();
    if ((inv[type] || 0) <= 0) return false;
    inv[type] = (inv[type] || 0) - 1;
    savePowerUpInventory(inv);
    return true;
}

/** Adds earned power-ups to the inventory (e.g. streak rewards). */
export function grantPowerUp(type: keyof PowerUpInventory, amount = 1): void {
    const quantity = Math.max(0, Math.floor(Number(amount) || 0));
    if (quantity === 0) return;
    const inv = loadPowerUpInventory();
    inv[type] = (inv[type] || 0) + quantity;
    savePowerUpInventory(inv);
}

export function getPowerUpQuantity(type: keyof PowerUpInventory): number {
    return loadPowerUpInventory()[type] || 0;
}
