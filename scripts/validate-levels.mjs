import { createServer } from 'vite';

/**
 * Development-only level validator. It loads the TypeScript catalog through
 * Vite so the same data and geometry code used by the game is checked.
 */
const server = await createServer({
    configFile: false,
    logLevel: 'error',
    server: { middlewareMode: true },
    appType: 'custom',
});

try {
    const { LEVELS } = await server.ssrLoadModule('/src/game/data/levels/index.ts');
    const { formatValidationReport, validateLevels } = await server.ssrLoadModule(
        '/src/game/data/levels/validate.ts'
    );

    const report = validateLevels(LEVELS);
    console.log(formatValidationReport(report));

    if (report.errors.length > 0) {
        process.exitCode = 1;
    }
} catch (error) {
    console.error(error);
    process.exitCode = 1;
} finally {
    await server.close();
}
