export class BubbleBoardState {
    private initialBubbles = 0;
    private remainingBubbles = 0;

    load(initialBubbleCount: number): void {
        const count = Math.max(0, Math.floor(Number(initialBubbleCount) || 0));
        this.initialBubbles = count;
        this.remainingBubbles = count;
    }

    get initial(): number {
        return this.initialBubbles;
    }

    get remaining(): number {
        return this.remainingBubbles;
    }

    sync(currentBubbleCount: number): void {
        this.remainingBubbles = Math.max(0, Math.floor(Number(currentBubbleCount) || 0));
    }

    get progress(): number {
        if (this.initialBubbles <= 0) return 0;
        return Math.max(0, Math.min(1, (this.initialBubbles - this.remainingBubbles) / this.initialBubbles));
    }
}
