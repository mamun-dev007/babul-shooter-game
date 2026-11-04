import { describe, expect, it } from 'vitest';
import { LEVELS } from './index';
import {
    buildLevelMap,
    buildLevelMapPath,
    levelMapHeight,
    levelMapNodePosition,
    levelMapPageScroll,
    mapNodeTint,
    MAP_NODE_SPACING,
    MAP_PATH_CENTER,
    LEVELS_PER_PAGE,
} from './map';

const VIEW_TOP = 108;
const VIEW_BOTTOM = 742;

describe('level map layout', () => {
    it('covers the full 1000-level catalogue', () => {
        expect(LEVELS.length).toBe(1000);
        expect(buildLevelMapPath(LEVELS.length)).toHaveLength(1000);
        expect(LEVELS.every((level) => typeof level.layout?.length === 'number')).toBe(true);
        expect(LEVELS.filter((level) => level.playtested).length).toBeLessThan(LEVELS.length);
    });

    it('places every node above the previous one along the climbing path', () => {
        const path = buildLevelMapPath(LEVELS.length);

        expect(path[0].y).toBeGreaterThan(path[path.length - 1].y);

        for (let index = 1; index < path.length; index++) {
            expect(path[index].x).toBeGreaterThan(60);
            expect(path[index].x).toBeLessThan(480);
            expect(path[index].y).toBeLessThan(path[index - 1].y);
        }
    });

    it('winds like a snake: one full left-right cycle per page of ten nodes', () => {
        const path = buildLevelMapPath(LEVELS.length);

        // One node per even fifth-of-wave stays exactly on the centre line.
        expect(path[0].x).toBeCloseTo(MAP_PATH_CENTER);
        expect(path[5].x).toBeCloseTo(MAP_PATH_CENTER);

        // The curve bends right on the first quarter and left on the third.
        expect(path[2].x).toBeGreaterThan(MAP_PATH_CENTER);
        expect(path[7].x).toBeLessThan(MAP_PATH_CENTER);

        // Amplitude keeps the far bulge well inside the map width.
        const far = path.map((point) => Math.abs(point.x - MAP_PATH_CENTER));
        expect(Math.max(...far)).toBeGreaterThan(140);
    });

    it('uses one identical vertical step between every node', () => {
        const a = levelMapNodePosition(0, 1000);
        const b = levelMapNodePosition(1, 1000);

        expect(levelMapHeight(1000)).toBeGreaterThan(levelMapHeight(100));
        expect(a.y - b.y).toBe(MAP_NODE_SPACING);
        expect(levelMapNodePosition(999, 1000).y).toBeGreaterThan(0);
    });

    it('shows exactly ten levels per page for every scroll position', () => {
        const count = LEVELS.length;

        for (let index = 0; index < count; index += 977) {
            const page = Math.floor(index / LEVELS_PER_PAGE);
            const firstOfPage = page * LEVELS_PER_PAGE;
            const lastOfPage = Math.min(count - 1, firstOfPage + LEVELS_PER_PAGE - 1);
            const scroll = levelMapPageScroll(index, count, VIEW_TOP, VIEW_BOTTOM);

            // Whole-page scrolling: any node of a page scrolls to its page view.
            expect(levelMapPageScroll(firstOfPage, count, VIEW_TOP, VIEW_BOTTOM)).toBe(scroll);
            expect(levelMapPageScroll(lastOfPage, count, VIEW_TOP, VIEW_BOTTOM)).toBe(scroll);

            // All ten nodes of that page sit inside the viewport.
            for (let node = firstOfPage; node <= lastOfPage; node++) {
                const screenY = levelMapNodePosition(node, count).y + scroll;
                expect(screenY).toBeGreaterThanOrEqual(VIEW_TOP - 1);
                expect(screenY).toBeLessThanOrEqual(VIEW_BOTTOM + 1);
            }
        }
    });

    it('keeps the scroll target inside the map bounds at the extremes', () => {
        const count = LEVELS.length;

        const first = levelMapPageScroll(0, count, VIEW_TOP, VIEW_BOTTOM);
        const last = levelMapPageScroll(count - 1, count, VIEW_TOP, VIEW_BOTTOM);

        expect(first).toBeGreaterThanOrEqual(Math.min(0, VIEW_BOTTOM - levelMapHeight(count)));
        expect(last).toBeLessThanOrEqual(VIEW_TOP);
        expect(first).toBeLessThan(last);
    });

    it('cycles blue, purple, green and gold tints per page', () => {
        expect(mapNodeTint(0, 1)).toBe('blue');
        expect(mapNodeTint(10, 2)).toBe('purple');
        expect(mapNodeTint(20, 3)).toBe('green');
        expect(mapNodeTint(30, 4)).toBe('gold');
    });

    it('attaches saved unlock and star state without fabricating levels', () => {
        const entries = buildLevelMap(LEVELS, {
            highestLevel: 1,
            completedLevels: [0],
            stars: { 0: 2 },
        });

        expect(entries).toHaveLength(LEVELS.length);
        expect(entries[0].state).toBe('completed');
        expect(entries[0].stars).toBe(2);
        expect(entries[1].state).toBe('unlocked');
        expect(entries[2].state).toBe('locked');
        expect(entries[2].stars).toBe(0);
        expect(entries[999].id).toBe(LEVELS[999].id);
        expect(entries[999].name).toBe(LEVELS[999].name);
    });
});
