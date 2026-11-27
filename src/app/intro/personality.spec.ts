import { describe, expect, it } from 'vitest';
import {
  TRAITS,
  describePersonality,
  observed,
  saidOf,
  sayPersonality,
  strongTraits,
  traitValue,
} from './personality';
import { Habits, Profile, TRAIT_IDS, emptyHabits, emptyProfile } from './profile';

const habits = (counts: Partial<Habits>): Habits => ({ ...emptyHabits(), ...counts });
const withTraits = (traits: Profile['traits'], more: Partial<Profile> = {}): Profile => ({
  ...emptyProfile(),
  traits,
  ...more,
});

describe('dragen', () => {
  it('har ett påstående per drag, och inget drag utan påstående', () => {
    expect(TRAITS.map((item) => item.id)).toEqual([...TRAIT_IDS]);
  });

  it('vänder svaret på de omvända påståendena', () => {
    expect(saidOf('challenge', 'affirm')).toBe(1);
    expect(saidOf('persistent', 'affirm')).toBe(-1);
    expect(saidOf('persistent', 'deny')).toBe(1);
    expect(saidOf('careful', 'unsure')).toBe(0);
  });
});

describe('traitValue', () => {
  it('är vad någon sa, så länge inget setts', () => {
    expect(traitValue(withTraits({ careful: -1 }), 'careful')).toBe(-1);
    expect(traitValue(emptyProfile(), 'careful')).toBeNull();
  });

  // Ett varv är ingen vana.
  it('låter inte lite beteende säga något', () => {
    expect(observed('persistent', habits({ left: 1 }))).toBeNull();
    expect(observed('careful', habits({ misses: 3 }))).toBeNull();
  });

  it('är beteendet för den som inte sa något', () => {
    expect(traitValue(withTraits({}, { habits: habits({ misses: 10 }) }), 'careful')).toBe(-1);
    expect(traitValue(withTraits({}, { habits: habits({ unsure: 10 }) }), 'careful')).toBe(1);
  });

  it('låter beteendet ta över i takt med att det blir mer av det', () => {
    const said = withTraits({ careful: 1 });
    const few = traitValue({ ...said, habits: habits({ misses: 6 }) }, 'careful')!;
    const many = traitValue({ ...said, habits: habits({ misses: 60 }) }, 'careful')!;

    expect(few).toBeLessThan(1);
    expect(many).toBeLessThan(few);
    expect(many).toBeLessThan(-0.6);
  });

  it('läser uthålligheten ur varv som lämnats', () => {
    expect(observed('persistent', habits({ finished: 8 }))!.value).toBe(1);
    expect(observed('persistent', habits({ finished: 3, left: 1 }))!.value).toBe(0);
    expect(observed('persistent', habits({ finished: 1, left: 3 }))!.value).toBe(-1);
  });

  it('har inget beteende för de drag som inte syns i övningen', () => {
    expect(observed('playful', habits({ finished: 40, misses: 40 }))).toBeNull();
  });
});

describe('vad som sägs', () => {
  it('nämner bara starka drag, åt rätt håll', () => {
    const profile = withTraits({ challenge: 1, playful: 0, practical: -1 });
    expect(strongTraits(profile).map(({ trait, high }) => [trait.id, high])).toEqual([
      ['challenge', true],
      ['practical', false],
    ]);
    expect(describePersonality(profile)).toHaveLength(2);
  });

  it('säger inget när inget drag sticker ut', () => {
    expect(describePersonality(emptyProfile())).toEqual([]);
    expect(sayPersonality(withTraits({ challenge: 0 }))).toBeNull();
  });

  it('säger högst två drag till den som övar', () => {
    const all = withTraits({ challenge: 1, playful: 1, practical: 1, persistent: 1, careful: 1 });
    expect(sayPersonality(all)).toBe('Jag tror att du vill ha motstånd och du gillar udda ord.');
  });
});
