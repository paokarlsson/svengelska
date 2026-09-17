import { describe, expect, it } from 'vitest';
import { ROUND_WORDS, isNew, isWordDue, pickRoundWords, roundCards } from './round';
import { DAY_MS } from './schedule';
import { StepStat, emptyStat } from './word-state';
import { DirectedWord, WordPair, pairKey, wordKey } from '../words/word-catalog';

function words(count: number): WordPair[] {
  return Array.from({ length: count }, (_, i) => ({ en: `w${i}`, sv: `o${i}` }));
}

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

const NOON = new Date(2026, 8, 17, 12, 0, 0).getTime();

/** En bild av vad appen mätt, byggd ur en tabell nyckel → statistik. */
function statsOf(table: Record<string, StepStat>) {
  return (word: DirectedWord): StepStat =>
    table[wordKey(word.pair, word.direction)] ?? emptyStat();
}

function seen(box: number, lastSeen: number): StepStat {
  return { ...emptyStat(), attempts: 3, box, lastSeen, firstSeen: lastSeen };
}

describe('isNew och isWordDue', () => {
  it('kallar ett orört ord nytt, inte moget', () => {
    const [pair] = words(1);
    const stats = statsOf({});
    expect(isNew(pair, stats)).toBe(true);
    expect(isWordDue(pair, stats, NOON)).toBe(false);
  });

  /**
   * Utan den här regeln skulle `hund → dog` aldrig introduceras för ett ord som
   * redan sitter åt andra hållet: ett osett håll saknar mognadsdag, och ordet
   * skulle se utvilat ut för alltid.
   */
  it('gör ett påbörjat ord moget när dess andra håll aldrig setts', () => {
    const [pair] = words(1);
    const stats = statsOf({ [wordKey(pair, 'en')]: seen(5, NOON) });
    expect(isNew(pair, stats)).toBe(false);
    expect(isWordDue(pair, stats, NOON)).toBe(true);
  });

  it('låter det svagaste hållet tala för hela ordet', () => {
    const [pair] = words(1);
    const stats = statsOf({
      [wordKey(pair, 'en')]: seen(6, NOON),
      [wordKey(pair, 'sv')]: seen(0, NOON - DAY_MS),
    });
    expect(isWordDue(pair, stats, NOON)).toBe(true);
  });
});

describe('pickRoundWords', () => {
  it('tar tio ord när det finns tio att ta', () => {
    const catalog = words(30);
    const picked = pickRoundWords(catalog, catalog, statsOf({}), NOON, 99);
    expect(picked).toHaveLength(ROUND_WORDS);
  });

  it('håller sig till dagens budget för nya ord', () => {
    const catalog = words(30);
    const picked = pickRoundWords(catalog, catalog, statsOf({}), NOON, 3);
    expect(picked).toHaveLength(3);
  });

  it('släpper igenom repetition även när budgeten är noll', () => {
    // Noll nya ord ska betyda «bara repetera», inte «gör ingenting».
    const catalog = words(12);
    const table: Record<string, StepStat> = {};
    for (const pair of catalog.slice(0, 6)) {
      table[wordKey(pair, 'en')] = seen(0, NOON - DAY_MS);
      table[wordKey(pair, 'sv')] = seen(0, NOON - DAY_MS);
    }
    const picked = pickRoundWords(catalog, catalog, statsOf(table), NOON, 0);
    expect(picked).toHaveLength(6);
  });

  it('tar det mest försenade först', () => {
    const catalog = words(3);
    const table: Record<string, StepStat> = {};
    catalog.forEach((pair, index) => {
      const stat = seen(0, NOON - (index + 1) * 10 * DAY_MS);
      table[wordKey(pair, 'en')] = stat;
      table[wordKey(pair, 'sv')] = stat;
    });
    const picked = pickRoundWords(catalog, [], statsOf(table), NOON, 0);
    expect(picked[0]).toBe(catalog[2]);
  });

  /**
   * Veckan är källan till *nya* ord, inte en avgränsning av övningen: ett ord
   * som fastnat i vecka 3 ska kunna komma tillbaka samma dag som vecka 5 är ny.
   */
  it('repeterar ur hela katalogen men hämtar nya ord bara ur veckan', () => {
    const catalog = words(6);
    const week = catalog.slice(4);
    const table: Record<string, StepStat> = {};
    for (const pair of catalog.slice(0, 2)) {
      table[wordKey(pair, 'en')] = seen(0, NOON - DAY_MS);
      table[wordKey(pair, 'sv')] = seen(0, NOON - DAY_MS);
    }
    const picked = pickRoundWords(catalog, week, statsOf(table), NOON, 5).map(pairKey);
    expect(picked).toContain(pairKey(catalog[0]));
    expect(picked).toContain(pairKey(catalog[4]));
    // Ord 2 och 3 är varken mogna eller veckans, så de kommer bara som utfyllnad.
    expect(picked).not.toContain(pairKey(catalog[2]));
  });

  it('blir hellre kort än fyller ut med brus', () => {
    const catalog = words(4);
    expect(pickRoundWords(catalog, catalog, statsOf({}), NOON, 2)).toHaveLength(2);
  });

  it('tar aldrig samma ord två gånger', () => {
    const catalog = words(20);
    const picked = pickRoundWords(catalog, catalog, statsOf({}), NOON, 99);
    expect(new Set(picked.map(pairKey)).size).toBe(picked.length);
  });
});

describe('roundCards', () => {
  it('ger varje ord åt båda hållen', () => {
    const picked = words(ROUND_WORDS);
    const cards = roundCards(picked, seeded(7));
    expect(cards).toHaveLength(ROUND_WORDS * 2);
    for (const pair of picked) {
      const hers = cards.filter((card) => pairKey(card.pair) === pairKey(pair));
      expect(hers.map((card) => card.direction).sort()).toEqual(['en', 'sv']);
    }
  });

  /**
   * Ligger `dog = hund` direkt före `hund = dog` mäts korttidsminnet och inte
   * glosan. Spärren är garanterad och inte bara sannolik, eftersom en spärr som
   * håller nästan alltid är en spärr det inte går att skriva ett test på.
   */
  it('lägger aldrig samma ords två håll intill varandra', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const cards = roundCards(words(ROUND_WORDS), seeded(seed));
      for (let i = 1; i < cards.length; i++) {
        expect(pairKey(cards[i].pair)).not.toBe(pairKey(cards[i - 1].pair));
      }
    }
  });

  it('håller spärren även för ett kort varv', () => {
    for (let size = 2; size <= 5; size++) {
      for (let seed = 1; seed <= 20; seed++) {
        const cards = roundCards(words(size), seeded(seed));
        for (let i = 1; i < cards.length; i++) {
          expect(pairKey(cards[i].pair)).not.toBe(pairKey(cards[i - 1].pair));
        }
      }
    }
  });

  it('låter inte ett håll alltid komma först', () => {
    const first = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      first.add(roundCards(words(4), seeded(seed))[0].direction);
    }
    expect(first.size).toBe(2);
  });

  it('ger ingenting för ett tomt varv', () => {
    expect(roundCards([], seeded(1))).toEqual([]);
  });
});
