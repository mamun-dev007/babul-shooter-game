import { REAL_MONEY_PRODUCTS, type RealMoneyProduct } from '../store/realMoneyCatalog';

/**
 * Real-money payment seam (mirrors the rewarded-ads provider pattern).
 *
 * Platform providers are registered at boot (see config.ts). No provider is
 * ever simulated: on web every purchase resolves `unavailable` and grants
 * nothing. Rewards require a verified transaction and a fresh ledger entry.
 */

export type PaymentOutcome =
    | { status: 'granted'; transactionId: string; platform: string; receipt: string }
    | { status: 'cancelled'; reason?: string }
    | { status: 'pending'; reason?: string }
    | { status: 'failed'; reason?: string }
    | { status: 'unavailable'; reason?: string };

export interface LocalizedPrice {
    productId: string;
    displayPrice: string;
    currency: string;
}

export interface PaymentProvider {
    readonly id: string;
    readonly unavailableReason?: () => string;
    isConfigured(): boolean;
    queryProducts(productIds: string[]): Promise<Map<string, LocalizedPrice>>;
    purchase(sku: string): Promise<PaymentOutcome>;
    /** Platform-side verification used when no verification backend is set. */
    verify?(product: RealMoneyProduct, transactionId: string, receipt: string): Promise<{ verified: boolean; reason?: string }>;
    /** Finalizes (e.g. consumes) a purchase after rewards were granted. */
    finalize?(transactionId: string, receipt: string): Promise<void>;
}

export async function finalizePurchase(transactionId: string, receipt: string): Promise<void> {
    if (!isPaymentAvailable() || !provider?.finalize) {
        return;
    }

    try {
        await provider.finalize(transactionId, receipt);
    } catch {
        // Rewards stay safe in the ledger; a retry is handled by the store.
    }
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

export function missingProductReason(sku: string): string {
    return `The store could not find product "${sku}". Confirm this exact SKU is active for this app in Google Play Console, then reinstall the app from the Play testing track.`;
}

export async function requestPurchase(product: RealMoneyProduct): Promise<PaymentOutcome> {
    if (!provider) {
        return { status: 'unavailable', reason: 'Store payments are not configured yet.' };
    }
    if (!provider.isConfigured()) {
        return {
            status: 'unavailable',
            reason: provider.unavailableReason?.() ?? 'Store payments are not available here.',
        };
    }

    try {
        const prices = await provider.queryProducts([product.sku]);
        if (!prices.has(product.sku)) {
            return { status: 'failed', reason: missingProductReason(product.sku) };
        }
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
        if (isPaymentAvailable() && provider?.verify) {
            return provider.verify(product, transactionId, receipt);
        }
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
