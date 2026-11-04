import {
    BUBBLE_RADIUS,
    COLOR_NAMES,
    DANGER_Y,
    GAME_WIDTH,
    GRID_COLS,
    GRID_ROWS,
    GRID_TOP,
    WALL_LEFT,
    WALL_RIGHT,
} from '../../config';
import { neighbourCells } from '../../systems/geometry';
import { LAYOUT_COLOR_TOKENS, LAYOUT_EMPTY } from './colors';
import { starLimitsForShots } from './progression';
import type { LayoutCell, LevelDefinition, ProgressionLevelDefinition } from './types';
import { smartShotBudget } from './shotAnalysis';

export type ValidationSeverity = 'error' | 'warning';

export interface ValidationIssue {
    readonly severity: ValidationSeverity;
    readonly code: string;
    readonly levelId: number | null;
    readonly levelName: string;
    readonly message: string;
}

export interface LevelValidationResult {
    readonly levelId: number;
    readonly levelName: string;
    readonly bubbleCount: number;
    readonly layoutRows: number;
    readonly estimatedRequiredShots: number;
    readonly mistakeAllowance: number;
    readonly totalAllowedShots: number;
    readonly colors: readonly string[];
    readonly difficulty: 'easy' | 'medium' | 'hard';
    readonly issues: readonly ValidationIssue[];
}

export interface LevelValidationReport {
    readonly levels: readonly LevelValidationResult[];
    readonly errors: readonly ValidationIssue[];
    readonly warnings: readonly ValidationIssue[];
    /** Levels with no human sign-off yet. Automated checks are not playtests. */
    readonly manualBalancePending: readonly number[];
}

interface ParsedLayout {
    readonly cells: readonly LayoutCell[];
    readonly tokens: Set<string>;
    readonly issues: ValidationIssue[];
}

const issue = (
    severity: ValidationSeverity,
    code: string,
    level: Pick<LevelDefinition, 'id' | 'name'>,
    message: string
): ValidationIssue => ({
    severity,
    code,
    levelId: Number.isFinite(level.id) ? level.id : null,
    levelName: level.name || '(unnamed)',
    message,
});

const isInteger = (value: number): boolean => Number.isInteger(value);

function parseLayout(level: LevelDefinition): ParsedLayout {
    const cells: LayoutCell[] = [];
    const tokens = new Set<string>();
    const issues: ValidationIssue[] = [];

    if (level.layout.length === 0) {
        issues.push(issue('error', 'layout-empty', level, 'Layout has no rows.'));
        return { cells, tokens, issues };
    }

    if (level.layout.length > GRID_ROWS) {
        issues.push(
            issue(
                'error',
                'layout-too-tall',
                level,
                `Layout has ${level.layout.length} rows; the grid supports ${GRID_ROWS}.`
            )
        );
    }

    level.layout.forEach((rowText, row) => {
        if (rowText.length !== GRID_COLS) {
            issues.push(
                issue(
                    'error',
                    'layout-row-width',
                    level,
                    `Row ${row} has ${rowText.length} columns; expected ${GRID_COLS}.`
                )
            );
        }

        for (let col = 0; col < rowText.length; col++) {
            const token = rowText[col];

            if (token === LAYOUT_EMPTY) {
                continue;
            }

            tokens.add(token);
            const color = LAYOUT_COLOR_TOKENS[token];

            if (!color) {
                issues.push(
                    issue(
                        'error',
                        'layout-token',
                        level,
                        `Row ${row}, column ${col} uses unknown token "${token}".`
                    )
                );
                continue;
            }

            if (row < GRID_ROWS && col < GRID_COLS) {
                cells.push({ row, col, color });
            }
        }
    });

    if (cells.length === 0) {
        issues.push(issue('error', 'layout-empty', level, 'Layout contains no bubbles.'));
    }

    return { cells, tokens, issues };
}

const cellKey = (row: number, col: number): string => `${row}:${col}`;

function findFloatingCells(cells: readonly LayoutCell[]): LayoutCell[] {
    if (cells.length === 0) {
        return [];
    }

    const occupied = new Map<string, LayoutCell>();
    cells.forEach((cell) => occupied.set(cellKey(cell.row, cell.col), cell));

    const visited = new Set<string>();
    const queue: LayoutCell[] = cells.filter((cell) => cell.row === 0);

    while (queue.length > 0) {
        const current = queue.shift();

        if (!current) {
            break;
        }

        const key = cellKey(current.row, current.col);

        if (visited.has(key)) {
            continue;
        }

        visited.add(key);

        for (const neighbour of neighbourCells(current.row, current.col, 0)) {
            const next = occupied.get(cellKey(neighbour.row, neighbour.col));

            if (next && !visited.has(cellKey(next.row, next.col))) {
                queue.push(next);
            }
        }
    }

    return cells.filter((cell) => !visited.has(cellKey(cell.row, cell.col)));
}

function findDuplicate(values: readonly string[]): string | null {
    const seen = new Set<string>();

    for (const value of values) {
        if (seen.has(value)) {
            return value;
        }

        seen.add(value);
    }

    return null;
}

export function validateLevel(
    level: LevelDefinition,
    levelIndex = 0
): LevelValidationResult {
    const issues: ValidationIssue[] = [];
    const add = (severity: ValidationSeverity, code: string, message: string): void => {
        issues.push(issue(severity, code, level, message));
    };

    const progression = level as Partial<ProgressionLevelDefinition>;
    const fixedBoard = progression.fixedBoard === true;

    if (!Number.isInteger(level.id) || level.id <= 0) {
        add('error', 'id-invalid', 'Level id must be a positive integer.');
    }

    if (!Number.isInteger(level.chapter) || level.chapter <= 0) {
        add('error', 'chapter-invalid', 'Chapter must be a positive integer.');
    }

    if (!level.name.trim()) {
        add('error', 'name-empty', 'Level name is empty.');
    }

    if (!level.description.trim()) {
        add('warning', 'description-empty', 'Level has no description for the map.');
    }

    if (level.id !== levelIndex + 1) {
        add(
            'warning',
            'id-order',
            `Level id ${level.id} does not match catalog position ${levelIndex + 1}.`
        );
    }

    const { cells, tokens, issues: layoutIssues } = parseLayout(level);
    issues.push(...layoutIssues);

    const supported = new Set<string>(COLOR_NAMES);
    const declared = new Set<string>(level.colors);

    if (level.colors.length < 2) {
        add('error', 'colors-too-few', 'At least two bubble colours are required.');
    }

    const duplicateColor = findDuplicate(level.colors);

    if (duplicateColor) {
        add('error', 'colors-duplicate', `Colour "${duplicateColor}" is declared more than once.`);
    }

    level.colors.forEach((color) => {
        if (!supported.has(color)) {
            add('error', 'color-unsupported', `Colour "${color}" is not supported by the game.`);
        }
    });

    tokens.forEach((token) => {
        const color = LAYOUT_COLOR_TOKENS[token];

        if (color && !declared.has(color)) {
            add(
                'error',
                'color-undeclared',
                `Layout uses ${color}, but it is not in the level's colour list.`
            );
        }
    });

    if (cells.length > 0) {
        level.colors.forEach((color) => {
            if (!cells.some((cell) => cell.color === color)) {
                add(
                    'error',
                    'color-unused',
                    `Declared colour "${color}" does not appear in the layout.`
                );
            }
        });
    }

    if (cells.length > 0 && !cells.some((cell) => cell.row === 0)) {
        add('error', 'layout-unanchored', 'Top row is empty, so the board has no anchor.');
    }

    const floating = findFloatingCells(cells);

    if (floating.length > 0) {
        const sample = floating
            .slice(0, 3)
            .map((cell) => `${cell.row}:${cell.col}`)
            .join(', ');
        add(
            'error',
            'layout-floating',
            `${floating.length} cell(s) are not connected to the top row (${sample}).`
        );
    }

    let lastRow = 0;

    cells.forEach((cell) => {
        lastRow = Math.max(lastRow, cell.row);

        const shift = (cell.row & 1) === 1 ? BUBBLE_RADIUS : 0;
        const x = WALL_LEFT + cell.col * BUBBLE_RADIUS * 2 + shift;
        const y = GRID_TOP + BUBBLE_RADIUS + cell.row * BUBBLE_RADIUS * Math.sqrt(3);
        const withinWalls = x >= WALL_LEFT - 0.001 && x <= WALL_RIGHT + 0.001;
        const withinScreen = x - BUBBLE_RADIUS >= 0 && x + BUBBLE_RADIUS <= GAME_WIDTH;

        if (!withinWalls || !withinScreen) {
            add(
                'error',
                'cell-outside-playfield',
                `Cell ${cell.row}:${cell.col} is outside the horizontal playfield.`
            );
        }

        if (!fixedBoard && y + BUBBLE_RADIUS >= DANGER_Y) {
            add(
                'error',
                'board-intrudes-danger',
                `Cell ${cell.row}:${cell.col} starts on or below the danger line.`
            );
        }
    });

    if (!isInteger(level.maxShots) || level.maxShots <= 0) {
        add('error', 'shots-invalid', 'maxShots must be a positive integer.');
    }

    if (fixedBoard) {
        const totalBubbles = progression.totalBubbles;
        const totalShots = progression.totalShots;
        const threeStarLimit = progression.threeStarLimit;
        const twoStarLimit = progression.twoStarLimit;
        const oneStarLimit = progression.oneStarLimit;

        if (!isInteger(totalBubbles ?? 0) || (totalBubbles ?? 0) <= 0) {
            add('error', 'bubbles-invalid', 'Fixed boards need a positive integer totalBubbles.');
        } else if (totalBubbles !== cells.length) {
            add(
                'error',
                'bubbles-mismatch',
                `totalBubbles is ${totalBubbles}, but the layout contains ${cells.length} bubbles.`
            );
        }

        if (!isInteger(totalShots ?? 0) || (totalShots ?? 0) <= 0) {
            add('error', 'total-shots-invalid', 'Fixed boards need a positive integer totalShots.');
        } else if (totalShots !== level.maxShots) {
            add(
                'error',
                'total-shots-mismatch',
                `totalShots ${totalShots} must equal maxShots ${level.maxShots}.`
            );
        }

        if (level.shotsPerDrop !== 0) {
            add(
                'error',
                'fixed-drop-invalid',
                'Fixed boards must set shotsPerDrop to 0; no row may be added after generation.'
            );
        }

        if (progression.dangerEnabled !== false) {
            add('error', 'fixed-danger-enabled', 'Fixed boards must disable the danger line.');
        }

        if (level.objective.type !== 'clear-board') {
            add('error', 'fixed-objective-invalid', 'Fixed-board levels must clear the board.');
        }

        const limits = [threeStarLimit, twoStarLimit, oneStarLimit];

        if (limits.some((value) => !isInteger(value ?? 0) || (value ?? 0) <= 0)) {
            add(
                'error',
                'star-limits-invalid',
                'Fixed boards need positive integer three, two and one star shot limits.'
            );
        } else if (
            !(
                (threeStarLimit as number) < (twoStarLimit as number) &&
                (twoStarLimit as number) < (oneStarLimit as number)
            )
        ) {
            add('error', 'star-limits-order', 'Shot star limits must be strictly ascending.');
        } else if (isInteger(totalShots ?? 0) && (totalShots ?? 0) > 0) {
            const expected = starLimitsForShots(totalShots as number);

            if (
                threeStarLimit !== expected.threeStarLimit ||
                twoStarLimit !== expected.twoStarLimit ||
                oneStarLimit !== expected.oneStarLimit
            ) {
                add(
                    'error',
                    'star-limits-mismatch',
                    `Shot limits ${threeStarLimit}/${twoStarLimit}/${oneStarLimit} do not match the 50%/70%/100% budget of ${expected.threeStarLimit}/${expected.twoStarLimit}/${expected.oneStarLimit}.`
                );
            }
        }
    } else {
        if (!isInteger(level.shotsPerDrop) || level.shotsPerDrop <= 0) {
            add('error', 'drop-interval-invalid', 'shotsPerDrop must be a positive integer.');
        }

        if (isInteger(level.shotsPerDrop) && level.shotsPerDrop > level.maxShots) {
            add('warning', 'drop-interval-too-large', 'No row drop can occur within the shot limit.');
        }
    }

    const threshold = level.starThresholds;

    if (
        threshold.length !== 3 ||
        threshold.some((value) => !isInteger(value) || value < 0)
    ) {
        add('error', 'stars-invalid', 'Star thresholds must be three non-negative integers.');
    } else if (!(threshold[0] < threshold[1] && threshold[1] < threshold[2])) {
        add('error', 'stars-order', 'Star thresholds must be strictly ascending.');
    }

    if (level.objective.type === 'score') {
        const target = level.objective.targetScore;

        if (!isInteger(target) || target <= 0) {
            add('error', 'objective-invalid', 'Score objective must be a positive integer.');
        }

        if (threshold[0] !== target) {
            add(
                'warning',
                'stars-target-mismatch',
                `First star threshold ${threshold[0]} does not equal the score objective ${target}.`
            );
        }

        const availableBubbles = cells.length + Math.max(0, level.maxShots);
        const baseCapacity = availableBubbles * 10;
        const absoluteCapacity = availableBubbles * 35;

        if (target > baseCapacity) {
            add(
                'error',
                'objective-over-capacity',
                `Target ${target} exceeds the base score capacity ${baseCapacity} of the initial board plus all shots.`
            );
        }

        if (level.maxShots > 0 && target > level.maxShots * 30) {
            add(
                'error',
                'objective-shot-budget',
                `Target ${target} needs more than one 3-match per shot (${level.maxShots} shots).`
            );
        } else if (level.maxShots > 0 && target > level.maxShots * 20) {
            add(
                'warning',
                'objective-combo-dependent',
                `Target ${target} requires above-average combo play across ${level.maxShots} shots.`
            );
        }

        if (threshold[2] > absoluteCapacity) {
            add(
                'error',
                'stars-over-capacity',
                `Three-star threshold ${threshold[2]} exceeds the absolute score capacity ${absoluteCapacity}.`
            );
        }
    } else if (level.objective.type === 'clear-board') {
        if (!fixedBoard && threshold[0] <= 0) {
            add('warning', 'stars-clear-board', 'Clear-board levels still need positive star thresholds.');
        }
    } else {
        add('error', 'objective-unknown', 'Unknown objective type.');
    }

    if (!fixedBoard && level.maxShots > 0 && level.shotsPerDrop > 0 && cells.length > 0) {
        const worstDropRows =
            level.layout.length + Math.floor(level.maxShots / level.shotsPerDrop);
        const worstBottom =
            GRID_TOP + BUBBLE_RADIUS + Math.max(0, worstDropRows - 1) * BUBBLE_RADIUS * Math.sqrt(3) +
            BUBBLE_RADIUS;

        if (worstBottom >= DANGER_Y) {
            add(
                'warning',
                'unchecked-drop-pressure',
                'If no bubbles are cleared, unchecked row drops can reach the danger line before the last shot.'
            );
        }
    }

    if (!level.playtested) {
        // Manual balance is intentionally not an error: structure can be valid
        // while human playtesting is still outstanding.
    }

    const budget = smartShotBudget(level);
    return {
        levelId: level.id,
        levelName: level.name,
        bubbleCount: cells.length,
        layoutRows: level.layout.length,
        estimatedRequiredShots: budget.estimatedRequiredShots,
        mistakeAllowance: budget.mistakeAllowance,
        totalAllowedShots: budget.totalAllowedShots,
        colors: level.colors,
        difficulty: budget.difficulty,
        issues,
    };
}

export function validateLevels(levels: readonly LevelDefinition[]): LevelValidationReport {
    const results: LevelValidationResult[] = [];
    const globalIssues: ValidationIssue[] = [];
    const seenIds = new Map<number, string>();
    const seenNames = new Map<string, number>();

    levels.forEach((level, index) => {
        const duplicateName = seenNames.get(level.name);

        if (duplicateName !== undefined) {
            globalIssues.push(
                issue(
                    'warning',
                    'name-duplicate',
                    level,
                    `Name is also used by level ${duplicateName}.`
                )
            );
        }

        seenNames.set(level.name, level.id);

        const existing = seenIds.get(level.id);

        if (existing !== undefined) {
            globalIssues.push(
                issue('error', 'id-duplicate', level, `Id ${level.id} is also used by "${existing}".`)
            );
        }

        seenIds.set(level.id, level.name);
        results.push(validateLevel(level, index));
    });

    const allIssues = [...globalIssues, ...results.flatMap((result) => result.issues)];
    const errors = allIssues.filter((entry) => entry.severity === 'error');
    const warnings = allIssues.filter((entry) => entry.severity === 'warning');
    const manualBalancePending = levels
        .filter((level) => !level.playtested)
        .map((level) => level.id);

    return {
        levels: results,
        errors,
        warnings,
        manualBalancePending,
    };
}

function formatRanges(ids: readonly number[]): string {
    if (ids.length === 0) {
        return 'none';
    }

    const sorted = [...ids].sort((a, b) => a - b);
    const ranges: string[] = [];
    let start = sorted[0];
    let end = sorted[0];

    for (let index = 1; index < sorted.length; index++) {
        if (sorted[index] === end + 1) {
            end = sorted[index];
            continue;
        }

        ranges.push(start === end ? `${start}` : `${start}-${end}`);
        start = sorted[index];
        end = sorted[index];
    }

    ranges.push(start === end ? `${start}` : `${start}-${end}`);
    return ranges.join(', ');
}

export function formatValidationReport(report: LevelValidationReport): string {
    const lines: string[] = [];
    lines.push(`Level validation: ${report.levels.length} configurations`);
    lines.push(
        `Structural checks: ${report.levels.length - new Set(report.errors.map((entry) => entry.levelId)).size} passed, ${new Set(report.errors.map((entry) => entry.levelId)).size} with errors`
    );
    lines.push(`Errors: ${report.errors.length}`);
    lines.push(`Warnings: ${report.warnings.length}`);
    lines.push('');
    lines.push('SMART SHOT BUDGETS');
    report.levels.forEach((level) => {
        lines.push(`  L${level.levelId} ${level.levelName}: bubbles=${level.bubbleCount}, required=${level.estimatedRequiredShots}, allowance=${level.mistakeAllowance}, total=${level.totalAllowedShots}, colors=${level.colors.join('/')}, difficulty=${level.difficulty}`);
    });

    if (report.errors.length > 0) {
        lines.push('');
        lines.push('ERRORS');
        report.errors.forEach((entry) => {
            lines.push(`  L${entry.levelId ?? '?'} ${entry.levelName} [${entry.code}] ${entry.message}`);
        });
    }

    if (report.warnings.length > 0) {
        lines.push('');
        lines.push('WARNINGS');
        report.warnings.forEach((entry) => {
            lines.push(`  L${entry.levelId ?? '?'} ${entry.levelName} [${entry.code}] ${entry.message}`);
        });
    }

    lines.push('');
    lines.push(
        `Manual balance still pending: ${report.manualBalancePending.length > 0 ? formatRanges(report.manualBalancePending) : 'none'}`
    );
    lines.push(
        'Note: structural validation and shot-economy checks are not playtests and do not prove balance.'
    );

    return lines.join('\n');
}
