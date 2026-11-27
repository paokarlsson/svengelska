import { describe, expect, it } from 'vitest';
import { SEEDS, breakNote, breaksFromReply, followUpOf, nextBreak } from './breaks';
import { Note } from './profile';

const yes = (text: string): Note => ({ text, answer: 'yes' });
const no = (text: string): Note => ({ text, answer: 'no' });
const withThen = SEEDS.find((seed) => seed.then !== undefined)!;

describe('nextBreak', () => {
  it('tar ett frö som inte frågats', () => {
    const asked = SEEDS.slice(1).map((seed) => no(seed.text));
    expect(nextBreak(asked, null)).toBe(SEEDS[0].text);
  });

  // Så byggs ett avbrott vidare på utan en modell.
  it('ger följdfrågan efter ett ja', () => {
    expect(nextBreak([yes(withThen.text)], null)).toBe(withThen.then);
    expect(followUpOf([yes(withThen.text)])).toBe(withThen.then);
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
    expect(nextBreak(asked, 'adult')).toBe(adultOnly.text);
    expect(nextBreak(asked, null)).toBe(adultOnly.text);
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

describe('breakNote', () => {
  it('sparar svepet som ja, nej eller vet ej', () => {
    expect(breakNote('x', 'affirm').answer).toBe('yes');
    expect(breakNote('x', 'deny').answer).toBe('no');
    expect(breakNote('x', 'unsure').answer).toBe('unsure');
  });
});

describe('breaksFromReply', () => {
  it('behåller raderna, utan skiljetecken på slutet', () => {
    expect(breaksFromReply({ statements: ['Jag har sett en val?', ' Jag kan jonglera. '] }, [])).toEqual([
      'Jag har sett en val',
      'Jag kan jonglera',
    ]);
  });

  it('släpper det som redan frågats, dubbletter och skräp', () => {
    const reply = { statements: ['Jag kan jonglera', 'jag kan jonglera', 7, '', 'Jag har sett en val'] };
    expect(breaksFromReply(reply, [no('Jag har sett en val')])).toEqual(['Jag kan jonglera']);
  });

  it('ger inget för ett svar som inte är en lista', () => {
    for (const junk of [null, 'text', [], { statements: 'Jag' }]) {
      expect(breaksFromReply(junk, [])).toEqual([]);
    }
  });
});
