import { afterEach, describe, expect, it, vi } from 'vitest';

class MemoryStorage {
    private readonly values = new Map<string, string>();
    getItem(key: string): string | null {
        return this.values.get(key) ?? null;
    }
    setItem(key: string, value: string): void {
        this.values.set(key, String(value));
    }
    removeItem(key: string): void {
        this.values.delete(key);
    }
}

const install = () => {
    const storage = new MemoryStorage();
    vi.stubGlobal('window', { localStorage: storage });
    vi.stubGlobal('localStorage', storage);
    vi.resetModules();
    return storage;
};

afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
});

describe('bomb/fire one-time reset', () => {
    it('zeroes saved bomb/fire once, keeps everything else, never resets again', async () => {
        const storage = install();
        storage.setItem(
            'bubble-shooter-powerups.v1',
            JSON.stringify({ bomb: 7, colorChanger: 5, lightning: 4, fireball: 6 }),
        );
        // Fake unrelated saved data that must survive untouched.
        storage.setItem('bubble-shooter-progress', JSON.stringify({ coins: 123 }));

        let inv = await import('./inventory');
        expect(inv.loadPowerUpInventory().bomb).toBe(0);
        expect(inv.loadPowerUpInventory().fireball).toBe(0);
        // Other power-ups and coins untouched.
        expect(inv.loadPowerUpInventory().colorChanger).toBe(5);
        expect(inv.loadPowerUpInventory().lightning).toBe(4);
        expect(storage.getItem('bubble-shooter-progress')).toContain('123');

        // New rewards stack from zero.
        inv.grantPowerUp('bomb', 3);
        inv.grantPowerUp('fireball', 2);
        expect(inv.loadPowerUpInventory().bomb).toBe(3);
        expect(inv.loadPowerUpInventory().fireball).toBe(2);

        // Reload simulation: module cache cleared, storage kept.
        vi.resetModules();
        inv = await import('./inventory');
        expect(inv.loadPowerUpInventory().bomb).toBe(3);
        expect(inv.loadPowerUpInventory().fireball).toBe(2);
    });
});
