import { REAL_MONEY_PRODUCTS, type RealMoneyProduct } from '../store/realMoneyCatalog';

/**
 * Real-money payment seam (mirrors the rewarded-ads provider pattern).
 *
 * No payment provider is configured in this build: Google Play Billing /
 * Apple StoreKit / a web provider plus a secure verification backend must
 * be registered (see config.ts) before any real-money purchase can run.
 * Until then every purchase attempt resolves `unavailable` and grants
 * nothing — purchases are never simulated and rewards are never granted
 * on a bare BUY click.
 */

export type PaymentOutcome =
    | { status: 'granted'; transactionId: string; platform: string; receipt: string }
    | { status: 'cancelled'; reason?: string }
    | { status: 'failed'; reason?: string }
    | { status: 'unavailable'; reason?: string };

export interface LocalizedPrice {
    productId: string;
    displayPrice: string;
    currency: string;
}

export interface PaymentProvider {
    readonly id: string;
    isConfigured(): boolean;
    queryProducts(productIds: string[]): Promise<Map<string, LocalizedPrice>>;
    purchase(sku: string): Promise<PaymentOutcome>;
}

let provider: PaymentProvider | null = null;

export function configurePayments(next: PaymentProvider): void {
    provider = next;
}

export function getPaymentProvider(): PaymentProvider | null {
    return provider;
}

export function isPaymentAvailable(): boolean {
    return provider !== null && provider.isConfigured();
}

export function getRealMoneyProduct(productIdOrSku: string): RealMoneyProduct | undefined {
    return REAL_MONEY_PRODUCTS.find((p) => p.id === productIdOrSku || p.sku === productIdOrSku);
}

export async function queryLocalizedPrices(): Promise<Map<string, LocalizedPrice>> {
    if (!isPaymentAvailable() || !provider) {
        return new Map();
    }

    try {
        return await provider.queryProducts(REAL_MONEY_PRODUCTS.map((p) => p.sku));
    } catch {
        return new Map();
    }
}

export async function requestPurchase(product: RealMoneyProduct): Promise<PaymentOutcome> {
    if (!isPaymentAvailable() || !provider) {
        return { status: 'unavailable', reason: 'Store payments are not configured yet.' };
    }

    try {
        return await provider.purchase(product.sku);
    } catch {
        return { status: 'failed', reason: 'Payment could not be completed.' };
    }
}

/** Secure backend verification endpoint (no secrets — URL only). */
function verificationEndpoint(): string {
    try {
        const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
        return env?.VITE_PAYMENT_VERIFICATION_URL?.trim() ?? '';
    } catch {
        return '';
    }
}

export async function verifyTransaction(
    product: RealMoneyProduct,
    transactionId: string,
    platform: string,
    receipt: string
): Promise<{ verified: boolean; reason?: string }> {
    const endpoint = verificationEndpoint();
    if (!endpoint) {
        return { verified: false, reason: 'Backend verification is not configured.' };
    }

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productId: product.id, sku: product.sku, transactionId, platform, receipt }),
        });
        if (!response.ok) {
            return { verified: false, reason: 'Verification failed.' };
        }

        const body = (await response.json()) as { approved?: boolean };
        return body.approved === true ? { verified: true } : { verified: false, reason: 'Verification failed.' };
    } catch {
        return { verified: false, reason: 'Verification failed.' };
    }
}

/* Transaction ledger: a transaction ID can pay out exactly once. */
const LEDGER_KEY = 'bubble-shooter-payments.v1';

const readLedger = (): Record<string, { productId: string; at: number }> => {
    try {
        const raw = localStorage.getItem(LEDGER_KEY);
        if (!raw) {
            return {};
        }

        const parsed = JSON.parse(raw) as unknown;
        return parsed && typeof parsed === 'object' ? (parsed as Record<string, { productId: string; at: number }>) : {};
    } catch {
        return {};
    }
};

export function hasProcessedTransaction(transactionId: string): boolean {
    return transactionId in readLedger();
}

export function markTransactionProcessed(transactionId: string, productId: string): void {
    try {
        const ledger = readLedger();
        ledger[transactionId] = { productId, at: Date.now() };
        localStorage.setItem(LEDGER_KEY, JSON.stringify(ledger));
    } catch {
        // Storage may be unavailable; the in-flight purchase still grants
        // once, and a later replay will simply re-verify with the backend.
    }
}
