import { Capacitor } from '@capacitor/core';
import { configureRewardedAds } from './rewardedAds';
import { admobProvider } from './providers/admob';
import { yandexGamesProvider } from './providers/yandexGames';

/**
 * Active rewarded-ad provider (ad platform seam).
 *
 * The provider must be configured at boot so gameplay code only talks to
 * `showRewardedAd()`. Native Android uses AdMob; browsers keep the existing
 * Yandex Games adapter. Add a new adapter under `src/ads/providers/`
 * implementing `RewardedAdProvider` to target another platform.
 */
configureRewardedAds(
    Capacitor.isNativePlatform() ? admobProvider : yandexGamesProvider
);
