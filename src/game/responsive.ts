import { DESIGN_HEIGHT, DESIGN_WIDTH } from './layout';

export const fitScale = (
    width: number,
    height: number,
    minScale = 0.62,
    maxScale = 1
): number => Math.max(
    minScale,
    Math.min(maxScale, DESIGN_WIDTH / width, DESIGN_HEIGHT / height)
);

export const uiFitScale = (): number =>
    fitScale(DESIGN_WIDTH, DESIGN_HEIGHT, 0.62, 1);

/** The Settings popup design is enlarged by 80% from 472×520 to 850×936. */
export const SETTINGS_POPUP_SCALE = 1.8;
export const SETTINGS_BASE_PANEL_WIDTH = 472;
export const SETTINGS_BASE_PANEL_HEIGHT = 520;
export const SETTINGS_PANEL_WIDTH = Math.round(SETTINGS_BASE_PANEL_WIDTH * SETTINGS_POPUP_SCALE);
export const SETTINGS_PANEL_HEIGHT = Math.round(SETTINGS_BASE_PANEL_HEIGHT * SETTINGS_POPUP_SCALE);
/** Design-space centre of the panel (used to keep the camera centred on it). */
export const SETTINGS_CONTENT_CENTER_X = 34 + SETTINGS_BASE_PANEL_WIDTH / 2;
export const SETTINGS_CONTENT_CENTER_Y = 220 + SETTINGS_BASE_PANEL_HEIGHT / 2;
/** 420 CSS px × 1.8 — the enlarged popup may use more of the screen. */
const SETTINGS_MAX_CSS_WIDTH = 420 * SETTINGS_POPUP_SCALE;
const SETTINGS_MAX_HEIGHT_FRACTION = 0.94;

export const settingsFitScale = (
    viewportWidth: number,
    viewportHeight: number,
    worldWidthValue: number,
    worldHeightValue: number
): number => {
    const cssPerWorldX = viewportWidth / Math.max(1, worldWidthValue);
    const cssPerWorldY = viewportHeight / Math.max(1, worldHeightValue);
    const availableWidth = Math.min(
        viewportWidth * SETTINGS_MAX_HEIGHT_FRACTION,
        SETTINGS_MAX_CSS_WIDTH
    ) / cssPerWorldX;
    const availableHeight = (viewportHeight * SETTINGS_MAX_HEIGHT_FRACTION) / cssPerWorldY;

    return Math.min(
        1,
        availableWidth / SETTINGS_PANEL_WIDTH,
        availableHeight / SETTINGS_PANEL_HEIGHT
    );
};

/**
 * Phaser centres its camera at `scroll + size / 2` using unzoomed pixels, so
 * the scroll needed to centre a world point is zoom-independent. Dividing by
 * the zoom shifts the view and clips the enlarged Settings popup.
 */
export const settingsCameraScroll = (center: number, cameraSize: number): number =>
    center - cameraSize / 2;

export const applyLegacyScreenFit = (scene: Phaser.Scene): void => {
    const scale = 1;
    scene.cameras.main.setZoom(scale);
    scene.cameras.main.centerOn(DESIGN_WIDTH / 2, DESIGN_HEIGHT / 2);
};
