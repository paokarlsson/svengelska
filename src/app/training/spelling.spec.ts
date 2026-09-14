import { describe, expect, it } from 'vitest';
import { MIN_NEAR_LENGTH, editDistance, judge } from './spelling';
import { WordPair } from '../words/word-catalog';

const DOG: WordPair = { en: 'dog', sv: 'hund' };
const RUN: WordPair = { en: 'to run', sv: 'springa', also: ['att springa'] };

describe('editDistance', () => {
  it('räknar ett fel som ett', () => {
    expect(editDistance('hund', 'hund')).toBe(0);
    expect(editDistance('hunf', 'hund')).toBe(1);
    expect(editDistance('hun', 'hund')).toBe(1);
    expect(editDistance('hunnd', 'hund')).toBe(1);
  });

  it('räknar ombytta grannar som ett fel, inte två', () => {
    expect(editDistance('hudn', 'hund')).toBe(1);
  });
});

describe('judge', () => {
  it('godtar facit oavsett skiftläge och kantmellanslag', () => {
    expect(judge('  Hund ', DOG)).toBe('correct');
  });

  it('godtar varje uppgiven form lika mycket', () => {
    expect(judge('springa', RUN)).toBe('correct');
    expect(judge('att springa', RUN)).toBe('correct');
  });

  it('kallar ett tecken fel för nästan', () => {
    expect(judge('hunf', DOG)).toBe('near');
    expect(judge('sprnga', RUN)).toBe('near');
  });

  it('mäter nästan mot alla former, inte bara huvudformen', () => {
    expect(judge('att sprnga', RUN)).toBe('near');
  });

  it('kallar aldrig ett annat ord för nästan', () => {
    expect(judge('katt', DOG)).toBe('wrong');
  });

  it('är strängare med korta ord, där grannarna är egna ord', () => {
    const cow: WordPair = { en: 'cow', sv: 'ko' };
    expect(cow.sv.length).toBeLessThan(MIN_NEAR_LENGTH);
    expect(judge('ku', cow)).toBe('wrong');
  });

  it('räknar diakriter som stavning, för det är vad de är', () => {
    // «hast» för «häst» är ett stavfel, alltså nästan — inte rätt.
    expect(judge('hast', { en: 'horse', sv: 'häst' })).toBe('near');
  });

  it('kallar ett tomt svar fel, aldrig nästan', () => {
    expect(judge('', DOG)).toBe('wrong');
    expect(judge('   ', DOG)).toBe('wrong');
  });
});
