import { Capacitor } from '@capacitor/core';
import { NativePurchases, PURCHASE_TYPE } from '@capgo/native-purchases';
import type { LocalizedPrice, PaymentOutcome, PaymentProvider } from './payments';
import type { RealMoneyProduct } from '../store/realMoneyCatalog';

export const GOOGLE_PLAY_PLATFORM = 'google-play';
export const GOOGLE_PLAY_PROVIDER_ID = 'google-play-billing';

const ANDROID_ONLY_REASON = 'Google Play payments are only available in the Android app.';

const isAndroidNative = (): boolean =>
    Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

const messageOf = (error: unknown): string => {
    if (error instanceof Error) {
        return error.message;
    }
    return typeof error === 'string' ? error : '';
};

const isPurchased = (state: string | undefined): boolean => String(state ?? '1') === '1';

const missingProductReason = (sku: string): string =>
    `The store could not find product "${sku}". Confirm this exact SKU is active for this app in Google Play Console, then reinstall the app from the Play testing track.`;

/**
 * Real Google Play Billing provider (Capacitor 7 / BillingClient 7.x).
 * Web and iOS never reach this adapter: no mock purchase is ever attempted.
 */
export const googlePlayBillingProvider: PaymentProvider = {
    id: GOOGLE_PLAY_PROVIDER_ID,
    unavailableReason: () => ANDROID_ONLY_REASON,

    isConfigured: isAndroidNative,

    async queryProducts(productIds: string[]): Promise<Map<string, LocalizedPrice>> {
        const prices = new Map<string, LocalizedPrice>();
        if (!isAndroidNative()) {
            return prices;
        }

        try {
            const { products } = await NativePurchases.getProducts({
                productIdentifiers: productIds,
                productType: PURCHASE_TYPE.INAPP,
            });
            products.forEach((product) => {
                prices.set(product.identifier, {
                    productId: product.identifier,
                    displayPrice: product.priceString,
                    currency: product.currencyCode,
                });
            });
        } catch {
            // Store prices are optional; the catalog USD price is the fallback.
        }

        return prices;
    },

    async purchase(sku: string): Promise<PaymentOutcome> {
        if (!isAndroidNative()) {
            return { status: 'unavailable', reason: ANDROID_ONLY_REASON };
        }

        try {
            const transaction = await NativePurchases.purchaseProduct({
                productIdentifier: sku,
                productType: PURCHASE_TYPE.INAPP,
                // Verified and consumed only after the reward is granted.
                isConsumable: false,
                autoAcknowledgePurchases: false,
            });

            if (!isPurchased(transaction.purchaseState)) {
                return { status: 'pending', reason: 'Payment is still pending. No rewards were granted.' };
            }
            if (!transaction.transactionId || !transaction.purchaseToken) {
                return { status: 'failed', reason: 'Google Play did not confirm the purchase. No rewards were granted.' };
            }

            return {
                status: 'granted',
                transactionId: transaction.transactionId,
                platform: GOOGLE_PLAY_PLATFORM,
                receipt: transaction.purchaseToken,
            };
        } catch (error) {
            const message = messageOf(error);
            if (/cancel|abort/i.test(message)) {
                return { status: 'cancelled', reason: 'Purchase cancelled. No charge was made.' };
            }
            if (/pending/i.test(message)) {
                return { status: 'pending', reason: 'Payment is still pending. No rewards were granted.' };
            }
            if (/product not found/i.test(message)) {
                return { status: 'failed', reason: missingProductReason(sku) };
            }
            return { status: 'failed', reason: message || 'Google Play purchase failed. No charge was made.' };
        }
    },

    async verify(product: RealMoneyProduct, transactionId: string, receipt: string) {
        if (!isAndroidNative()) {
            return { verified: false, reason: 'Google Play verification is only available on Android.' };
        }
        if (!transactionId || !receipt) {
            return { verified: false, reason: 'The purchase token is missing.' };
        }

        try {
            const { purchases } = await NativePurchases.getPurchases({ productType: PURCHASE_TYPE.INAPP });
            const confirmed = purchases.some((purchase) =>
                purchase.productIdentifier === product.sku &&
                (purchase.purchaseToken === receipt || purchase.transactionId === transactionId) &&
                isPurchased(purchase.purchaseState)
            );
            return confirmed
                ? { verified: true }
                : { verified: false, reason: 'Google Play could not confirm this purchase.' };
        } catch {
            return { verified: false, reason: 'Google Play verification failed.' };
        }
    },

    async finalize(_transactionId: string, receipt: string): Promise<void> {
        if (!isAndroidNative() || !receipt) {
            return;
        }
        // Consuming a verified one-time purchase lets the player buy it again.
        await NativePurchases.consumePurchase({ purchaseToken: receipt });
    },
};
