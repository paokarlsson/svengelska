import { describe, expect, it } from 'vitest';
import {
  LIST_INSTRUCTIONS,
  LIST_SCHEMA,
  LIST_SIZE,
  blockFromReply,
  listRequestText,
  withoutLeaks,
} from './generated-list';
import { WordBlock } from './word-catalog';

const NONE: ReadonlySet<string> = new Set();

function reply(words: unknown[], name = 'Rymden'): unknown {
  return { name, words };
}

describe('blockFromReply', () => {
  it('gör en lista av ett svar i rätt form', () => {
    const block = blockFromReply(
      reply([
        { en: 'moon', sv: 'måne', distractorsEn: ['sun'], distractorsSv: ['sol'] },
        { en: 'star', sv: 'stjärna', distractorsEn: ['comet'], distractorsSv: ['komet'] },
      ]),
      NONE,
    );

    expect(block).not.toBeNull();
    expect(block!.name).toBe('Rymden');
    expect(block!.id).toBe('egen-rymden');
    expect(block!.words.map((pair) => pair.en)).toEqual(['moon', 'star']);
  });

  it('ger null för det som inte är en lista', () => {
    for (const junk of [null, 42, 'nej', [], {}, { name: 'Tom', words: [] }, { words: 'x' }]) {
      expect(blockFromReply(junk, NONE)).toBeNull();
    }
  });

  it('släpper rader som inte är glosor men behåller resten', () => {
    const block = blockFromReply(reply([{ en: 'moon' }, 17, { en: 'star', sv: 'stjärna' }]), NONE);
    expect(block!.words).toEqual([{ en: 'star', sv: 'stjärna' }]);
  });

  it('skriver aldrig över en lista som redan finns', () => {
    const first = blockFromReply(reply([{ en: 'moon', sv: 'måne' }]), NONE)!;
    const second = blockFromReply(reply([{ en: 'star', sv: 'stjärna' }]), new Set([first.id]))!;
    const third = blockFromReply(
      reply([{ en: 'sun', sv: 'sol' }]),
      new Set([first.id, second.id]),
    )!;

    expect(new Set([first.id, second.id, third.id]).size).toBe(3);
  });

  it('ger listan ett namn och ett id även när svaret saknar namn', () => {
    const block = blockFromReply({ name: '  ', words: [{ en: 'moon', sv: 'måne' }] }, NONE)!;
    expect(block.name.length).toBeGreaterThan(0);
    expect(block.id.startsWith('egen-')).toBe(true);
  });
});

describe('withoutLeaks', () => {
  const block: WordBlock = {
    id: 'egen-djur',
    name: 'Djur',
    words: [
      { en: 'dog', sv: 'hund', distractorsEn: ['cat', 'fox', 'Fox'], distractorsSv: ['katt', 'räv'] },
      { en: 'cat', sv: 'katt', distractorsEn: ['dog', ' DOG '], distractorsSv: ['hund'] },
    ],
  };

  // Invarianten hela filen finns för: ett felsvar som eleven känner igen från
  // en annan glosa i listan går att förkasta utan att kunna ordet som frågas.
  it('lämnar aldrig kvar ett felsvar som står som glosa i samma lista', () => {
    const cleaned = withoutLeaks(block);
    const english = new Set(cleaned.words.map((pair) => pair.en));
    const swedish = new Set(cleaned.words.map((pair) => pair.sv));

    for (const pair of cleaned.words) {
      expect((pair.distractorsEn ?? []).some((word) => english.has(word.trim().toLowerCase()))).toBe(
        false,
      );
      expect((pair.distractorsSv ?? []).some((word) => swedish.has(word.trim().toLowerCase()))).toBe(
        false,
      );
    }
  });

  it('behåller felsvaren utanför listan, en gång var', () => {
    const [dog] = withoutLeaks(block).words;
    expect(dog.distractorsEn).toEqual(['fox']);
    expect(dog.distractorsSv).toEqual(['räv']);
  });

  it('låter en glosa stå utan felsvar hellre än med läckande', () => {
    const [, cat] = withoutLeaks(block).words;
    expect(cat.distractorsEn).toBeUndefined();
    expect(cat.distractorsSv).toBeUndefined();
  });

  it('rör inte glosorna själva', () => {
    const cleaned = withoutLeaks({ ...block, words: [{ en: 'dog', sv: 'hund', also: ['hunden'] }] });
    expect(cleaned.words).toEqual([{ en: 'dog', sv: 'hund', also: ['hunden'] }]);
  });
});

describe('listRequestText', () => {
  it('bär önskemålet som det skrevs', () => {
    expect(listRequestText('  rymden, årskurs 5 ', [])).toContain('rymden, årskurs 5');
  });

  it('nämner glosorna eleven redan har, och bara när det finns några', () => {
    expect(listRequestText('djur', [])).not.toContain('redan');
    expect(listRequestText('djur', [{ en: 'dog', sv: 'hund' }])).toContain('dog = hund');
  });
});

describe('uppdraget', () => {
  it('säger hur många glosor ett tema ska ge', () => {
    expect(LIST_INSTRUCTIONS).toContain(`${LIST_SIZE} glosor`);
  });

  it('kräver varje fält appen läser', () => {
    expect(LIST_SCHEMA.required).toEqual(['name', 'words']);
    expect(LIST_SCHEMA.properties.words.items.required).toEqual([
      'en',
      'sv',
      'distractorsEn',
      'distractorsSv',
    ]);
  });
});
