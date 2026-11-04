import { describe, expect, it } from 'vitest';
import { BubbleBoardState } from './BubbleBoardState';

describe('BubbleBoardState', () => {
  it('counts removals from the authoritative board and supports a 60-bubble board', () => {
    const board = new BubbleBoardState();
    board.load(60);
    board.sync(53);
    expect(board.remaining).toBe(53);
    expect(board.progress).toBeCloseTo(7 / 60);
  });

  it('does not complete at 30 remaining or 9 removed from a 10-bubble board', () => {
    const first = new BubbleBoardState();
    first.load(60);
    first.sync(30);
    expect(first.remaining).toBe(30);
    expect(first.remaining).not.toBe(0);

    const second = new BubbleBoardState();
    second.load(10);
    second.sync(1);
    expect(second.remaining).toBe(1);
    expect(second.remaining).not.toBe(0);
  });

  it('completes when all bubbles are removed exactly once', () => {
    const board = new BubbleBoardState();
    board.load(3);
    board.sync(0);
    expect(board.remaining).toBe(0);
    board.sync(0);
    expect(board.remaining).toBe(0);
  });

  it('counts matched and unsupported removals without double counting', () => {
    const board = new BubbleBoardState();
    board.load(60);
    board.sync(53);
    board.sync(53);
    expect(board.remaining).toBe(53);
  });

  it('restores the original board counters after reload', () => {
    const board = new BubbleBoardState();
    board.load(60);
    board.sync(7);
    board.load(60);
    expect(board.initial).toBe(60);
    expect(board.remaining).toBe(60);
    expect(board.progress).toBe(0);
  });
});
