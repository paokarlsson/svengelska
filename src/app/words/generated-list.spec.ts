import { describe, expect, it } from 'vitest';
import {
  LIST_INSTRUCTIONS,
  LIST_SCHEMA,
  LIST_SIZE,
  blockFromReply,
  describeLearner,
  listRequestText,
  withoutLeaks,
} from './generated-list';
import { LADDER } from '../intro/intro-run';
import { TOP_LEVEL, emptyProfile } from '../intro/profile';
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
    expect(listRequestText('  rymden, årskurs 5 ', { known: [] })).toContain('rymden, årskurs 5');
  });

  it('nämner glosorna eleven redan har, och bara när det finns några', () => {
    expect(listRequestText('djur', { known: [] })).not.toContain('redan');
    expect(listRequestText('djur', { known: [{ en: 'dog', sv: 'hund' }] })).toContain('dog = hund');
  });

  it('säger rent ut när temat är modellens att välja', () => {
    const request = listRequestText('  ', { known: [], profile: { ...emptyProfile(), level: 2 } });
    expect(request).toContain('Välj temat själv');
    expect(request).not.toContain('Önskemål:');
  });

  it('nämner listorna som redan finns, så att ett tema inte kommer två gånger', () => {
    expect(listRequestText('', { known: [], lists: ['På stallet'] })).toContain('På stallet');
  });

  it('nämner inte en profil som inte säger något', () => {
    expect(listRequestText('djur', { known: [], profile: emptyProfile() })).not.toContain('Om eleven');
    expect(listRequestText('djur', { known: [], profile: null })).not.toContain('Om eleven');
  });
});

describe('describeLearner', () => {
  it('säger ingenting om den som hoppade över allt', () => {
    expect(describeLearner(emptyProfile())).toBeNull();
  });

  it('bär intressen, ålder och skäl', () => {
    const text = describeLearner({
      interests: ['djur', 'rymden'],
      age: 'child',
      voluntary: false,
      level: null,
    })!;

    expect(text).toContain('djur, rymden');
    expect(text).toContain('under 13');
    expect(text).toContain('måste');
  });

  // En siffra betyder något bara för den som sett trappan. Orden betyder samma
  // sak för alla som kan engelska.
  it('beskriver nivån med ord ur trappan, aldrig med en siffra', () => {
    const text = describeLearner({ ...emptyProfile(), level: 3 })!;

    expect(text).toContain(LADDER[2][0].en);
    expect(text).toContain(LADDER[3][0].en);
    expect(text).not.toMatch(/nivå\s*\d/i);
  });

  it('har något att säga i trappans båda ändar', () => {
    expect(describeLearner({ ...emptyProfile(), level: 0 })).toContain(LADDER[0][0].en);
    expect(describeLearner({ ...emptyProfile(), level: TOP_LEVEL })).toContain(
      LADDER[TOP_LEVEL - 1][0].en,
    );
  });

  it('skiljer den som vill från den som måste', () => {
    const willing = describeLearner({ ...emptyProfile(), voluntary: true })!;
    const made = describeLearner({ ...emptyProfile(), voluntary: false })!;
    expect(willing).not.toBe(made);
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
