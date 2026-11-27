import { describe, expect, it } from 'vitest';
import {
  PROFILE_VERSION,
  Profile,
  ROUNDS_KEPT,
  TOP_LEVEL,
  emptyProfile,
  readProfile,
  saysSomething,
  storedProfile,
} from './profile';

describe('readProfile', () => {
  it('ger en tom profil för skräp', () => {
    for (const junk of [null, 42, 'nej', [], undefined]) {
      expect(readProfile(junk)).toEqual(emptyProfile());
    }
  });

  it('behåller det som går att känna igen och släpper resten', () => {
    const profile = readProfile({
      version: PROFILE_VERSION,
      interests: ['djur', 17, '  ', ' musik '],
      age: 'teen',
      voluntary: false,
      level: 3,
      skräp: true,
    });

    expect(profile).toEqual({ interests: ['djur', 'musik'], age: 'teen', voluntary: false, level: 3 });
  });

  it('håller nivån inom trappan', () => {
    expect(readProfile({ version: PROFILE_VERSION, level: 99 }).level).toBe(TOP_LEVEL);
    expect(readProfile({ version: PROFILE_VERSION, level: -4 }).level).toBe(0);
    expect(readProfile({ version: PROFILE_VERSION, level: 'hög' }).level).toBeNull();
  });

  // Version 1 hade fem steg. `meticulous` var det översta och är nu steg 5.
  it('flyttar en nivå från version 1 till den nya trappan', () => {
    expect(readProfile({ level: 3 }).level).toBe(3);
    expect(readProfile({ level: 4 }).level).toBe(4);
    expect(readProfile({ level: 5 }).level).toBe(6);
    expect(readProfile({ level: 99 }).level).toBe(6);
  });

  it('läser tillbaka det den sparat, versionsraden inräknad', () => {
    const profile: Profile = {
      ...emptyProfile(),
      level: 7,
      traits: { challenge: 1, careful: -1, playful: 0 },
      habits: { finished: 3, left: 1, misses: 7, unsure: 2 },
      rounds: [{ list: 'egen-deg', aim: 4, answered: 18, hits: 16 }],
      breaks: [{ text: 'Jag har sett ett norrsken', answer: 'yes' }],
    };
    expect(readProfile(JSON.parse(JSON.stringify(storedProfile(profile))))).toEqual(profile);
  });

  it('släpper drag, vanor och varv den inte känner igen', () => {
    const profile = readProfile({
      version: PROFILE_VERSION,
      traits: { challenge: 2, lazy: 1, careful: -1 },
      habits: { finished: -3, left: 'många', misses: 4 },
      rounds: [{ list: 'a', aim: 2, answered: 10, hits: 30 }, { list: 'b' }, 'skräp'],
    });
    expect(profile.traits).toEqual({ careful: -1 });
    expect(profile.habits).toEqual({ finished: 0, left: 0, misses: 4, unsure: 0 });
    expect(profile.rounds).toEqual([{ list: 'a', aim: 2, answered: 10, hits: 10 }]);
  });

  it('minns bara de senaste varven', () => {
    const rounds = Array.from({ length: ROUNDS_KEPT + 5 }, (_, i) => ({ list: `l${i}`, aim: 1, answered: 10, hits: 5 }));
    const read = readProfile({ version: PROFILE_VERSION, rounds }).rounds!;
    expect(read).toHaveLength(ROUNDS_KEPT);
    expect(read.at(-1)!.list).toBe(`l${ROUNDS_KEPT + 4}`);
  });

  it('gissar inte en ålder den inte känner igen', () => {
    expect(readProfile({ age: 'pensionär' }).age).toBeNull();
  });
});

describe('saysSomething', () => {
  it('är falskt för den som hoppade över allt', () => {
    expect(saysSomething(emptyProfile())).toBe(false);
  });

  // Att ha prövats och inte klarat något är en upplysning. Att inte ha prövats
  // är ingen.
  it('räknar nivå noll som något sagt', () => {
    expect(saysSomething({ ...emptyProfile(), level: 0 })).toBe(true);
  });

  it('räknar ett drag som något sagt, men inte ett vet ej', () => {
    expect(saysSomething({ ...emptyProfile(), traits: { challenge: 1 } })).toBe(true);
    expect(saysSomething({ ...emptyProfile(), traits: { challenge: 0 } })).toBe(false);
  });
});
