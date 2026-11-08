/**
 * Starter Pack offer (STARTER button popup) shared data.
 * The countdown deadline is persisted so it survives reload/restart and is
 * never reset when the popup reopens.
 */

export const STARTER_PACK_TITLE = 'STARTER PACK';
export const STARTER_PACK_COINS = 500;
export const STARTER_PACK_PRICE_BDT = 'USD $1.32';
export const STARTER_PACK_DISCOUNT = '70% OFF';

/** 71:59:18 in milliseconds. */
export const STARTER_PACK_DURATION_MS = (71 * 3600 + 59 * 60 + 18) * 1000;

const STORAGE_KEY = 'bubble-shooter-starter-offer.v1';

function readDeadline(): number | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return null;
        }
        const parsed = JSON.parse(raw) as { deadline?: unknown };
        return typeof parsed.deadline === 'number' && Number.isFinite(parsed.deadline)
            ? parsed.deadline
            : null;
    } catch {
        return null;
    }
}

function persistDeadline(deadline: number): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ deadline }));
    } catch {
        // Storage unavailable; the in-memory deadline still applies this run.
    }
}

/**
 * Returns the persisted offer deadline (ms epoch). On first use, the
 * 71:59:18 window is started and saved so later opens never reset it.
 */
export function getStarterPackDeadline(now: Date = new Date()): number {
    const existing = readDeadline();
    if (existing !== null) {
        return existing;
    }
    const deadline = now.getTime() + STARTER_PACK_DURATION_MS;
    persistDeadline(deadline);
    return deadline;
}

export function starterPackRemainingMs(now: Date = new Date()): number {
    return Math.max(0, getStarterPackDeadline(now) - now.getTime());
}

export function isStarterPackExpired(now: Date = new Date()): boolean {
    return starterPackRemainingMs(now) <= 0;
}

/** Formats a remaining duration as HH:MM:SS (hours may exceed 24). */
export function formatOfferCountdown(remainingMs: number): string {
    const totalSeconds = Math.ceil(Math.max(0, remainingMs) / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
