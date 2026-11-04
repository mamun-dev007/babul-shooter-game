import type { ChapterDefinition, LevelDefinition } from './types';

/**
 * Attaches chapter metadata once instead of repeating it on every level.
 * Freezing keeps the catalog immutable after module initialisation.
 */
export function defineChapter(definition: ChapterDefinition): readonly LevelDefinition[] {
    return definition.levels.map((level) =>
        Object.freeze({
            ...level,
            chapter: definition.id,
            chapterName: definition.name,
            layout: Object.freeze([...level.layout]),
            colors: Object.freeze([...level.colors]),
            objective: Object.freeze({ ...level.objective }),
            starThresholds: Object.freeze([...level.starThresholds]) as unknown as readonly [
                number,
                number,
                number,
            ],
        })
    );
}
