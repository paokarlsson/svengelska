import { describe, expect, it } from 'vitest';
import { FOLLOW_UP_SCHEMA, QuestionNode, TreeWalk, followUpRequestText, treeFromReply } from './follow-up';
import { emptyProfile, readProfile, saysSomething } from './profile';
import { describeLearner } from '../words/generated-list';

const leaf = (text: string): QuestionNode => ({ text, yes: null, no: null });

const TREE: QuestionNode = {
  text: 'Jag lagar gärna mat',
  yes: {
    text: 'Jag bakar oftare än jag lagar middag',
    yes: leaf('Jag har bakat surdegsbröd'),
    no: leaf('Jag grillar gärna'),
  },
  no: {
    text: 'Jag tränar flera gånger i veckan',
    yes: leaf('Jag springer hellre än jag simmar'),
    no: leaf('Jag gillar att spela brädspel'),
  },
};

describe('treeFromReply', () => {
  it('läser ett helt träd', () => {
    expect(treeFromReply(TREE)).toEqual(TREE);
  });

  it('gör en saknad gren till ett löv, och kastar allt under tredje nivån', () => {
    const tree = treeFromReply({
      text: ' Jag gillar djur ',
      yes: { text: '', yes: null, no: null },
      no: { text: 'Jag har hund', yes: { text: 'Jag rider', yes: { text: 'för djupt' } }, no: 7 },
    });
    expect(tree).toEqual({
      text: 'Jag gillar djur',
      yes: null,
      no: { text: 'Jag har hund', yes: leaf('Jag rider'), no: null },
    });
  });

  it('ger inget träd utan rot', () => {
    expect(treeFromReply(null)).toBeNull();
    expect(treeFromReply({ yes: TREE })).toBeNull();
    expect(treeFromReply([TREE])).toBeNull();
  });
});

describe('FOLLOW_UP_SCHEMA', () => {
  it('är tre nivåer djupt och slutar i löv', () => {
    const leafSchema = FOLLOW_UP_SCHEMA.properties.yes.properties.no;
    expect(leafSchema.required).toEqual(['text']);
  });
});

describe('TreeWalk', () => {
  it('går ja-grenen på ja och nej-grenen på nej, tre kort', () => {
    const walk = new TreeWalk(TREE);
    walk.answer('affirm');
    expect(walk.current).toBe('Jag bakar oftare än jag lagar middag');
    walk.answer('deny');
    expect(walk.current).toBe('Jag grillar gärna');
    walk.answer('affirm');
    expect(walk.done).toBe(true);
    expect(walk.notes).toEqual([
      { text: 'Jag lagar gärna mat', answer: 'yes' },
      { text: 'Jag bakar oftare än jag lagar middag', answer: 'no' },
      { text: 'Jag grillar gärna', answer: 'yes' },
    ]);
  });

  it('låter vet ej följa nej-grenen men sparar det som vet ej', () => {
    const walk = new TreeWalk(TREE);
    expect(walk.answer('unsure')).toEqual({ text: 'Jag lagar gärna mat', answer: 'unsure' });
    expect(walk.current).toBe('Jag tränar flera gånger i veckan');
  });

  it('nämner allt som fortfarande kan visas, så att nästa träd inte upprepar det', () => {
    const walk = new TreeWalk(TREE);
    walk.answer('affirm');
    expect(walk.upcoming()).toEqual([
      'Jag bakar oftare än jag lagar middag',
      'Jag har bakat surdegsbröd',
      'Jag grillar gärna',
    ]);
  });

  it('svarar inte när vägen är gången', () => {
    const walk = new TreeWalk(leaf('Jag gillar djur'));
    walk.answer('deny');
    expect(walk.answer('affirm')).toBeNull();
    expect(walk.upcoming()).toEqual([]);
  });
});

describe('följdfrågornas svar i profilen', () => {
  it('sparas och läses tillbaka, och skräp faller bort', () => {
    const profile = readProfile({
      interests: [],
      notes: [
        { text: 'Jag bakar', answer: 'yes' },
        { text: 'Jag grillar', answer: 'kanske' },
        { text: '  ', answer: 'no' },
        'Jag springer',
      ],
    });
    expect(profile.notes).toEqual([{ text: 'Jag bakar', answer: 'yes' }]);
    expect(saysSomething({ ...emptyProfile(), notes: [{ text: 'Jag bakar', answer: 'no' }] })).toBe(true);
  });

  it('följer med till den som väljer glosor', () => {
    const text = describeLearner({
      ...emptyProfile(),
      notes: [
        { text: 'Jag bakar', answer: 'yes' },
        { text: 'Jag grillar', answer: 'unsure' },
      ],
    });
    expect(text).toContain('«Jag bakar»: sant');
    expect(text).toContain('«Jag grillar»: hoppade över');
  });

  it('och till nästa träd, med det som står på tur', () => {
    const text = followUpRequestText(
      { ...emptyProfile(), interests: ['mat och matlagning'] },
      ['Jag bakar'],
    );
    expect(text).toContain('mat och matlagning');
    expect(text).toContain('- Jag bakar');
  });
});
