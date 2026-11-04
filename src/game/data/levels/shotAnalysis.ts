import type { BubbleColorName } from '../../config';
import { countLayoutBubbles } from './layout';
import type { LevelDefinition } from './types';

export const SMART_SHOT_ALLOWANCE = 2;

export interface SmartShotAnalysis {
  readonly estimatedRequiredShots: number;
  readonly mistakeAllowance: number;
  readonly totalAllowedShots: number;
  readonly difficulty: 'easy' | 'medium' | 'hard';
  readonly method: 'configured' | 'layout-analysis';
}

const key = (row: number, col: number): string => `${row}:${col}`;

/** Conservative deterministic estimate based on same-colour connected groups and board reachability. */
export function calculateRequiredShots(level: LevelDefinition): SmartShotAnalysis {
  const bubbleCount = countLayoutBubbles(level);
  const configured = level.estimatedRequiredShots;
  let estimate: number;

  if (typeof configured === 'number' && Number.isFinite(configured) && configured > 0) {
    estimate = Math.max(1, Math.floor(configured));
  } else {
    const cells = new Map<string, BubbleColorName>();
    level.layout.forEach((rowText, row) => {
      [...rowText].forEach((token, col) => {
        const color = token === 'R' ? 'red' : token === 'O' ? 'orange' : token === 'Y' ? 'yellow' :
          token === 'G' ? 'green' : token === 'B' ? 'blue' : token === 'P' ? 'purple' : null;
        if (color) cells.set(key(row, col), color);
      });
    });

    const visited = new Set<string>();
    const componentSizes: number[] = [];
    let isolatedCeilingAnchors = 0;
    for (const [start, color] of cells) {
      if (visited.has(start)) continue;
      const queue = [start];
      const component: string[] = [];
      visited.add(start);
      while (queue.length) {
        const current = queue.shift()!;
        component.push(current);
        const [row, col] = current.split(':').map(Number);
        for (const neighbour of [[row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]]) {
          const neighbourKey = key(neighbour[0], neighbour[1]);
          if (!visited.has(neighbourKey) && cells.get(neighbourKey) === color) {
            visited.add(neighbourKey);
            queue.push(neighbourKey);
          }
        }
      }
      componentSizes.push(component.length);
      if (!component.some((cell) => cell.startsWith('0:'))) isolatedCeilingAnchors += 1;
    }

    const matchShots = componentSizes.reduce((sum, size) => sum + Math.ceil(size / 3), 0);
    const reachPenalty = Math.ceil(isolatedCeilingAnchors * (level.colors.length > 3 ? 0.5 : 0.25));
    estimate = bubbleCount > 0
      ? Math.min(bubbleCount, Math.max(1, matchShots + reachPenalty))
      : 0;
  }

  const totalAllowedShots = estimate + SMART_SHOT_ALLOWANCE;
  const difficulty = level.colors.length >= 5 || level.layout.length >= 7 || totalAllowedShots >= 50 ? 'hard' :
    level.colors.length >= 3 || level.layout.length >= 5 ? 'medium' : 'easy';
  return { estimatedRequiredShots: estimate, mistakeAllowance: SMART_SHOT_ALLOWANCE, totalAllowedShots, difficulty, method: configured ? 'configured' : 'layout-analysis' };
}

export const smartShotBudget = (level: LevelDefinition): SmartShotAnalysis => calculateRequiredShots(level);
