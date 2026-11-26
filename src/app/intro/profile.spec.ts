import { describe, expect, it } from 'vitest';
import { TOP_LEVEL, emptyProfile, readProfile, saysSomething } from './profile';

describe('readProfile', () => {
  it('ger en tom profil för skräp', () => {
    for (const junk of [null, 42, 'nej', [], undefined]) {
      expect(readProfile(junk)).toEqual(emptyProfile());
    }
  });

  it('behåller det som går att känna igen och släpper resten', () => {
    const profile = readProfile({
      interests: ['djur', 17, '  ', ' musik '],
      age: 'teen',
      voluntary: false,
      level: 3,
      skräp: true,
    });

    expect(profile).toEqual({ interests: ['djur', 'musik'], age: 'teen', voluntary: false, level: 3 });
  });

  it('håller nivån inom trappan', () => {
    expect(readProfile({ level: 99 }).level).toBe(TOP_LEVEL);
    expect(readProfile({ level: -4 }).level).toBe(0);
    expect(readProfile({ level: 'hög' }).level).toBeNull();
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
});
