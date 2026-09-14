import { describe, expect, it } from 'vitest';
import {
  WORD_BLOCKS,
  acceptedAnswers,
  blockById,
  normalize,
  parseBlocks,
  wordKey,
} from './word-catalog';

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

  it('bär inte blocket — samma glosa i två listor är ett framsteg, inte två', () => {
    const water = { en: 'water', sv: 'vatten' };
    expect(wordKey({ ...water })).toBe(wordKey(water));
  });
});

describe('WORD_BLOCKS', () => {
  it('innehåller de levererade listorna', () => {
    expect(WORD_BLOCKS.length).toBeGreaterThan(0);
    expect(WORD_BLOCKS.every((block) => block.words.length > 0)).toBe(true);
  });

  it('har unika nycklar inom varje block — två rader som är samma glosa vore två sanningar', () => {
    for (const block of WORD_BLOCKS) {
      const keys = block.words.map(wordKey);
      expect(new Set(keys).size, block.id).toBe(keys.length);
    }
  });

  it('har unika id:n, eftersom det är dem det aktiva blocket sparas som', () => {
    const ids = WORD_BLOCKS.map((block) => block.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('erbjuder felsvar som inte är rätt svar i förklädnad', () => {
    for (const block of WORD_BLOCKS) {
      for (const pair of block.words) {
        const accepted = new Set(acceptedAnswers(pair));
        for (const wrong of pair.distractorsSv ?? []) {
          expect(accepted.has(normalize(wrong)), `${pair.en}: ${wrong}`).toBe(false);
        }
      }
    }
  });

  it('går att slå upp på id', () => {
    const first = WORD_BLOCKS[0];
    expect(blockById(first.id)).toBe(first);
    expect(blockById('finns-inte')).toBeNull();
    expect(blockById(null)).toBeNull();
  });
});

describe('acceptedAnswers', () => {
  it('godtar facit och dess former', () => {
    const answers = acceptedAnswers({ en: 'to run', sv: 'springa', also: ['Att springa'] });
    expect(answers).toContain('springa');
    expect(answers).toContain('att springa');
  });
});

describe('parseBlocks', () => {
  it('gör det den kan av en lista den inte skrivit själv', () => {
    const blocks = parseBlocks([
      {
        id: 'v1',
        name: 'Vecka 1',
        words: [
          { en: 'dog', sv: 'hund' },
          { en: 'dog', sv: 'hund' }, // samma glosa två gånger
          { en: 'cat' }, // ingen översättning
          'inte ens ett objekt',
        ],
      },
      { id: 'tom', words: [] },
      null,
    ]);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].words).toEqual([{ en: 'dog', sv: 'hund' }]);
  });

  it('faller tillbaka på id som namn, och ger tom lista för skräp', () => {
    expect(parseBlocks([{ id: 'v1', words: [{ en: 'dog', sv: 'hund' }] }])[0].name).toBe('v1');
    expect(parseBlocks('inte en lista')).toEqual([]);
  });

  it('behåller felsvar och former, men bara de som är text', () => {
    const [block] = parseBlocks([
      {
        id: 'v1',
        words: [
          { en: 'dog', sv: 'hund', also: ['hunden', 7], distractorsSv: ['katt'], distractorsEn: [] },
        ],
      },
    ]);
    expect(block.words[0].also).toEqual(['hunden']);
    expect(block.words[0].distractorsSv).toEqual(['katt']);
    expect(block.words[0].distractorsEn).toBeUndefined();
  });
});
