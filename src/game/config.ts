export let GAME_WIDTH: number = 540;
export let GAME_HEIGHT: number = 960;

export const BUBBLE_RADIUS = 19;
export const BUBBLE_DIAMETER = BUBBLE_RADIUS * 2;
/** 13 columns: the board spans almost the full width with ~13px side padding. */
export const GRID_COLS = 13;
/** Tall enough for the largest progression board (1500+ bubbles); the viewport scrolls. */
export const GRID_ROWS = 150;
export let GRID_LEFT =
  (GAME_WIDTH - (GRID_COLS * BUBBLE_DIAMETER + BUBBLE_RADIUS)) / 2;
/**
 * Board ceiling. Every vertical anchor below derives from GAME_HEIGHT, so a
 * different design height reflows the HUD ceiling, shooter and toolbar from
 * one place — bottom controls stay bottom-anchored, HUD stays top-anchored.
 */
export const GRID_TOP = 55;
export const ROW_HEIGHT = BUBBLE_RADIUS * Math.sqrt(3);
export let WALL_LEFT = GRID_LEFT + BUBBLE_RADIUS;
export let WALL_RIGHT = GAME_WIDTH - GRID_LEFT - BUBBLE_RADIUS;
/** Visible board viewport. Bubbles outside this band are clipped, not removed. */
export const BOARD_VIEW_TOP = GRID_TOP;
/** Board's visible floor sits above the shooter + bottom controls stack. */
export let BOARD_VIEW_BOTTOM = GAME_HEIGHT - 170;
export let DANGER_Y = BOARD_VIEW_BOTTOM - 80;
export let SHOOTER_Y = GAME_HEIGHT - 114;
export const LAUNCH_SPEED = 1200;
export const MAX_AIM_ANGLE = 1.36;
/** HUD's vertical budget — mirrors the board ceiling. */
export const HUD_HEIGHT = GRID_TOP;

export const FONT = '"Trebuchet MS", "Segoe UI", Arial, sans-serif';
export const FONT_DISPLAY = '"Arial Black", "Trebuchet MS", Arial, sans-serif';

export const BUBBLE_COLORS = {
  red: 0xff4d6d,
  orange: 0xff9f1c,
  yellow: 0xffd166,
  green: 0x2ec4b6,
  blue: 0x3a86ff,
  purple: 0x9b5de5,
} as const;

export type BubbleColorName = keyof typeof BUBBLE_COLORS;

export const COLOR_NAMES = Object.keys(BUBBLE_COLORS) as BubbleColorName[];

export const setGameViewport = (width: number, height: number): void => {
    GAME_WIDTH = Math.max(320, Math.round(width));
    GAME_HEIGHT = Math.max(640, Math.round(height));
    GRID_LEFT = (GAME_WIDTH - (GRID_COLS * BUBBLE_DIAMETER + BUBBLE_RADIUS)) / 2;
    WALL_LEFT = GRID_LEFT + BUBBLE_RADIUS;
    WALL_RIGHT = GAME_WIDTH - GRID_LEFT - BUBBLE_RADIUS;
    BOARD_VIEW_BOTTOM = GAME_HEIGHT - 170;
    DANGER_Y = BOARD_VIEW_BOTTOM - 80;
    SHOOTER_Y = GAME_HEIGHT - 114;
};

const ORIGINAL_BUBBLE_TEXTURES: Partial<Record<BubbleColorName, string>> = {
  red: "bubble-red-svg",
  yellow: "bubble-yellow-svg",
  green: "bubble-green-svg",
  blue: "bubble-blue-svg",
  purple: "bubble-purple-svg",
};

export const bubbleTexture = (name: BubbleColorName): string =>
  ORIGINAL_BUBBLE_TEXTURES[name] ?? `bubble-${name}`;

export const shade = (value: number, amount: number): number => {
  const red = Math.min(255, Math.max(0, ((value >> 16) & 0xff) + amount));
  const green = Math.min(255, Math.max(0, ((value >> 8) & 0xff) + amount));
  const blue = Math.min(255, Math.max(0, (value & 0xff) + amount));

  return (red << 16) | (green << 8) | blue;
};

export const toCssColor = (value: number): string =>
  `#${value.toString(16).padStart(6, "0")}`;
