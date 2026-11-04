import type { PowerUp, PowerUpContext, PowerUpResult } from './types';
import { getPowerUpQuantity, consumePowerUp } from './inventory';
import type { BubbleColorName } from '../config';

export class ColorChangerPowerUp implements PowerUp {
    id = 'colorChanger' as const;
    name = 'Color Changer';
    description = 'Change current bubble color';
    costCoins = 40;

    getQuantity(): number {
        return getPowerUpQuantity('colorChanger');
    }

    setQuantity(q: number): void {
        const inv = require('./inventory').loadPowerUpInventory();
        inv.colorChanger = Math.max(0, q);
        require('./inventory').savePowerUpInventory(inv);
    }

    canActivate(ctx: PowerUpContext): boolean {
        return this.getQuantity() > 0 && ctx.grid.getBubbles().length > 0;
    }

    activate(ctx: PowerUpContext, _targetColor?: BubbleColorName): PowerUpResult | null {
        if (!this.canActivate(ctx)) return null;
        // This is a UI-driven powerup; actual color change happens via shooter
        // For now just consume and return empty result to signal activation
        consumePowerUp('colorChanger');
        return { removed: [], score: 0 };
    }
}
