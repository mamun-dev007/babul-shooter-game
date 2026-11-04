import type { PowerUp, PowerUpContext, PowerUpResult } from './types';
import { getPowerUpQuantity, consumePowerUp } from './inventory';

export class LightningPowerUp implements PowerUp {
    id = 'lightning' as const;
    name = 'Lightning';
    description = 'Clears a row of bubbles';
    costCoins = 45;

    getQuantity(): number {
        return getPowerUpQuantity('lightning');
    }

    setQuantity(q: number): void {
        const inv = require('./inventory').loadPowerUpInventory();
        inv.lightning = Math.max(0, q);
        require('./inventory').savePowerUpInventory(inv);
    }

    canActivate(ctx: PowerUpContext): boolean {
        return this.getQuantity() > 0 && ctx.grid.getBubbles().length > 0;
    }

    activate(ctx: PowerUpContext): PowerUpResult | null {
        if (!this.canActivate(ctx)) return null;
        const bubbles = ctx.grid.getBubbles();
        if (bubbles.length === 0) return null;
        // Clear top row by y
        const minY = Math.min(...bubbles.map((b) => b.y));
        const removed: any[] = [];
        for (const b of bubbles) {
            if (Math.abs(b.y - minY) < 30) {
                ctx.grid.clearBubble(b);
                removed.push(b);
            }
        }
        if (removed.length === 0) return null;
        consumePowerUp('lightning');
        const score = removed.length * 12;
        ctx.onScore(score);
        return { removed, score };
    }
}
