import type { RewardedAdOutcome, RewardedAdProvider } from '../rewardedAds';

/**
 * Real Yandex Games SDK integration (https://yandex.ru/games/sdk/v2).
 *
 * The SDK script is injected lazily on first use and `ysdk.adv.showRewardedVideo`
 * is called for every request. The outcome map follows the official contract:
 * - onRewarded → the player earns the bonus,
 * - onClose without a reward → skipped ('dismissed'),
 * - onError → ('failed').
 * Everything resolves exactly once — late or duplicated SDK callbacks cannot
 * settle the promise a second time.
 */

export const YANDEX_GAMES_SDK_URL = 'https://yandex.ru/games/sdk/v2';

interface YandexRewardedCallbacks {
    onOpen?(): void;
    /** Fired only when the provider itself confirms the earned reward. */
    onRewarded(): void;
    onClose(): void;
    onError?(error: unknown): void;
}

interface YandexGamesAdv {
    showRewardedVideo(options: { callbacks: YandexRewardedCallbacks }): void;
}

interface YandexGamesSdk {
    adv: YandexGamesAdv;
}

interface YandexGamesGlobal {
    init(): Promise<YandexGamesSdk>;
}

declare global {
    interface Window {
        YaGames?: YandexGamesGlobal;
    }
}

let sdk: YandexGamesSdk | null = null;
let initFailure: unknown = null;

const injectSdkScript = (): Promise<void> =>
    new Promise((resolve, reject) => {
        if (typeof window === 'undefined' || typeof document === 'undefined') {
            reject(new Error('Yandex Games SDK requires a browser window.'));
            return;
        }

        if (window.YaGames && typeof window.YaGames.init === 'function') {
            resolve();
            return;
        }

        const existing = document.querySelector<HTMLScriptElement>(
            `script[src="${YANDEX_GAMES_SDK_URL}"]`
        );
        const script = existing ?? document.createElement('script');

        script.addEventListener(
            'load',
            () => {
                if (!window.YaGames || typeof window.YaGames.init !== 'function') {
                    reject(new Error('Yandex Games SDK did not expose YaGames.'));
                    return;
                }
                resolve();
            },
            { once: true }
        );
        script.addEventListener(
            'error',
            () => reject(new Error('Yandex Games SDK script failed to load.')),
            { once: true }
        );

        if (!existing) {
            script.src = YANDEX_GAMES_SDK_URL;
            script.async = true;
            document.head.appendChild(script);
        }
    });

export const yandexGamesProvider: RewardedAdProvider = {
    id: 'yandex-games',

    /**
     * The integration is ready to attempt an ad wherever the SDK is
     * reachable. A previous failed initialisation (e.g. outside the Yandex
     * Games platform) short-circuits to false so the UI can show a clear
     * "unavailable" message immediately.
     */
    isConfigured(): boolean {
        return initFailure === null;
    },

    load(): Promise<void> {
        if (sdk) {
            return Promise.resolve();
        }

        if (initFailure !== null) {
            return Promise.reject(initFailure);
        }

        return injectSdkScript()
            .then(() => {
                const sdkGlobal: YandexGamesGlobal | undefined = window.YaGames;
                if (!sdkGlobal || typeof sdkGlobal.init !== 'function') {
                    throw new Error('Yandex Games SDK not detected.');
                }

                const created = sdkGlobal.init();
                if (!created || typeof created.then !== 'function') {
                    throw new Error('Yandex Games SDK init() did not return a promise.');
                }

                return created;
            })
            .then((initialized) => {
                sdk = initialized;
            })
            .catch((error: unknown) => {
                initFailure = error;
                throw error;
            });
    },

    show(): Promise<RewardedAdOutcome> {
        const active = sdk;

        if (!active) {
            return Promise.reject(new Error('Yandex Games SDK not initialised.'));
        }

        return new Promise((resolve) => {
            let settled = false;
            let rewarded = false;

            const finish = (outcome: RewardedAdOutcome): void => {
                if (settled) {
                    return;
                }
                settled = true;
                resolve(outcome);
            };

            try {
                active.adv.showRewardedVideo({
                    callbacks: {
                        onOpen: () => undefined,
                        onRewarded: () => {
                            rewarded = true;
                        },
                        onClose: () => finish(rewarded ? 'granted' : 'dismissed'),
                        onError: () => finish('failed'),
                    },
                });
            } catch {
                finish('failed');
            }
        });
    },
};
