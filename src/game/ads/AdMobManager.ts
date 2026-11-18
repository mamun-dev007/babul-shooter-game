import { AdMob, BannerAdPosition, BannerAdSize } from '@capacitor-community/admob';

const TEST_REWARDED = 'ca-app-pub-3940256099942544/5224354917';
const TEST_INTERSTITIAL = 'ca-app-pub-3940256099942544/1033173712';
const TEST_BANNER = 'ca-app-pub-3940256099942544/6300978111';

export class AdMobManager {
    private static initialized = false;
    static async init(): Promise<void> {
        if (this.initialized) return;
        await AdMob.initialize({ initializeForTesting: true });
        this.initialized = true;
    }
    static async showRewarded(onReward: (amount: number) => void): Promise<void> {
        try {
            await AdMob.prepareRewardVideoAd({ adId: TEST_REWARDED });
            const handle = await AdMob.showRewardVideoAd();
            if (handle?.amount) {
                onReward(handle.amount);
            }
        } catch (e) {
            console.warn('Rewarded ad failed', e);
        }
    }
    static async showInterstitial(): Promise<void> {
        try {
            await AdMob.prepareInterstitial({ adId: TEST_INTERSTITIAL });
            await AdMob.showInterstitial();
        } catch (e) {
            console.warn('Interstitial failed', e);
        }
    }
    static async showBanner(): Promise<void> {
        try {
            await AdMob.showBanner({ adId: TEST_BANNER, adSize: BannerAdSize.ADAPTIVE_BANNER, position: BannerAdPosition.BOTTOM_CENTER });
        } catch (e) {
            console.warn('Banner failed', e);
        }
    }
    static async hideBanner(): Promise<void> {
        try { await AdMob.hideBanner(); } catch {}
    }
}
