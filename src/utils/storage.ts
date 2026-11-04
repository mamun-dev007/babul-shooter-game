/**
 * Compatibility entry point. Progress storage lives next to the game systems
 * (`src/game/utils/storage.ts`); keep this re-export so older imports cannot
 * fork into a second, unversioned save format.
 */
export * from '../game/utils/storage';
