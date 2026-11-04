import { FONT } from '../game/config';

const DEBUG_DEPTH = 150;

/**
 * Optional diagnostics overlay. Enable with ?debug=1 or toggle at runtime with
 * F2. It only reads state; it never changes gameplay.
 */
export class DebugOverlay {
    private readonly text: Phaser.GameObjects.Text;

    constructor(scene: Phaser.Scene, visible: boolean) {
        this.text = scene.add
            .text(12, 118, '', {
                fontFamily: `Consolas, "Courier New", ${FONT}`,
                fontSize: '11px',
                color: '#9dffd6',
                backgroundColor: 'rgba(2, 8, 18, 0.84)',
                lineSpacing: 3,
                padding: {
                    left: 8,
                    right: 8,
                    top: 6,
                    bottom: 6,
                },
            })
            .setDepth(DEBUG_DEPTH)
            .setVisible(visible);
    }

    get isVisible(): boolean {
        return this.text.visible;
    }

    toggle(): void {
        this.text.setVisible(!this.text.visible);
    }

    render(lines: string[]): void {
        if (!this.text.visible) {
            return;
        }

        this.text.setText(lines.join('\n'));
    }

    destroy(): void {
        this.text.destroy();
    }
}
