import { GameObjects } from 'phaser';
import { BUBBLE_COLORS, BUBBLE_DIAMETER, bubbleTexture, type BubbleColorName } from '../config';

export class Bubble extends GameObjects.Image {
    readonly color: BubbleColorName;
    readonly baseScale: number;

    row = -1;
    col = -1;

    constructor(scene: Phaser.Scene, x: number, y: number, color: BubbleColorName) {
        super(scene, x, y, bubbleTexture(color));

        this.color = color;
        this.setDisplaySize(BUBBLE_DIAMETER, BUBBLE_DIAMETER);
        this.setDepth(10);
        this.baseScale = this.scaleX;

        scene.add.existing(this);
    }

    get colorValue(): number {
        return BUBBLE_COLORS[this.color];
    }

    setCell(row: number, col: number): void {
        this.row = row;
        this.col = col;
    }

    snapTo(x: number, y: number, duration = 110): void {
        this.scene.tweens.add({
            targets: this,
            x,
            y,
            duration,
            ease: 'Back.easeOut',
        });
    }
}
