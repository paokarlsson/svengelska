import { beforeEach, describe, expect, it } from 'vitest';
import { LEFT_AFTER, emptyProfile } from '../intro/profile';
import { RoundSummary } from '../training/session';
import { PROFILE_KEY, ProfileStore } from './profile-store';

function summary(more: Partial<RoundSummary> = {}): RoundSummary {
  return {
    answered: 20,
    hits: 15,
    slow: 1,
    misses: 3,
    unsure: 1,
    words: 10,
    advanced: [],
    mastered: 0,
    longest: 8,
    fresh: { answered: 18, hits: 17 },
    ...more,
  };
}

describe('ProfileStore', () => {
  beforeEach(() => localStorage.clear());

  it('sparar profilen med versionsrad', () => {
    new ProfileStore().save({ ...emptyProfile(), level: 7 });
    expect(JSON.parse(localStorage.getItem(PROFILE_KEY)!)).toMatchObject({ version: 2, level: 7 });
    expect(new ProfileStore().profile?.level).toBe(7);
  });

  it('antecknar inget för den som inte har någon profil', () => {
    const store = new ProfileStore();
    store.noteRound('l', 3, summary());
    store.noteLeave(summary());
    expect(store.profile).toBeNull();
  });

  it('antecknar ett klart varv: vanorna, och hur de nya orden gick', () => {
    const store = new ProfileStore();
    store.save(emptyProfile());
    store.noteRound('egen-deg', 4, summary());

    const read = new ProfileStore().profile!;
    expect(read.habits).toEqual({ finished: 1, left: 0, misses: 3, unsure: 1 });
    expect(read.rounds).toEqual([{ list: 'egen-deg', aim: 4, answered: 18, hits: 17 }]);
  });

  it('säger inget om nivån för en lista utan känd nivå, eller ett varv utan nya ord', () => {
    const store = new ProfileStore();
    store.save(emptyProfile());
    store.noteRound('gammal', null, summary());
    store.noteRound('egen', 3, summary({ fresh: { answered: 0, hits: 0 } }));
    expect(store.profile!.rounds).toBeUndefined();
    expect(store.profile!.habits!.finished).toBe(2);
  });

  // Loggen: två varv lämnades på första kortet, av någon som valt fel lista.
  it('räknar inte ett varv som lämnats innan det börjat som att ge upp', () => {
    const store = new ProfileStore();
    store.save(emptyProfile());
    store.noteLeave(summary({ answered: 0, misses: 0, unsure: 0 }));
    store.noteLeave(summary({ answered: LEFT_AFTER - 1, misses: 1, unsure: 0 }));
    expect(store.profile!.habits).toEqual({ finished: 0, left: 0, misses: 1, unsure: 0 });

    store.noteLeave(summary({ answered: LEFT_AFTER, misses: 2, unsure: 1 }));
    expect(store.profile!.habits).toEqual({ finished: 0, left: 1, misses: 3, unsure: 1 });
  });
});
