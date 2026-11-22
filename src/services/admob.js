import { Capacitor } from '@capacitor/core';
import {
    AdMob,
    BannerAdPluginEvents,
    BannerAdPosition,
    BannerAdSize,
    InterstitialAdPluginEvents,
    RewardAdPluginEvents,
} from '@capacitor-community/admob';

export const ADMOB_APP_ID = 'ca-app-pub-4238032705338232~9257594136';

export const TEST_AD_UNIT_IDS = Object.freeze({
    banner: 'ca-app-pub-3940256099942544/6300978111',
    interstitial: 'ca-app-pub-3940256099942544/1033173712',
    rewarded: 'ca-app-pub-3940256099942544/5224354917',
    appOpen: 'ca-app-pub-3940256099942544/9257395921',
});

export const AD_UNIT_IDS = TEST_AD_UNIT_IDS;

const INTERSTITIAL_LEVEL_INTERVAL = 3;
const COMPLETED_LEVELS_KEY = 'bubble-shooter-admob-completed-levels';
const AD_REQUEST_OPTIONS = Object.freeze({ isTesting: true });

let initPromise = null;
let listenerPromise = null;
let listenerHandles = [];
let initialized = false;
let initFailed = false;
let disposeBound = false;
let bannerActive = false;
let interstitialLoad = null;
let rewardedLoad = null;
let interstitialShowing = false;
let rewardedShowing = false;

export function isAdMobAvailable() {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

const warn = (message, error) => {
    if (error === undefined) {
        console.warn(`[AdMob] ${message}`);
        return;
    }
    console.warn(`[AdMob] ${message}`, error);
};

const registerListeners = async () => {
    if (listenerPromise) {
        return listenerPromise;
    }

    listenerPromise = (async () => {
        const handles = await Promise.all([
            AdMob.addListener(InterstitialAdPluginEvents.Dismissed, () => {
                interstitialLoad = null;
                void preloadInterstitialAd();
            }),
            AdMob.addListener(InterstitialAdPluginEvents.FailedToLoad, () => {
                interstitialLoad = null;
            }),
            AdMob.addListener(InterstitialAdPluginEvents.FailedToShow, () => {
                interstitialShowing = false;
                interstitialLoad = null;
            }),
            AdMob.addListener(BannerAdPluginEvents.FailedToLoad, () => {
                bannerActive = false;
            }),
            AdMob.addListener(RewardAdPluginEvents.FailedToLoad, () => {
                rewardedLoad = null;
            }),
        ]);
        listenerHandles = handles;

        if (!disposeBound && typeof window !== 'undefined') {
            window.addEventListener('pagehide', () => {
                void disposeAdMob();
            });
            disposeBound = true;
        }
    })().catch((error) => {
        listenerPromise = null;
        throw error;
    });

    return listenerPromise;
};

export function initializeAdMob() {
    if (!isAdMobAvailable()) {
        return Promise.resolve(false);
    }
    if (initialized) {
        return Promise.resolve(true);
    }
    if (initFailed) {
        return Promise.resolve(false);
    }
    if (initPromise) {
        return initPromise;
    }

    initPromise = (async () => {
        try {
            await AdMob.initialize();
            await registerListeners();
            initialized = true;
            void preloadInterstitialAd();
            void preloadRewardedAd();
            return true;
        } catch (error) {
            initFailed = true;
            warn('initialization failed', error);
            return false;
        } finally {
            initPromise = null;
        }
    })();

    return initPromise;
}

export function preloadInterstitialAd() {
    if (!initialized || !isAdMobAvailable()) {
        return Promise.resolve(false);
    }
    if (interstitialLoad) {
        return interstitialLoad;
    }

    interstitialLoad = AdMob.prepareInterstitial({
        ...AD_REQUEST_OPTIONS,
        adId: AD_UNIT_IDS.interstitial,
    })
        .then(() => true)
        .catch((error) => {
            interstitialLoad = null;
            warn('interstitial preload failed', error);
            return false;
        });

    return interstitialLoad;
}

export function preloadRewardedAd() {
    if (!initialized || !isAdMobAvailable()) {
        return Promise.resolve(false);
    }
    if (rewardedLoad) {
        return rewardedLoad;
    }

    rewardedLoad = AdMob.prepareRewardVideoAd({
        ...AD_REQUEST_OPTIONS,
        adId: AD_UNIT_IDS.rewarded,
    })
        .then(() => true)
        .catch((error) => {
            rewardedLoad = null;
            warn('rewarded preload failed', error);
            return false;
        });

    return rewardedLoad;
}

export async function showBannerAd() {
    if (!(await initializeAdMob()) || bannerActive) {
        return bannerActive;
    }

    try {
        await AdMob.showBanner({
            ...AD_REQUEST_OPTIONS,
            adId: AD_UNIT_IDS.banner,
            adSize: BannerAdSize.ADAPTIVE_BANNER,
            position: BannerAdPosition.BOTTOM_CENTER,
        });
        bannerActive = true;
        return true;
    } catch (error) {
        bannerActive = false;
        warn('banner show failed', error);
        return false;
    }
}

export async function hideBannerAd() {
    if (!isAdMobAvailable() || !bannerActive) {
        return;
    }

    try {
        await AdMob.hideBanner();
    } catch (error) {
        warn('banner hide failed', error);
    } finally {
        bannerActive = false;
    }
}

export async function showInterstitialAd() {
    if (!(await initializeAdMob()) || interstitialShowing) {
        return false;
    }

    if (!interstitialLoad) {
        await preloadInterstitialAd();
    }
    if (!interstitialLoad || !(await interstitialLoad)) {
        return false;
    }

    interstitialShowing = true;
    interstitialLoad = null;

    try {
        await AdMob.showInterstitial({ adId: AD_UNIT_IDS.interstitial });
        return true;
    } catch (error) {
        warn('interstitial show failed', error);
        void preloadInterstitialAd();
        return false;
    } finally {
        interstitialShowing = false;
    }
}

export async function showRewardedAd() {
    if (!(await initializeAdMob())) {
        return 'unavailable';
    }
    if (rewardedShowing) {
        return 'failed';
    }

    if (!rewardedLoad) {
        await preloadRewardedAd();
    }
    if (!rewardedLoad || !(await rewardedLoad)) {
        return 'failed';
    }

    rewardedShowing = true;
    rewardedLoad = null;

    try {
        await AdMob.showRewardVideoAd({ adId: AD_UNIT_IDS.rewarded });
        return 'granted';
    } catch (error) {
        if (error && error.code === 'REWARDED_AD_CANCELLED') {
            return 'dismissed';
        }
        warn('rewarded show failed', error);
        return 'failed';
    } finally {
        rewardedShowing = false;
        void preloadRewardedAd();
    }
}

export function recordLevelCompletedForInterstitial() {
    if (!isAdMobAvailable()) {
        return false;
    }

    let count = 0;
    try {
        if (typeof localStorage !== 'undefined') {
            count = Number.parseInt(localStorage.getItem(COMPLETED_LEVELS_KEY) || '0', 10) || 0;
        }
    } catch {}

    count += 1;

    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(COMPLETED_LEVELS_KEY, String(count));
        }
    } catch {}

    return count % INTERSTITIAL_LEVEL_INTERVAL === 0;
}

export async function disposeAdMob() {
    const handles = listenerHandles;
    listenerHandles = [];
    listenerPromise = null;
    initPromise = null;
    initialized = false;
    initFailed = false;
    bannerActive = false;
    interstitialLoad = null;
    rewardedLoad = null;
    interstitialShowing = false;
    rewardedShowing = false;

    await Promise.all(
        handles.map((handle) => {
            try {
                return Promise.resolve(handle && handle.remove && handle.remove());
            } catch (error) {
                warn('listener removal failed', error);
                return Promise.resolve();
            }
        })
    );
}
