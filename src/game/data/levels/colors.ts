import { COLOR_NAMES, type BubbleColorName } from '../../config';

/** Single-character tokens used by the hand-authored layout strings. */
export const LAYOUT_COLOR_TOKENS: Readonly<Record<string, BubbleColorName>> = {
    R: 'red',
    O: 'orange',
    Y: 'yellow',
    G: 'green',
    B: 'blue',
    P: 'purple',
};

export const LAYOUT_EMPTY = '.';

export const formatColorToken = (color: BubbleColorName): string => {
    const token = Object.entries(LAYOUT_COLOR_TOKENS).find(([, value]) => value === color)?.[0];
    return token ?? '?';
};

export const isSupportedColor = (value: string): value is BubbleColorName =>
    (COLOR_NAMES as readonly string[]).includes(value);
