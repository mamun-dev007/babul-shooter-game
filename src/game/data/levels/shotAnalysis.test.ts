import { describe, expect, it } from 'vitest';
import { SMART_SHOT_ALLOWANCE, smartShotBudget } from './shotAnalysis';
import type { LevelDefinition } from './types';

const level = (overrides: Partial<LevelDefinition> = {}): LevelDefinition => ({
  id: 1,
  chapter: 1,
  chapterName: 'Test',
  name: 'Budget test',
  description: '',
  layout: ['RRRYYY', 'RRY.YY'],
  colors: ['red', 'yellow'],
  maxShots: 100,
  shotsPerDrop: 8,
  objective: { type: 'clear-board' },
  starThresholds: [100, 200, 300],
  playtested: false,
  ...overrides,
});

describe('smart shot analysis', () => {
  it('adds exactly two mistake shots to a configured estimate', () => {
    const analysis = smartShotBudget(level({ estimatedRequiredShots: 30 }));
    expect(analysis.estimatedRequiredShots).toBe(30);
    expect(analysis.mistakeAllowance).toBe(2);
    expect(analysis.totalAllowedShots).toBe(32);
  });

  it('gives the final shot the opportunity to win', () => {
    const analysis = smartShotBudget(level({ estimatedRequiredShots: 30 }));
    expect(analysis.totalAllowedShots).toBeGreaterThanOrEqual(30);
  });

  it('calculates layouts deterministically and safely', () => {
    const first = smartShotBudget(level());
    const second = smartShotBudget(level());
    expect(first).toEqual(second);
    expect(SMART_SHOT_ALLOWANCE).toBe(2);
  });
});
