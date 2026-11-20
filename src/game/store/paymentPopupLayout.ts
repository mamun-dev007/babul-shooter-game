/**
 * Responsive geometry for the Coin Store payment-selection card.
 * The card keeps a fixed design proportion and never leaves the world bounds.
 */
export interface PaymentPopupLayout {
    readonly width: number;
    readonly height: number;
    readonly scale: number;
    readonly cardX: number;
    readonly cardY: number;
    readonly cardW: number;
    readonly cardH: number;
}

export function paymentPopupLayout(worldW: number, worldH: number): PaymentPopupLayout {
    const width = Number.isFinite(worldW) && worldW > 0 ? worldW : 700;
    const height = Number.isFinite(worldH) && worldH > 0 ? worldH : 960;
    const scale = Math.max(0.68, Math.min(1.15, width / 700));
    const cardW = Math.min(420 * scale, width - 28);
    const cardH = Math.min(470 * scale, height - 28);

    return {
        width,
        height,
        scale,
        cardX: width / 2,
        cardY: height / 2,
        cardW,
        cardH,
    };
}
