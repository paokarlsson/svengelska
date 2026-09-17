import { describe, expect, it } from 'vitest';
import { CALIBRATION_CARDS, CALIBRATION_CHANNELS, EASY_WORDS, calibrationCards } from './calibration';
import { CHANNELS } from '../services/progress-store';
import { WordPair, pairKey } from '../words/word-catalog';

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

const KNOWN: WordPair[] = [
  { en: 'book', sv: 'bok' },
  { en: 'house', sv: 'hus' },
  { en: 'water', sv: 'vatten' },
  { en: 'friend', sv: 'vän' },
  { en: 'green', sv: 'grön' },
];

describe('calibrationCards', () => {
  /**
   * Fyra prov som råkade bli tre sanna och ett falskt mäter tre kanaler och
   * lämnar en omätt, och då är hela uppdelningen i kanaler bortkastad. Slumpen
   * får avgöra vilket ord, aldrig vilken kanal.
   */
  it('mäter varje kanal exakt en gång', () => {
    const cards = calibrationCards(KNOWN, seeded(3));
    expect(cards).toHaveLength(CALIBRATION_CARDS);
    expect(cards.map((card) => card.channel).sort()).toEqual([...CHANNELS].sort());
  });

  it('täcker båda riktningarna och båda sanningsvärdena', () => {
    const cards = calibrationCards(KNOWN, seeded(9));
    expect(new Set(cards.map((card) => card.word.direction))).toEqual(new Set(['en', 'sv']));
    expect(new Set(cards.map((card) => card.truthy))).toEqual(new Set([true, false]));
  });

  it('täcker kanalerna i samma ordning som listan säger', () => {
    expect([...CALIBRATION_CHANNELS].sort()).toEqual([...CHANNELS].sort());
  });

  it('tar spelarens egna behärskade ord när det finns nog av dem', () => {
    const cards = calibrationCards(KNOWN, seeded(5));
    const own = new Set(KNOWN.map(pairKey));
    expect(cards.every((card) => own.has(pairKey(card.word.pair)))).toBe(true);
  });

  /**
   * Mätstickan ligger i koden och inte i CSV:n: de här orden är ett instrument
   * och ingen läxa. I listan skulle de dyka upp i en vecka, räknas i «ord som
   * sitter» och kunna redigeras bort av någon som städade — och då vore golvet
   * borta utan att någon märkt det.
   */
  it('faller tillbaka på mätstickan innan spelaren har egna ord', () => {
    const cards = calibrationCards([], seeded(5));
    const sticks = new Set(EASY_WORDS.map(pairKey));
    expect(cards).toHaveLength(CALIBRATION_CARDS);
    expect(cards.every((card) => sticks.has(pairKey(card.word.pair)))).toBe(true);
  });

  it('faller tillbaka också när de egna orden är för få', () => {
    const cards = calibrationCards(KNOWN.slice(0, 2), seeded(5));
    const sticks = new Set(EASY_WORDS.map(pairKey));
    expect(cards.every((card) => sticks.has(pairKey(card.word.pair)))).toBe(true);
  });

  it('har en mätsticka med felsvar åt båda hållen', () => {
    // Ett kalibreringskort måste kunna vara falskt, och det kräver ett felsvar
    // på rätt språk.
    for (const pair of EASY_WORDS) {
      expect(pair.distractorsEn?.length).toBeGreaterThan(0);
      expect(pair.distractorsSv?.length).toBeGreaterThan(0);
    }
  });
});
