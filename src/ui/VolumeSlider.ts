import { FONT_DISPLAY, FONT } from '../game/config';

export interface VolumeSliderOptions {
    x: number;
    y: number;
    width: number;
    label: string;
    value: number;
    onChange: (value: number) => void;
}

export interface VolumeSliderHandle {
    setValue: (value: number) => void;
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

export const createVolumeSlider = (
    scene: Phaser.Scene,
    parent: Phaser.GameObjects.Container,
    options: VolumeSliderOptions
): VolumeSliderHandle => {
    const { x, y, width, label } = options;
    const row = scene.add.container(x, y);
    const bg = scene.add.graphics();
    bg.fillStyle(0xffffff, 0.045);
    bg.fillRoundedRect(-width / 2, -26, width, 52, 14);

    const labelText = scene.add
        .text(-width / 2 + 16, -12, label, {
            fontFamily: FONT_DISPLAY,
            fontSize: '13px',
            color: '#dff4ff',
        })
        .setOrigin(0, 0.5);

    let current = clamp01(options.value);
    const valueText = scene.add
        .text(width / 2 - 16, -12, `${Math.round(current * 100)}%`, {
            fontFamily: FONT,
            fontSize: '12px',
            fontStyle: 'bold',
            color: '#8fe9ff',
        })
        .setOrigin(1, 0.5);

    const trackWidth = width - 32;
    const trackX = -trackWidth / 2;
    const trackY = 11;
    const track = scene.add.graphics();
    const knob = scene.add.circle(0, trackY, 8, 0xffffff, 1);

    const draw = (): void => {
        track.clear();
        track.fillStyle(0x0a2038, 0.92);
        track.fillRoundedRect(trackX, trackY - 4, trackWidth, 8, 4);
        track.fillGradientStyle(0x35d6ff, 0x35d6ff, 0x2a9df4, 0x2a9df4, 1);
        track.fillRoundedRect(
            trackX,
            trackY - 4,
            Math.max(8, trackWidth * current),
            8,
            4
        );
        track.lineStyle(1.5, 0x6fd8ff, 0.55);
        track.strokeRoundedRect(trackX, trackY - 4, trackWidth, 8, 4);
        knob.setPosition(trackX + trackWidth * current, trackY);
        valueText.setText(`${Math.round(current * 100)}%`);
    };

    const apply = (next: number): void => {
        const value = clamp01(next);

        if (Math.abs(value - current) < 0.002) {
            return;
        }

        current = value;
        draw();
        options.onChange(current);
    };

    draw();

    const hit = scene.add
        .rectangle(0, trackY, width, 40, 0xffffff, 0.001)
        .setInteractive({ useHandCursor: true });

    let dragging = false;

    const updateFromPointer = (pointer: Phaser.Input.Pointer): void => {
        const scaleX = parent.scaleX || 1;
        const parentX = parent.x + x * scaleX;
        const pointerX = pointer.worldX ?? pointer.x;
        const local = (pointerX - parentX) / scaleX;
        apply((local + trackWidth / 2) / trackWidth);
    };

    const onMove = (pointer: Phaser.Input.Pointer): void => {
        if (dragging) {
            updateFromPointer(pointer);
        }
    };

    const onUp = (): void => {
        dragging = false;
    };

    hit.on(
        'pointerdown',
        (
            pointer: Phaser.Input.Pointer,
            _localX: number,
            _localY: number,
            event: { stopPropagation: () => void }
        ) => {
            event.stopPropagation();
            dragging = true;
            updateFromPointer(pointer);
        }
    );

    scene.input.on('pointermove', onMove);
    scene.input.on('pointerup', onUp);
    scene.input.on('pointerupoutside', onUp);

    let cleaned = false;
    const cleanup = (): void => {
        if (cleaned) {
            return;
        }
        cleaned = true;
        scene.input.off('pointermove', onMove);
        scene.input.off('pointerup', onUp);
        scene.input.off('pointerupoutside', onUp);
    };

    hit.once('destroy', cleanup);
    parent.once('destroy', cleanup);

    row.add([bg, labelText, valueText, track, knob, hit]);
    parent.add(row);

    return {
        setValue: (value: number) => {
            current = clamp01(value);
            draw();
        },
    };
};
