import type { Bubble } from '../objects/Bubble';
import type { GridSystem } from '../systems/GridSystem';

export interface PowerUpContext {
    grid: GridSystem;
    scene: Phaser.Scene;
    onScore: (score: number) => void;
}

export interface PowerUpResult {
    removed: Bubble[];
    score: number;
}

export interface PowerUp {
    id: 'bomb' | 'colorChanger' | 'lightning' | 'fireball';
    name: string;
    description: string;
    costCoins: number;
    getQuantity(): number;
    setQuantity(q: number): void;
    canActivate(ctx: PowerUpContext): boolean;
    activate(ctx: PowerUpContext): PowerUpResult | null;
}
