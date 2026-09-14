import { describe, expect, it } from 'vitest';
import { TRUE_SHARE, statementFor, wrongAnswerFor } from './distractors';
import { WordPair, acceptedAnswers, normalize } from './word-catalog';

function feed(...values: number[]): () => number {
  let index = 0;
  return () => values[index++ % values.length];
}

const DOG: WordPair = { en: 'dog', sv: 'hund', distractorsSv: ['katt', 'ko', 'mus'] };
const CAT: WordPair = { en: 'cat', sv: 'katt' };
const BLOCK: readonly WordPair[] = [DOG, CAT, { en: 'horse', sv: 'häst' }];

describe('wrongAnswerFor', () => {
  it('tar listans skrivna felsvar före blockets ord', () => {
    const wrong = wrongAnswerFor(DOG, BLOCK, feed(0));
    expect(wrong).toBe('katt');
  });

  it('faller tillbaka på blocket när listan inte har några felsvar', () => {
    const wrong = wrongAnswerFor(CAT, BLOCK, feed(0));
    expect(wrong).toBe('hund');
  });

  it('erbjuder aldrig ett svar som skulle räknas som rätt', () => {
    const pair: WordPair = {
      en: 'friend',
      sv: 'vän',
      also: ['kompis'],
      // En lista kan mycket väl innehålla ett «felsvar» som är en godtagen form.
      distractorsSv: ['kompis', 'lärare'],
    };
    const accepted = new Set(acceptedAnswers(pair));
    for (let i = 0; i < 20; i++) {
      const wrong = wrongAnswerFor(pair, [pair], () => i / 20);
      expect(wrong === null || !accepted.has(normalize(wrong))).toBe(true);
    }
  });

  it('ger null när det inte finns något att erbjuda', () => {
    expect(wrongAnswerFor(CAT, [CAT], feed(0))).toBeNull();
  });
});

describe('statementFor', () => {
  it('visar facit när draget faller under andelen sanna', () => {
    const statement = statementFor(DOG, BLOCK, feed(TRUE_SHARE - 0.01));
    expect(statement.truthy).toBe(true);
    expect(statement.shown).toBe('hund');
  });

  it('visar ett felsvar annars', () => {
    const statement = statementFor(DOG, BLOCK, feed(TRUE_SHARE + 0.01, 0));
    expect(statement.truthy).toBe(false);
    expect(statement.shown).toBe('katt');
  });

  it('ljuger hellre inte än hittar på: utan felsvar blir påståendet sant', () => {
    const statement = statementFor(CAT, [CAT], feed(TRUE_SHARE + 0.01, 0));
    expect(statement.truthy).toBe(true);
    expect(statement.shown).toBe('katt');
  });

  it('bär med sig glosan, så att svaret kan lagras på rätt ord', () => {
    expect(statementFor(DOG, BLOCK, feed(0.9, 0)).pair).toBe(DOG);
  });
});
