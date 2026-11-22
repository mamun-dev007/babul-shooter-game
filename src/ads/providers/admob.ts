import type { RewardedAdOutcome, RewardedAdProvider } from '../rewardedAds';
import { initializeAdMob, isAdMobAvailable, showRewardedAd } from '../../services/admob';

export const admobProvider: RewardedAdProvider = {
    id: 'admob',

    isConfigured(): boolean {
        return isAdMobAvailable();
    },

    async load(): Promise<void> {
        const ready = await initializeAdMob();
        if (!ready) {
            throw new Error('AdMob could not be initialized.');
        }
    },

    async show(): Promise<RewardedAdOutcome> {
        const outcome = await showRewardedAd();
        return outcome === 'unavailable' ? 'failed' : outcome;
    },
};
