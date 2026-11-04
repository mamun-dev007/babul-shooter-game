import { BASE_CHAPTERS } from './base-chapters';
import { buildProgressionChapters } from './progression';
import type { ProgressionLevelDefinition } from './types';

/**
 * The campaign is built once from chapter metadata. Every exported level is a
 * fixed-board progression configuration with its own bubble count, shot
 * budget and star limits.
 */
export const CHAPTERS = buildProgressionChapters(BASE_CHAPTERS);

export const LEVELS: readonly ProgressionLevelDefinition[] = CHAPTERS.flat();

export const LEVEL_COUNT = LEVELS.length;

export const getLevel = (index: number): ProgressionLevelDefinition =>
    LEVELS[Math.max(0, Math.min(LEVELS.length - 1, Math.floor(index)))];

export const getLevelById = (id: number): ProgressionLevelDefinition | undefined =>
    LEVELS.find((level) => level.id === id);

export const firstLevelOfChapter = (chapterId: number): ProgressionLevelDefinition | undefined =>
    LEVELS.find((level) => level.chapter === chapterId);

export type {
    LevelDefinition,
    LevelObjective,
    LayoutCell,
    ProgressionLevelDefinition,
} from './types';
export {
    buildLevelMap,
    buildLevelMapPath,
    levelMapHeight,
    levelMapNodePosition,
    mapNodeTint,
    NODE_TINT_COLORS,
} from './map';
export type { LevelMapEntry, LevelMapPoint, MapNodeTint } from './map';
