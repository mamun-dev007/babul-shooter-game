import { configureRewardedAds } from './rewardedAds';
import { yandexGamesProvider } from './providers/yandexGames';

/**
 * Active rewarded-ad provider (ad platform seam).
 *
 * The provider must be configured at boot so gameplay code only talks to
 * `showRewardedAd()`. To move the game to another platform later, add a new
 * adapter under `src/ads/providers/` implementing `RewardedAdProvider` and
 * swap the call below — the outcome contract stays identical.
 */
configureRewardedAds(yandexGamesProvider);
