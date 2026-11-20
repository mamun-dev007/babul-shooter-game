import { configurePayments } from './payments';
import { googlePlayBillingProvider } from './googlePlayBilling';

/**
 * Registers the only active real-money provider at boot.
 *
 * The adapter is Android-only and uses native Google Play Billing. Web never
 * runs a mock purchase: `isPaymentAvailable()` is false there, so no coins
 * can be granted from a browser click. Set `VITE_PAYMENT_VERIFICATION_URL` to
 * enable backend verification; otherwise the adapter verifies the purchase
 * token directly with Google Play through the native billing client.
 */
export function configureRealPayments(): void {
    configurePayments(googlePlayBillingProvider);
}
