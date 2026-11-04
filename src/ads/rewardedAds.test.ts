import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RewardedAdOutcome, RewardedAdProvider } from './rewardedAds';

/**
 * Tests for the rewarded-ad seam: a completed watch grants, skipped/closed/
 * failed/unavailable never grant, concurrent taps share one ad, and repeated
 * ads grant again. Pure contracts — no Phaser, no fake ad timers.
 */

const fakeProvider = (show: () => Promise<RewardedAdOutcome>): RewardedAdProvider => ({
    id: 'fake',
    isConfigured: () => true,
    load: () => Promise.resolve(),
    show,
});

describe('rewarded ad module', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('reports unavailable when no provider is configured — no fake ad', async () => {
        vi.resetModules();
        const ads = await import('./rewardedAds');

        expect(ads.hasConfiguredRewardedAds()).toBe(false);

        const outcome = await ads.showRewardedAd();

        expect(outcome).toBe('unavailable');
        expect(ads.extraBallsRewardFor(outcome)).toBe(0);
    });

    it('grants the reward only on successful completion', async () => {
        vi.resetModules();
        const ads = await import('./rewardedAds');
        ads.configureRewardedAds(fakeProvider(() => Promise.resolve('granted')));

        const outcome = await ads.showRewardedAd();

        expect(outcome).toBe('granted');
        expect(ads.extraBallsRewardFor(outcome)).toBe(3);
    });

    it('grants nothing for a skipped or closed video', async () => {
        vi.resetModules();
        const ads = await import('./rewardedAds');
        ads.configureRewardedAds(fakeProvider(() => Promise.resolve('dismissed')));

        const outcome = await ads.showRewardedAd();

        expect(outcome).toBe('dismissed');
        expect(ads.extraBallsRewardFor(outcome)).toBe(0);
    });

    it('grants nothing when the ad fails during playback', async () => {
        vi.resetModules();
        const ads = await import('./rewardedAds');
        ads.configureRewardedAds(fakeProvider(() => Promise.resolve('failed')));

        const outcome = await ads.showRewardedAd();

        expect(outcome).toBe('failed');
        expect(ads.extraBallsRewardFor(outcome)).toBe(0);
    });

    it('grants nothing when the provider errors out', async () => {
        vi.resetModules();
        const ads = await import('./rewardedAds');
        ads.configureRewardedAds(fakeProvider(() => Promise.reject(new Error('broken'))));

        const outcome = await ads.showRewardedAd();

        expect(outcome).toBe('failed');
        expect(ads.extraBallsRewardFor(outcome)).toBe(0);
    });

    it('grants nothing when the SDK fails to load', async () => {
        vi.resetModules();
        const ads = await import('./rewardedAds');
        let loadAttempts = 0;
        ads.configureRewardedAds({
            id: 'broken-loader',
            isConfigured: () => true,
            load: () => {
                loadAttempts += 1;
                return Promise.reject(new Error('no sdk'));
            },
            show: () => Promise.resolve('granted'),
        });

        const outcome = await ads.showRewardedAd();

        expect(loadAttempts).toBe(1);
        expect(outcome).toBe('unavailable');
        expect(ads.extraBallsRewardFor(outcome)).toBe(0);
    });

    it('coalesces concurrent requests into a single advertisement call', async () => {
        vi.resetModules();
        const ads = await import('./rewardedAds');
        const show = vi.fn(() => Promise.resolve('granted' as const));
        ads.configureRewardedAds(fakeProvider(show as never));

        const [first, second, third] = await Promise.all([
            ads.showRewardedAd(),
            ads.showRewardedAd(),
            ads.showRewardedAd(),
        ]);

        // One tap storm → one ad → one claimable outcome, never duplicates.
        expect(show).toHaveBeenCalledTimes(1);
        expect(first).toBe('granted');
        expect(second).toBe('granted');
        expect(third).toBe('granted');
    });

    it('runs a second advertisement (and reward) after the first finished', async () => {
        vi.resetModules();
        const ads = await import('./rewardedAds');
        ads.configureRewardedAds(fakeProvider(() => Promise.resolve('granted')));

        const first = ads.extraBallsRewardFor(await ads.showRewardedAd());
        const second = ads.extraBallsRewardFor(await ads.showRewardedAd());

        expect(first).toBe(3);
        expect(second).toBe(3);
    });

    it('never maps non-granted outcomes to a reward', async () => {
        vi.resetModules();
        const ads = await import('./rewardedAds');

        expect(ads.extraBallsRewardFor('granted')).toBe(3);
        expect(ads.extraBallsRewardFor('dismissed')).toBe(0);
        expect(ads.extraBallsRewardFor('failed')).toBe(0);
        expect(ads.extraBallsRewardFor('unavailable')).toBe(0);
    });
});

describe('yandex games adapter', () => {
    interface CapturedCallbacks {
        onRewarded(): void;
        onClose(): void;
        onError(): void;
    }

    /**
     * Captures the callbacks of a simulated `showRewardedVideo` call so a test
     * can drive the SDK's event sequence (reward / close / error orderings).
     */
    let captured: CapturedCallbacks | null = null;

    const setupSdk = (): void => {
        vi.stubGlobal('document', {
            querySelector: () => null,
            createElement: () => ({ addEventListener: () => undefined }),
            head: { appendChild: () => undefined },
        });
        vi.stubGlobal('window', {
            YaGames: {
                init: async () => ({
                    adv: {
                        showRewardedVideo: (options: { callbacks: CapturedCallbacks }) => {
                            captured = options.callbacks;
                        },
                    },
                }),
            },
        });
    };

    beforeEach(() => {
        vi.resetModules();
        captured = null;
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('maps reward + close to a granted outcome', async () => {
        setupSdk();
        const { yandexGamesProvider } = await import('./providers/yandexGames');
        await yandexGamesProvider.load();

        const promise = yandexGamesProvider.show();
        captured?.onRewarded();
        captured?.onClose();

        await expect(promise).resolves.toBe('granted');
    });

    it('maps a close without reward (skip) to dismissed', async () => {
        setupSdk();
        const { yandexGamesProvider } = await import('./providers/yandexGames');
        await yandexGamesProvider.load();

        const promise = yandexGamesProvider.show();
        captured?.onClose();

        await expect(promise).resolves.toBe('dismissed');
    });

    it('maps provider errors to failed and ignores the late close', async () => {
        setupSdk();
        const { yandexGamesProvider } = await import('./providers/yandexGames');
        await yandexGamesProvider.load();

        const promise = yandexGamesProvider.show();
        captured?.onError();
        captured?.onClose();

        await expect(promise).resolves.toBe('failed');
    });

    it('settles exactly once for duplicated SDK callbacks', async () => {
        setupSdk();
        const { yandexGamesProvider } = await import('./providers/yandexGames');
        await yandexGamesProvider.load();

        const promise = yandexGamesProvider.show();
        // Spurious duplicate events fire twice; only the first settlement wins.
        captured?.onRewarded();
        captured?.onRewarded();
        captured?.onClose();
        captured?.onClose();

        await expect(promise).resolves.toBe('granted');
    });

    it('rejects show() when the SDK was never initialised', async () => {
        const { yandexGamesProvider } = await import('./providers/yandexGames');

        await expect(yandexGamesProvider.show()).rejects.toThrow('not initialised');
    });

    it('degrades to unavailable after the SDK failed to initialise (no window)', async () => {
        // No window/document globals on the node test runner.
        const { yandexGamesProvider } = await import('./providers/yandexGames');

        await expect(yandexGamesProvider.load()).rejects.toThrow();
        expect(yandexGamesProvider.isConfigured()).toBe(false);

        // Later attempts short-circuit with the same answer.
        await expect(yandexGamesProvider.load()).rejects.toThrow();
    });

    it('keeps the official SDK script URL', async () => {
        const { YANDEX_GAMES_SDK_URL } = await import('./providers/yandexGames');

        expect(YANDEX_GAMES_SDK_URL).toBe('https://yandex.ru/games/sdk/v2');
    });
});
