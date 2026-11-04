export const FIRE_CHARGE_THRESHOLD = 10;
export const MAX_FIRE_CHARGES = 1;

export interface FireChargeResolution {
    charges: number;
    earned: boolean;
}

export function resolveFireChargeReward(
    currentCharges: number,
    directMatchedRemoved: number,
    unsupportedRemoved: number,
    threshold = FIRE_CHARGE_THRESHOLD
): FireChargeResolution {
    const charges = Math.max(0, Math.min(MAX_FIRE_CHARGES, Math.floor(currentCharges)));
    const removed = Math.max(0, Math.floor(directMatchedRemoved)) + Math.max(0, Math.floor(unsupportedRemoved));
    const earned = charges === 0 && removed >= threshold;

    return { charges: earned ? 1 : charges, earned };
}

export function consumeFireCharge(currentCharges: number): number {
    return Math.max(0, Math.min(MAX_FIRE_CHARGES, Math.floor(currentCharges)) - 1);
}
