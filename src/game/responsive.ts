import { GAME_HEIGHT, GAME_WIDTH } from './config';

export const fitScale = (
    width: number,
    height: number,
    minScale = 0.62,
    maxScale = 1
): number => Math.max(
    minScale,
    Math.min(maxScale, GAME_WIDTH / width, GAME_HEIGHT / height)
);

export const uiFitScale = (): number =>
    fitScale(540, 960, 0.62, 1);

export const applyLegacyScreenFit = (scene: Phaser.Scene): void => {
    const scale = GAME_HEIGHT >= 960 ? 1 : GAME_HEIGHT / 960;
    scene.cameras.main.setZoom(scale);
    scene.cameras.main.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);
};
