import { describe, expect, it } from 'vitest';
import { derange, pick, shuffle, weightedPick } from './shuffle';

/** En slumpkälla som inte slumpar: matar ut talen i tur och ordning. */
function feed(...values: number[]): () => number {
  let index = 0;
  return () => values[index++ % values.length];
}

describe('pick', () => {
  it('tar det den ombeds ta', () => {
    expect(pick(['a', 'b', 'c'], feed(0))).toBe('a');
    expect(pick(['a', 'b', 'c'], feed(0.99))).toBe('c');
  });

  it('ger null för ingenting', () => {
    expect(pick([], feed(0.5))).toBeNull();
  });

  it('går inte utanför listan ens för en källa som ger ett', () => {
    expect(pick(['a', 'b'], feed(1))).toBe('b');
  });
});

describe('shuffle', () => {
  it('behåller innehållet', () => {
    const items = [1, 2, 3, 4, 5];
    expect([...shuffle(items)].sort()).toEqual(items);
  });

  it('rör inte det den fick', () => {
    const items = [1, 2, 3];
    shuffle(items, feed(0.9, 0.1, 0.5));
    expect(items).toEqual([1, 2, 3]);
  });
});

describe('derange', () => {
  it('lämnar inget kvar på sin plats', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    for (let i = 0; i < 200; i++) {
      const mixed = derange(items);
      expect(mixed.every((item, index) => item !== items[index])).toBe(true);
    }
  });

  it('ger upp mot en rotation i stället för att snurra', () => {
    // En källa som alltid ger noll blandar aldrig om något.
    expect(derange(['a', 'b', 'c'], feed(0))).toEqual(['b', 'c', 'a']);
  });

  it('klarar det som inte går att derangera', () => {
    expect(derange(['a'])).toEqual(['a']);
    expect(derange([])).toEqual([]);
  });
});

describe('weightedPick', () => {
  it('hoppar över det som väger noll', () => {
    const items = ['tung', 'noll'];
    const weights: Record<string, number> = { tung: 1, noll: 0 };
    for (let i = 0; i < 50; i++) {
      expect(weightedPick(items, (item) => weights[item])).toBe('tung');
    }
  });

  it('väljer i viktordning', () => {
    const items = ['a', 'b'];
    const weight = (item: string) => (item === 'a' ? 3 : 1);
    expect(weightedPick(items, weight, feed(0.1))).toBe('a');
    expect(weightedPick(items, weight, feed(0.9))).toBe('b');
  });

  it('drar jämnt när ingenting väger något', () => {
    expect(weightedPick(['a', 'b'], () => 0, feed(0.9))).toBe('b');
  });

  it('ger null för ingenting', () => {
    expect(weightedPick([], () => 1)).toBeNull();
  });
});
