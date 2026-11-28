import { describe, expect, it } from 'vitest';
import { DEFAULT_BASELINE } from '../services/progress-store';
import { Outcome, StepStat } from '../training/word-state';
import { PracticeWord, describePractice, difficulty } from './practice-summary';

function stat(recent: Outcome[], paces: number[] = []): StepStat {
  return {
    attempts: recent.length,
    correct: recent.filter((outcome) => outcome === 'hit' || outcome === 'slow').length,
    streak: 0,
    paces,
    recent,
    lastSeen: 1,
    firstSeen: 1,
    box: 0,
  };
}

const word = (en: string, sv: string, recent: Outcome[], paces: number[] = [], direction: 'en' | 'sv' = 'en'): PracticeWord => ({
  pair: { en, sv },
  direction,
  stat: stat(recent, paces),
});

describe('describePractice', () => {
  it('säger ingenting innan något övats', () => {
    expect(describePractice([word('dog', 'hund', [])], DEFAULT_BASELINE)).toBeNull();
  });

  it('nämner de svåra orden, svårast först, med utfall och tid', () => {
    const text = describePractice(
      [
        word('star', 'stjärna', ['hit', 'slow'], [1.9]),
        word('reluctant', 'motvillig', ['miss', 'unsure', 'miss'], [2.4]),
        word('moon', 'måne', ['hit', 'hit'], [0.8]),
      ],
      DEFAULT_BASELINE,
    )!;
    const hard = text.split('Svårast just nu')[1].split('Sitter')[0];
    expect(hard.indexOf('reluctant')).toBeLessThan(hard.indexOf('star'));
    expect(hard).toContain('reluctant → motvillig: 0 rätt av 3; senast: fel, vet ej, fel; tid ×2,4');
    expect(hard).not.toContain('moon');
  });

  it('nämner orden som sitter, och åt vilket håll', () => {
    const text = describePractice([word('moon', 'måne', ['hit', 'hit'], [0.8], 'sv')], DEFAULT_BASELINE)!;
    expect(text).toContain('Sitter');
    expect(text).toContain('måne → moon');
  });

  it('säger hur långt golvet är i sekunder', () => {
    const text = describePractice([word('moon', 'måne', ['hit'])], DEFAULT_BASELINE)!;
    expect(text).toMatch(/Golvet .* ungefär \d+,\d s från engelska/);
  });
});

describe('difficulty', () => {
  it('väger fel tyngre än vet ej, och vet ej tyngre än segt', () => {
    expect(difficulty(stat(['miss']))).toBeGreaterThan(difficulty(stat(['unsure'])));
    expect(difficulty(stat(['unsure']))).toBeGreaterThan(difficulty(stat(['slow'])));
    expect(difficulty(stat(['hit', 'hit'], [0.9]))).toBe(0);
  });

  it('räknar ett rätt som tog lång tid som svårt', () => {
    expect(difficulty(stat(['hit'], [2.5]))).toBeGreaterThan(0);
  });
});
