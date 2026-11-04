import { createServer } from 'vite';

const server = await createServer({
    configFile: false,
    logLevel: 'error',
    server: { middlewareMode: true },
    appType: 'custom',
});

try {
    const { LEVELS } = await server.ssrLoadModule('/src/game/data/levels/index.ts');
    const { generateLevelLayout } = await server.ssrLoadModule('/src/game/data/levels/randomLayout.ts');
    const { analyzeLayout } = await server.ssrLoadModule('/src/game/data/levels/randomLayout.ts');
    const { difficultyLabelForLevel, attemptShotBudgetFor } = await server.ssrLoadModule(
        '/src/game/data/levels/progression.ts'
    );

    const levels = [1, 2, 3, 4, 5, 10, 50, 100, 200, 500, 700, 900, 1000];

    for (const level of levels) {
        const definition = LEVELS[level - 1];
        const start = performance.now();
        const generated = generateLevelLayout(definition);
        const elapsed = (performance.now() - start).toFixed(1);
        const analysis = analyzeLayout(generated.layout, definition.colors);
        const shown = Math.min(generated.layout.length, 4);

        console.log(
            `L${level} "${definition.name}" [${difficultyLabelForLevel(level)}] ` +
            `bubbles=${definition.totalBubbles} ceiling=${definition.totalShots} ` +
            `budget=${attemptShotBudgetFor(level, definition.totalShots, generated.requiredShots)} ` +
            `required=${analysis.requiredShots} ` +
            `pattern=${generated.pattern} ` +
            `rows=${generated.layout.length} colors=${definition.colors.join('/')} ` +
            `gen=${elapsed}ms`
        );
        console.log(generated.layout.slice(0, shown).join('\n') + (shown < generated.layout.length ? '\n...' : ''));
    }
} finally {
    await server.close();
}
