import { describe, expect, it } from 'vitest';
import { INTRO_INSTRUCTIONS, INTRO_SCHEMA, batchFromReply, introRequestText } from './intro-writing';
import { TRAIT_IDS, emptyProfile } from './profile';

const statement = (text: string, opens = 'något') => ({ text, opens });

describe('uppdraget', () => {
  it('beskriver vart och ett av dragen', () => {
    for (const id of TRAIT_IDS) {
      expect(INTRO_INSTRUCTIONS).toContain(`- ${id}:`);
    }
  });

  it('säger att korten är påståenden som är sanna eller falska', () => {
    expect(INTRO_INSTRUCTIONS).toContain('aldrig frågor');
    expect(INTRO_SCHEMA.required).toEqual(['statements', 'traits']);
  });

  it('skickar det appen vet och det som redan visats', () => {
    const text = introRequestText({ ...emptyProfile(), age: 'adult', interests: ['musik'] }, ['Jag lagar gärna mat']);
    expect(text).toContain('vuxen');
    expect(text).toContain('musik');
    expect(text).toContain('Jag lagar gärna mat');
  });
});

describe('batchFromReply', () => {
  it('behåller påståenden med område och drag som finns', () => {
    const batch = batchFromReply(
      {
        statements: [statement('Jag har klappat en ko.', 'bondgården')],
        traits: [{ trait: 'careful', text: 'Jag gissar hellre än jag hoppar över', high: false }],
      },
      [],
    );
    expect(batch).toEqual({
      statements: [{ text: 'Jag har klappat en ko', opens: 'bondgården' }],
      traits: [{ trait: 'careful', text: 'Jag gissar hellre än jag hoppar över', keyed: -1 }],
    });
  });

  it('släpper frågor, påståenden utan område och det som redan visats', () => {
    const batch = batchFromReply(
      {
        statements: [
          statement('Gillar du djur?'),
          statement('Jag kan vissla', ' '),
          statement('Jag lagar gärna mat'),
          statement('Jag har sett en älg', 'skogens djur'),
        ],
        traits: [],
      },
      ['Jag lagar gärna mat'],
    );
    expect(batch?.statements.map((item) => item.text)).toEqual(['Jag har sett en älg']);
  });

  it('släpper drag som inte finns, kommer två gånger eller saknar håll', () => {
    const batch = batchFromReply(
      {
        statements: [],
        traits: [
          { trait: 'lazy', text: 'Jag är lat', high: true },
          { trait: 'challenge', text: 'Jag vill ha det svårt', high: true },
          { trait: 'challenge', text: 'Jag vill ha det lätt', high: false },
          { trait: 'playful', text: 'Jag gillar ordvitsar' },
        ],
      },
      [],
    );
    expect(batch?.traits.map((item) => item.trait)).toEqual(['challenge']);
  });

  it('ger inget när ingenting gick att använda', () => {
    for (const junk of [null, 'text', [], { statements: [], traits: [] }, { statements: 'Jag' }]) {
      expect(batchFromReply(junk, [])).toBeNull();
    }
  });
});
