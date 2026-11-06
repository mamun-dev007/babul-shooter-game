/**
 * Real-money payment wiring.
 *
 * Intentionally registers NO provider in this build. To enable real-money
 * purchases:
 * 1. Install/register a platform adapter implementing `PaymentProvider`
 *    (Google Play Billing — e.g. a Capacitor in-app-purchase plugin — for
 *    Android, StoreKit on iOS, or a web provider for the web build) and
 *    pass it to `configurePayments()` here at boot.
 * 2. Create the SKUs from realMoneyCatalog.ts in the platform store with
 *    real localized prices (never hardcoded in the client).
 * 3. Set `VITE_PAYMENT_VERIFICATION_URL` to a secure backend endpoint that
 *    verifies receipts/transactions server-side. Without it, purchases
 *    stay `unavailable` and grant nothing (no secrets in the client).
 */

export {};
