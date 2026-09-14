import { describe, expect, it } from 'vitest';
import { BLOCK_SIZE, SEED_BLOCK, acceptedAnswers, normalize, wordKey } from './word-catalog';

describe('normalize', () => {
  it('gör skillnad på skräp och stavning', () => {
    expect(normalize('  Dog ')).toBe('dog');
    expect(normalize('to  run')).toBe('to run');
    // Diakriter är bokstäver, inte formatering: den som skriver hast har fel.
    expect(normalize('häst')).not.toBe(normalize('hast'));
  });
});

describe('wordKey', () => {
  it('håller två betydelser av samma ord isär', () => {
    expect(wordKey({ en: 'can', sv: 'kan' })).not.toBe(wordKey({ en: 'can', sv: 'burk' }));
  });

  it('är okänslig för skiftläge och kantmellanslag', () => {
    expect(wordKey({ en: ' Dog', sv: 'Hund ' })).toBe(wordKey({ en: 'dog', sv: 'hund' }));
  });

  it('bär sitt prefix, så andra riktningar kan läggas till utan omskrivning', () => {
    expect(wordKey({ en: 'dog', sv: 'hund' })).toBe('en:dog=hund');
  });
});

describe('SEED_BLOCK', () => {
  it('är ett block', () => {
    expect(SEED_BLOCK.words).toHaveLength(BLOCK_SIZE);
  });

  it('har unika nycklar — två rader som är samma glosa vore två sanningar', () => {
    const keys = SEED_BLOCK.words.map(wordKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('godtar facit och dess former', () => {
    const run = SEED_BLOCK.words.find((pair) => pair.en === 'to run')!;
    expect(acceptedAnswers(run)).toContain('springa');
    expect(acceptedAnswers(run)).toContain('att springa');
  });
});
