import { describe, expect, it } from 'vitest';
import { SEEDS, breakNote, breaksFromReply, followUpOf, nextBreak } from './breaks';
import { Note } from './profile';

const yes = (text: string): Note => ({ text, answer: 'yes' });
const no = (text: string): Note => ({ text, answer: 'no' });
const withThen = SEEDS.find((seed) => seed.then !== undefined)!;

describe('fröna', () => {
  // Knasigt får det vara, men ett ja ska öppna något.
  it('öppnar alla ett ordområde', () => {
    for (const seed of SEEDS) {
      expect(seed.opens.trim().length, seed.text).toBeGreaterThan(3);
    }
  });

  // Följdfrågan visas ett avbrott senare. «Jag skulle vilja träffa det» gick
  // inte att förstå när det kom.
  it('har följdfrågor som går att förstå utan fröet', () => {
    for (const seed of SEEDS.filter((item) => item.then !== undefined)) {
      expect(seed.then).toMatch(/^Jag /);
      expect(seed.then).not.toMatch(/\b(det|dem|den|dit|där)\b/i);
    }
  });

  it('har inga frön med samma text, och inga följdfrågor som också är frön', () => {
    const texts = SEEDS.map((seed) => seed.text);
    expect(new Set(texts).size).toBe(texts.length);
    for (const seed of SEEDS) {
      expect(texts).not.toContain(seed.then);
    }
  });
});

describe('nextBreak', () => {
  it('tar ett frö som inte frågats, med sitt område', () => {
    const asked = SEEDS.slice(1).map((seed) => no(seed.text));
    expect(nextBreak(asked, null)).toEqual({ text: SEEDS[0].text, opens: SEEDS[0].opens });
  });

  // Så byggs ett avbrott vidare på utan en modell.
  it('ger följdfrågan efter ett ja, i samma område', () => {
    const expected = { text: withThen.then, opens: withThen.opens };
    expect(nextBreak([yes(withThen.text)], null)).toEqual(expected);
    expect(followUpOf([yes(withThen.text)])).toEqual(expected);
  });

  it('ger ingen följdfråga efter ett nej eller vet ej', () => {
    expect(followUpOf([no(withThen.text)])).toBeNull();
    expect(followUpOf([{ text: withThen.text, answer: 'unsure' }])).toBeNull();
  });

  it('frågar inte följdfrågan två gånger', () => {
    expect(followUpOf([yes(withThen.text), yes(withThen.then!), yes(withThen.text)])).toBeNull();
  });

  it('frågar bara det som passar åldern', () => {
    const adultOnly = SEEDS.find((seed) => seed.ages?.length === 1 && seed.ages[0] === 'adult')!;
    const asked = SEEDS.filter((seed) => seed !== adultOnly).map((seed) => no(seed.text));
    expect(nextBreak(asked, 'child')).toBeNull();
    expect(nextBreak(asked, 'adult')?.text).toBe(adultOnly.text);
    expect(nextBreak(asked, null)?.text).toBe(adultOnly.text);
  });
});

describe('breakNote', () => {
  it('sparar svepet och området', () => {
    const item = { text: 'x', opens: 'y' };
    expect(breakNote(item, 'affirm')).toEqual({ text: 'x', answer: 'yes', opens: 'y' });
    expect(breakNote(item, 'deny').answer).toBe('no');
    expect(breakNote(item, 'unsure').answer).toBe('unsure');
  });
});

describe('breaksFromReply', () => {
  it('släpper frågor: ett kort ska vara sant eller falskt', () => {
    expect(breaksFromReply({ breaks: [{ text: 'Har du sett en val?', opens: 'havet' }] }, [])).toEqual([]);
  });

  it('behåller avbrotten, utan skiljetecken på slutet', () => {
    const reply = {
      breaks: [
        { text: 'Jag har sett en val!', opens: 'havet' },
        { text: ' Jag kan jonglera. ', opens: 'cirkus' },
      ],
    };
    expect(breaksFromReply(reply, [])).toEqual([
      { text: 'Jag har sett en val', opens: 'havet' },
      { text: 'Jag kan jonglera', opens: 'cirkus' },
    ]);
  });

  // Ett avbrott som inte öppnar något är just det som inte ska visas.
  it('släpper avbrott utan område, det som redan frågats, dubbletter och skräp', () => {
    const reply = {
      breaks: [
        { text: 'Jag kan jonglera', opens: 'cirkus' },
        { text: 'jag kan jonglera', opens: 'cirkus' },
        { text: 'Jag kan vissla', opens: '  ' },
        { text: 'Jag har sett en val', opens: 'havet' },
        'Jag är en sträng',
        7,
      ],
    };
    expect(breaksFromReply(reply, [no('Jag har sett en val')])).toEqual([
      { text: 'Jag kan jonglera', opens: 'cirkus' },
    ]);
  });

  it('ger inget för ett svar som inte är en lista', () => {
    for (const junk of [null, 'text', [], { breaks: 'Jag' }, { statements: ['Jag'] }]) {
      expect(breaksFromReply(junk, [])).toEqual([]);
    }
  });
});
