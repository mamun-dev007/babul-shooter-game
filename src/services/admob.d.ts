export declare const ADMOB_APP_ID: string;
export declare const TEST_AD_UNIT_IDS: Readonly<{
    banner: string;
    interstitial: string;
    rewarded: string;
    appOpen: string;
}>;
export declare const AD_UNIT_IDS: Readonly<{
    banner: string;
    interstitial: string;
    rewarded: string;
    appOpen: string;
}>;
export declare function isAdMobAvailable(): boolean;
export declare function initializeAdMob(): Promise<boolean>;
export declare function showBannerAd(): Promise<boolean>;
export declare function hideBannerAd(): Promise<void>;
export declare function showInterstitialAd(): Promise<boolean>;
export declare function showRewardedAd(): Promise<'granted' | 'dismissed' | 'failed' | 'unavailable'>;
export declare function preloadInterstitialAd(): Promise<boolean>;
export declare function preloadRewardedAd(): Promise<boolean>;
export declare function recordLevelCompletedForInterstitial(): boolean;
export declare function disposeAdMob(): Promise<void>;
