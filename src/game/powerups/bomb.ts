import type { PowerUp, PowerUpContext, PowerUpResult } from "./types";
import { getPowerUpQuantity, consumePowerUp } from "./inventory";
import { BUBBLE_RADIUS } from "../config";

export class BombPowerUp implements PowerUp {
  id = "bomb" as const;
  name = "Bomb";
  description = "Removes bubbles in a radius around impact";
  costCoins = 50;

  getQuantity(): number {
    return getPowerUpQuantity("bomb");
  }

  setQuantity(q: number): void {
    const inv = require("./inventory").loadPowerUpInventory();
    inv.bomb = Math.max(0, q);
    require("./inventory").savePowerUpInventory(inv);
  }

  canActivate(ctx: PowerUpContext): boolean {
    return this.getQuantity() > 0 && ctx.grid.getBubbles().length > 0;
  }

  activate(ctx: PowerUpContext): PowerUpResult | null {
    if (!this.canActivate(ctx)) return null;
    const bubbles = ctx.grid.getBubbles();
    if (bubbles.length === 0) return null;
    // Find center as average of positions or just pick a cluster center-ish
    const center = bubbles[0];
    const radius = BUBBLE_RADIUS * 3.2;
    const removed: any[] = [];
    for (const b of bubbles) {
      const dx = b.x - center.x;
      const dy = b.y - center.y;
      if (Math.hypot(dx, dy) <= radius) {
        ctx.grid.clearBubble(b);
        removed.push(b);
      }
    }
    if (removed.length === 0) return null;
    consumePowerUp("bomb");
    const score = removed.length * 70;
    ctx.onScore(score);
    return { removed, score };
  }
}
