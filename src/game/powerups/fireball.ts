import type { PowerUp, PowerUpContext, PowerUpResult } from './types';
import { getPowerUpQuantity, consumePowerUp } from './inventory';

export class FireballPowerUp implements PowerUp {
    id = 'fireball' as const;
    name = 'Fireball';
    description = 'Travels through bubbles';
    costCoins = 60;

    getQuantity(): number {
        return getPowerUpQuantity('fireball');
    }

    setQuantity(q: number): void {
        const inv = require('./inventory').loadPowerUpInventory();
        inv.fireball = Math.max(0, q);
        require('./inventory').savePowerUpInventory(inv);
    }

    canActivate(ctx: PowerUpContext): boolean {
        return this.getQuantity() > 0 && ctx.grid.getBubbles().length > 0;
    }

    activate(ctx: PowerUpContext): PowerUpResult | null {
        if (!this.canActivate(ctx)) return null;
        const bubbles = ctx.grid.getBubbles();
        if (bubbles.length === 0) return null;
        // Remove up to 5 bubbles along a line from bottom
        const sorted = [...bubbles].sort((a, b) => b.y - a.y);
        const removed: any[] = [];
        for (let i = 0; i < Math.min(5, sorted.length); i++) {
            ctx.grid.clearBubble(sorted[i]);
            removed.push(sorted[i]);
        }
        if (removed.length === 0) return null;
        consumePowerUp('fireball');
        const score = removed.length * 70;
        ctx.onScore(score);
        return { removed, score };
    }
}
