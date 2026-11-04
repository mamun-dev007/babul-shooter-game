import { CHAPTER_01 } from './chapter-01-first-bubbles';
import { CHAPTER_02 } from './chapter-02-color-mix';
import { CHAPTER_03 } from './chapter-03-hollow-holds';
import { CHAPTER_04 } from './chapter-04-precision';
import { CHAPTER_05 } from './chapter-05-density';
import { CHAPTER_06 } from './chapter-06-pressure';
import { CHAPTER_07 } from './chapter-07-fortresses';
import { CHAPTER_08 } from './chapter-08-fractures';
import { CHAPTER_09 } from './chapter-09-gauntlet';
import { CHAPTER_10 } from './chapter-10-masters';
import { GENERATED_CHAPTERS } from './generated-chapters';
import type { LevelDefinition } from './types';

/**
 * Source metadata for the campaign. The progression builder replaces each
 * level's layout and balance numbers, while chapter names and level names stay
 * stable for the level map and selection UI.
 */
export const BASE_CHAPTERS: readonly (readonly LevelDefinition[])[] = [
    CHAPTER_01,
    CHAPTER_02,
    CHAPTER_03,
    CHAPTER_04,
    CHAPTER_05,
    CHAPTER_06,
    CHAPTER_07,
    CHAPTER_08,
    CHAPTER_09,
    CHAPTER_10,
    ...GENERATED_CHAPTERS,
];
