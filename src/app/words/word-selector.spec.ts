import { describe, expect, it } from 'vitest';
import { GROUP_SHARES, RECENT_MEMORY, companionsFor, exposures, selectNext } from './word-selector';
import { WordPair, wordKey } from './word-catalog';
import { StepStat, Step, WordRecord, emptyRecord, emptyStat, recordAttempt } from '../training/word-state';

/**
 * En slumpkälla som är samma varje gång men inte ser ut som en följd.
 * Fördelningar går inte att pröva mot `Math.random` utan att testet blir
 * nyckfullt.
 */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

function statFrom(outcomes: readonly boolean[], pace = 1): StepStat {
  return outcomes.reduce<StepStat>(
    (stat, correct, index) =>
      recordAttempt(stat, { outcome: correct ? 'hit' : 'miss', pace, at: index }),
    emptyStat(),
  );
}

const MASTERED = [true, true, true, true, true];
const DONE_EVERYWHERE = () =>
  recordWith({
    match: statFrom(MASTERED),
    trueFalse: statFrom(MASTERED),
    recall: statFrom(MASTERED),
    written: statFrom(MASTERED),
  });
const LEARNING = [true, false, true, true, false];
const WEAK = [false, false, false, false, false];

function recordWith(parts: Partial<Record<Step, StepStat>>): WordRecord {
  return { ...emptyRecord(), ...parts };
}

function library(entries: Record<string, WordRecord>): (pair: WordPair) => WordRecord {
  return (pair) => entries[pair.en] ?? emptyRecord();
}

const A: WordPair = { en: 'a', sv: 'ett' };
const B: WordPair = { en: 'b', sv: 'två' };
const C: WordPair = { en: 'c', sv: 'tre' };
const D: WordPair = { en: 'd', sv: 'fyra' };

describe('exposures', () => {
  it('ger varje ord sitt steg', () => {
    const found = exposures([A, B], library({ a: recordWith({ match: statFrom(MASTERED) }) }));
    expect(found.map((exposure) => exposure.step)).toEqual(['trueFalse', 'match']);
  });

  it('håller kvar ett färdigt ord i sitt sista steg i stället för att släppa det', () => {
    const found = exposures([A], library({ a: DONE_EVERYWHERE() }));
    expect(found).toEqual([{ pair: A, step: 'written' }]);
  });

  it('lägger varje exponering minst på golvet', () => {
    const found = exposures([A, B], library({ a: recordWith({ match: statFrom(MASTERED) }) }), 'recall');
    expect(found.map((exposure) => exposure.step)).toEqual(['recall', 'recall']);
  });

  it('låter golvet lyfta men aldrig sänka', () => {
    const past = recordWith({ match: statFrom(MASTERED), trueFalse: statFrom(MASTERED) });
    const found = exposures([A], library({ a: past }), 'match');
    expect(found[0].step).toBe('recall');
  });
});

describe('selectNext', () => {
  it('ger null bara för ett tomt block', () => {
    expect(selectNext([], library({}))).toBeNull();
  });

  it('underhåller ett färdigt ord i stället för att glömma det', () => {
    const drawn = selectNext([A], library({ a: DONE_EVERYWHERE() }), [], seeded(1));
    expect(drawn).toEqual({ pair: A, step: 'written' });
  });

  it('drar inte om det som nyss visats', () => {
    const recent = [wordKey(A), wordKey(B)];
    for (let i = 0; i < 50; i++) {
      const drawn = selectNext([A, B, C, D], library({}), recent, seeded(i + 1));
      expect(recent).not.toContain(wordKey(drawn!.pair));
    }
  });

  it('lyfter spärren hellre än att lämna passet utan ord', () => {
    const recent = [wordKey(A), wordKey(B)];
    const drawn = selectNext([A, B], library({}), recent, seeded(7));
    expect(drawn).not.toBeNull();
  });

  it('minns bara så långt tillbaka som spärren räcker', () => {
    // Ett ord som ligger längre bak än fönstret får komma tillbaka.
    const recent = [wordKey(A), ...Array.from({ length: RECENT_MEMORY }, () => wordKey(B))];
    const drawn = selectNext([A, B], library({}), recent, seeded(3));
    expect(drawn!.pair).toBe(A);
  });

  it('håller andelen färdiga ord nära den utlovade', () => {
    const entries = {
      a: DONE_EVERYWHERE(),
      b: DONE_EVERYWHERE(),
      c: recordWith({ match: statFrom(WEAK) }),
      d: recordWith({ match: statFrom(LEARNING) }),
    };
    const random = seeded(99);
    const draws = 3000;
    let maintenance = 0;
    for (let i = 0; i < draws; i++) {
      const drawn = selectNext([A, B, C, D], library(entries), [], random)!;
      if (drawn.pair === A || drawn.pair === B) {
        maintenance++;
      }
    }
    // Att fördelningen *går* att mäta är vad testet låser — det är hela skälet
    // att gruppen dras före ordet. Siffran själv är en gissning, och spannet
    // här är brett med flit.
    expect(maintenance / draws).toBeGreaterThan(GROUP_SHARES.mastered / 2);
    expect(maintenance / draws).toBeLessThan(GROUP_SHARES.mastered * 2);
  });

  it('fördelar sig över grupperna även när match hoppats över', () => {
    // Samma spann-test som ovan, men för ord som aldrig sett match. Utan
    // `settled()` faller alla i `weak` och GROUP_SHARES slutar betyda något.
    const skipped = () => recordWith({ written: statFrom(MASTERED) });
    const entries = {
      a: skipped(),
      b: skipped(),
      c: recordWith({ recall: statFrom(WEAK) }),
      d: recordWith({ recall: statFrom(LEARNING) }),
    };
    const random = seeded(99);
    const draws = 3000;
    let maintenance = 0;
    for (let i = 0; i < draws; i++) {
      const drawn = selectNext([A, B, C, D], library(entries), [], random, 'recall')!;
      if (drawn.pair === A || drawn.pair === B) {
        maintenance++;
      }
    }
    expect(maintenance / draws).toBeGreaterThan(GROUP_SHARES.mastered / 2);
    expect(maintenance / draws).toBeLessThan(GROUP_SHARES.mastered * 2);
  });

  it('lägger vikten på det svaga inom gruppen', () => {
    const entries = {
      a: recordWith({ match: statFrom(WEAK, 3) }),
      b: recordWith({ match: statFrom([true, true, false, true, true]) }),
    };
    const random = seeded(5);
    let weak = 0;
    for (let i = 0; i < 1000; i++) {
      if (selectNext([A, B], library(entries), [], random)!.pair === A) {
        weak++;
      }
    }
    expect(weak).toBeGreaterThan(500);
  });
});

describe('companionsFor', () => {
  it('fyller rundan även när för få ord står kvar i match', () => {
    const past = recordWith({ match: statFrom(MASTERED) });
    const round = companionsFor(A, [A, B, C, D], library({ b: past, c: past, d: past }), 4, seeded(2));
    expect(round).toHaveLength(4);
    expect(round[0]).toBe(A);
    expect(new Set(round.map((pair) => wordKey(pair))).size).toBe(4);
  });

  it('tar inte fler än blocket har', () => {
    expect(companionsFor(A, [A, B], library({}), 5, seeded(1))).toHaveLength(2);
  });

  it('fyller rundan även när inget ord alls står i match', () => {
    // Med en ingång över match är `sameStep` tom; fallbacken på hela blocket är
    // precis vad den finns för.
    const skipped = recordWith({ written: statFrom(MASTERED) });
    const round = companionsFor(
      A,
      [A, B, C, D],
      library({ a: skipped, b: skipped, c: skipped, d: skipped }),
      4,
      seeded(2),
    );
    expect(round).toHaveLength(4);
    expect(new Set(round.map((pair) => wordKey(pair))).size).toBe(4);
  });
});
