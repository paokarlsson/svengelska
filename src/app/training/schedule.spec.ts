import { describe, expect, it } from 'vitest';
import { DAY_MS, INTERVALS, dueAt, intervalFor, isDue, overdueBy, sameDay, startOfDay } from './schedule';
import { StepStat, emptyStat, nextBox } from './word-state';

function seen(box: number, lastSeen: number): StepStat {
  return { ...emptyStat(), attempts: 1, box, lastSeen, firstSeen: lastSeen };
}

const NOON = new Date(2026, 8, 17, 12, 0, 0).getTime();

describe('intervalFor', () => {
  it('börjar på samma varv och slutar på den längsta vilan', () => {
    expect(intervalFor(0)).toBe(0);
    expect(intervalFor(INTERVALS.length - 1)).toBe(INTERVALS.at(-1));
  });

  it('klampar en låda utanför trappan i stället för att spricka', () => {
    expect(intervalFor(-5)).toBe(INTERVALS[0]);
    expect(intervalFor(999)).toBe(INTERVALS.at(-1));
  });

  it('växer aldrig bakåt', () => {
    for (let box = 1; box < INTERVALS.length; box++) {
      expect(intervalFor(box)).toBeGreaterThanOrEqual(intervalFor(box - 1));
    }
  });
});

describe('dueAt', () => {
  it('saknas för ett osett ord — det är nytt, inte försenat', () => {
    expect(dueAt(emptyStat())).toBeNull();
    expect(isDue(emptyStat(), NOON)).toBe(false);
  });

  /**
   * Dygnsgränser och inte timmar. Ett ord som svarades rätt strax före läggdags
   * ska komma tillbaka nästa dag, inte nästa kväll — och den som övar två
   * gånger samma dag ska inte få samma ord igen bara för att det gått
   * tjugofyra timmar och en minut.
   */
  it('räknar i dygn och inte i timmar', () => {
    const evening = new Date(2026, 8, 17, 22, 0, 0).getTime();
    const nextMorning = new Date(2026, 8, 18, 7, 0, 0).getTime();
    expect(isDue(seen(1, evening), nextMorning)).toBe(true);
  });

  it('håller ett ord borta resten av dagen det setts', () => {
    const morning = new Date(2026, 8, 17, 7, 0, 0).getTime();
    const evening = new Date(2026, 8, 17, 22, 0, 0).getTime();
    expect(isDue(seen(1, morning), evening)).toBe(false);
  });

  it('låter låda noll komma tillbaka i samma varv', () => {
    expect(isDue(seen(0, NOON), NOON)).toBe(true);
  });

  it('ger en högre låda en längre vila', () => {
    const low = dueAt(seen(1, NOON))!;
    const high = dueAt(seen(4, NOON))!;
    expect(high).toBeGreaterThan(low);
  });
});

describe('overdueBy', () => {
  it('sorterar det som väntat längst först', () => {
    const old = seen(1, NOON - 10 * DAY_MS);
    const fresh = seen(1, NOON - 2 * DAY_MS);
    expect(overdueBy(old, NOON)).toBeGreaterThan(overdueBy(fresh, NOON));
  });

  it('lägger ett osett ord sist, eftersom det inte väntat alls', () => {
    expect(overdueBy(emptyStat(), NOON)).toBe(Number.NEGATIVE_INFINITY);
  });
});

describe('planen och lådorna tillsammans', () => {
  it('ger ett fel kortare väg tillbaka än ett «vet ej» kostar i vila', () => {
    // Priset på ärlighet, läst i dygn i stället för i lådor: ett «vet ej» får
    // aldrig kosta mer vila än ett fel gör.
    const box = 4;
    const afterMiss = intervalFor(nextBox(box, 'miss'));
    const afterUnsure = intervalFor(nextBox(box, 'unsure'));
    expect(afterUnsure).toBeGreaterThanOrEqual(afterMiss);
  });
});

describe('startOfDay', () => {
  it('lägger sig på dygnets början i lokal tid', () => {
    expect(new Date(startOfDay(NOON)).getHours()).toBe(0);
  });

  it('ser två tider samma dygn som samma dag', () => {
    const early = new Date(2026, 8, 17, 0, 30, 0).getTime();
    const late = new Date(2026, 8, 17, 23, 30, 0).getTime();
    expect(sameDay(early, late)).toBe(true);
    expect(sameDay(late, late + DAY_MS)).toBe(false);
  });
});
