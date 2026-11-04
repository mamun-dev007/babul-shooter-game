import { createServer } from 'vite';

/**
 * Development-only smoke test for the 1000-level snake map:
 * unlocks, states, page scrolling and path geometry.
 */
const server = await createServer({
    configFile: false,
    logLevel: 'error',
    server: { middlewareMode: true },
    appType: 'custom',
});

const fail = (message) => {
    console.error(`SMOKE FAIL: ${message}`);
    process.exitCode = 1;
};

try {
    const levels = await server.ssrLoadModule('/src/game/data/levels/index.ts');
    const map = await server.ssrLoadModule('/src/game/data/levels/map.ts');
    const progress = await server.ssrLoadModule('/src/game/data/levels/progress.ts');

    const LEVELS = levels.LEVELS;
    const VIEW_TOP = 108;
    const VIEW_BOTTOM = 742;

    const visibleNodesAt = (scroll) => {
        const visible = [];
        for (let k = 0; k < LEVELS.length; k++) {
            const y = map.levelMapNodePosition(k, LEVELS.length).y + scroll;
            if (y >= VIEW_TOP - 1 && y <= VIEW_BOTTOM + 1) visible.push(k + 1);
        }
        return visible;
    };

    // 1-2. Exactly 1000 levels, ids 1..1000.
    if (LEVELS.length !== 1000) fail(`catalog length ${LEVELS.length}`);
    for (let i = 0; i < LEVELS.length; i++) {
        if (LEVELS[i].id !== i + 1) {
            fail(`id mismatch at ${i}: ${LEVELS[i].id}`);
            break;
        }
    }

    // 3. Snake path bends right then left and always climbs.
    const path = map.buildLevelMapPath(LEVELS.length);
    if (path[2].x <= map.MAP_PATH_CENTER) fail('path does not bend right on first quarter');
    if (path[7].x >= map.MAP_PATH_CENTER) fail('path does not bend left on third quarter');
    for (let i = 1; i < path.length; i++) {
        if (path[i].y >= path[i - 1].y) { fail(`path not climbing at ${i}`); break; }
    }

    // 4-6. Ten levels per page for every page, incl. the final one.
    for (let page = 0; page < 100; page++) {
        const scroll = map.levelMapPageScroll(page * 10, LEVELS.length, VIEW_TOP, VIEW_BOTTOM);
        const visible = visibleNodesAt(scroll);
        if (visible.length !== 10 || visible[0] !== page * 10 + 1 || visible[9] !== page * 10 + 10) {
            fail(`page ${page} shows ${visible.length}: ${visible[0]}..${visible[visible.length - 1]}`);
            break;
        }
    }

    // Continuous scroll: stepping one node spacing at a time must reveal
    // levels one by one (no page jumps, no skips), never more than 10 visible.
    const spacing = map.MAP_NODE_SPACING;
    let scroll = map.levelMapPageScroll(0, LEVELS.length, VIEW_TOP, VIEW_BOTTOM);
    let previousFirst = visibleNodesAt(scroll)[0];
    for (let step = 0; step < 40; step++) {
        scroll = Math.min(
            map.mapScrollBounds(LEVELS.length, VIEW_TOP, VIEW_BOTTOM).max,
            scroll + spacing
        );
        const visible = visibleNodesAt(scroll);
        if (visible.length > 10) {
            fail(`continuous scroll step ${step} shows ${visible.length} nodes (> 10)`);
            break;
        }
        const nextFirst = visible[0];
        if (nextFirst !== previousFirst && nextFirst !== previousFirst + 1) {
            fail(`continuous scroll jumped from ${previousFirst} to ${nextFirst}`);
            break;
        }
        previousFirst = nextFirst;
    }
    // Far end of the snake: the top limit still leaves level 1000 reachable.
    const endScroll = map.mapScrollBounds(LEVELS.length, VIEW_TOP, VIEW_BOTTOM).max;
    const lastVisible = visibleNodesAt(endScroll);
    if (lastVisible[lastVisible.length - 1] !== 1000) fail(`top scroll ends at ${lastVisible[lastVisible.length - 1]}`);

    // 7-9. Sequential unlock: only completed levels have advanced the frontier.
    const midProgress = { highestLevel: 123, completedLevels: [77], stars: { 77: 2 } };
    if (progress.resolveLevelProgressState(77, midProgress) !== 'completed') fail('completed state');
    if (progress.resolveLevelProgressState(123, midProgress) !== 'unlocked') fail('frontier unlocked');
    if (progress.resolveLevelProgressState(124, midProgress) !== 'locked') fail('locked after frontier');
    // 11. Scene auto-scroll behaviour: the furthest unlocked index is highlighted.
    if (progress.suggestedLevelIndex(1000, {}) !== 0) fail('fresh save should start at level 1');
    const furthest = Math.min(midProgress.highestLevel, 999);
    const autoScroll = map.levelMapPageScroll(furthest, LEVELS.length, VIEW_TOP, VIEW_BOTTOM);
    const y = map.levelMapNodePosition(furthest, LEVELS.length).y + autoScroll;
    if (y < VIEW_TOP || y > VIEW_BOTTOM) fail(`auto-scroll puts level ${furthest + 1} outside viewport (${y})`);

    // Entries carry saved stars.
    const entries = map.buildLevelMap(LEVELS, midProgress);
    if (entries.length !== 1000 || entries[77].stars !== 2 || entries[123].state !== 'unlocked') {
        fail('map entries did not attach progress');
    }

    console.log(
        `SMOKE OK: levels=${LEVELS.length}, pages=100, snake x(${path[2].x}→${path[7].x}),` +
        ` page0 nodes 1-10, last page nodes ${entries[999].id}`
    );
} catch (error) {
    console.error(error);
    process.exitCode = 1;
} finally {
    await server.close();
}
