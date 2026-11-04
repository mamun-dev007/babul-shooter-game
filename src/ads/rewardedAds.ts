/**
 * Rewarded advertisement module.
 *
 * Providers own the actual SDK work; this module owns the outcome contract:
 * - 'granted' is produced only after the provider confirms the player earned
 *   the reward (fully watched / rewarded callback).
 * - A skipped or closed video maps to 'dismissed'.
 * - A broken SDK or internal error maps to 'failed'.
 * - With no provider configured the request resolves to 'unavailable' instead
 *   of ever simulating an ad.
 */

/** Extra bubbles granted for one fully watched rewarded video. */
export const EXTRA_BALLS_REWARD = 3;

export type RewardedAdOutcome = 'granted' | 'dismissed' | 'failed';

export interface RewardedAdProvider {
    readonly id: string;
    /** True only when the provider can actually display ads in this environment. */
    isConfigured(): boolean;
    /** Lazily loads/initializes the underlying SDK. Must never be a no-op stub. */
    load(): Promise<void>;
    /**
     * Shows one rewarded video and resolves exactly once with the outcome.
     * 'granted' requires the provider's own reward callback to have fired.
     */
    show(): Promise<RewardedAdOutcome>;
}

let provider: RewardedAdProvider | null = null;
let activeCall: Promise<RewardedAdOutcome | 'unavailable'> | null = null;

/** Selects the platform the build ships with. Call once at boot. */
export function configureRewardedAds(next: RewardedAdProvider): void {
    provider = next;
}

export function getRewardedAdProvider(): RewardedAdProvider | null {
    return provider;
}

/** True when the configured provider can run in this environment. */
export function hasConfiguredRewardedAds(): boolean {
    return provider !== null && provider.isConfigured();
}

/**
 * Shows one rewarded video and resolves with its outcome.
 *
 * Concurrent requests share the same in-flight call, so a single
 * advertisement can never be claimed twice. The method never throws; any
 * provider failure surfaces as an outcome.
 */
export function showRewardedAd(): Promise<RewardedAdOutcome | 'unavailable'> {
    const active = provider;

    if (!active || !active.isConfigured()) {
        // No SDK on this platform: surface a real "unavailable" state instead
        // of pretending a video was watched.
        return Promise.resolve('unavailable');
    }

    if (activeCall) {
        return activeCall;
    }

    const call = (async () => {
        try {
            try {
                await active.load();
            } catch {
                // Initialisation problems mean the ad simply was not shown.
                return 'unavailable' as const;
            }

            return await active.show();
        } catch {
            // Errors raised by the provider while showing (e.g. no-fill after
            // load) cannot reward the player.
            return 'failed' as const;
        } finally {
            activeCall = null;
        }
    })();

    activeCall = call;

    return call;
}

/**
 * Bubbles earned for an advertisement outcome. Returning 0 for every
 * non-granted outcome is the hard rule that keeps skipped/closed/failed ads
 * from paying out.
 */
export function extraBallsRewardFor(outcome: RewardedAdOutcome | 'unavailable'): number {
    return outcome === 'granted' ? EXTRA_BALLS_REWARD : 0;
}
