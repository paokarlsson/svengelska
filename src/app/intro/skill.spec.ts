import { describe, expect, it } from 'vitest';
import { Profile, RoundNote, TOP_LEVEL, emptyProfile } from './profile';
import { MIN_ANSWERED, describeSkill, moved, sayLevel, skillOf } from './skill';
import { wordsOnStep } from './intro-run';

const round = (aim: number, hits: number, answered = 20): RoundNote => ({ list: 'l', aim, answered, hits });
const profile = (level: number | null, rounds: RoundNote[] = []): Profile => ({
  ...emptyProfile(),
  level,
  rounds,
});

describe('skillOf', () => {
  it('är provets nivå innan något varv spelats', () => {
    expect(skillOf(profile(4))).toBe(4);
    expect(skillOf(profile(null))).toBeNull();
  });

  // Det loggen visade: en vuxen på nivå 4 klarade Skolan nästan felfritt.
  // Det säger att Skolan var lätt, inte att hen kan mer än provet sa.
  it('flyttar inte nivån för en lätt lista under den', () => {
    expect(skillOf(profile(4, [round(1, 19)]))).toBe(4);
  });

  it('flyttar upp nivån för en lista i höjd med den som satt direkt', () => {
    expect(skillOf(profile(4, [round(4, 19)]))).toBe(5);
  });

  it('flyttar ner nivån för en lista som inte satt alls', () => {
    expect(skillOf(profile(4, [round(4, 2)]))).toBe(3);
  });

  it('flyttar den inte för en lista som gör sitt jobb', () => {
    expect(skillOf(profile(4, [round(4, 10)]))).toBe(4);
  });

  it('flyttar den inte för ett varv med för få nya ord', () => {
    expect(moved(4, round(4, MIN_ANSWERED - 1, MIN_ANSWERED - 1))).toBe(4);
  });

  it('stannar inom trappan', () => {
    expect(skillOf(profile(TOP_LEVEL, [round(TOP_LEVEL, 20)]))).toBe(TOP_LEVEL);
    expect(skillOf(profile(0, [round(0, 0)]))).toBe(0);
  });

  it('klättrar ett steg i taget över flera varv', () => {
    expect(skillOf(profile(3, [round(3, 19), round(4, 18), round(5, 20)]))).toBe(6);
  });

  it('börjar vid första varvet för den som hoppade över provet', () => {
    expect(skillOf(profile(null, [round(1, 20)]))).toBe(2);
  });
});

describe('describeSkill', () => {
  it('beskriver nivån med ord och inte med en siffra', () => {
    const text = describeSkill(profile(4))!;
    expect(text).toContain(wordsOnStep(3)[0]);
    expect(text).toContain(wordsOnStep(4)[0]);
    expect(text).not.toMatch(/\d/);
  });

  it('säger när varven flyttat nivån från provet', () => {
    expect(describeSkill(profile(4, [round(4, 20)]))).toContain('högre än provet');
    expect(describeSkill(profile(4, [round(4, 0)]))).toContain('lägre än provet');
  });

  it('har en mening för varje nivå', () => {
    for (let level = 0; level <= TOP_LEVEL; level++) {
      expect(sayLevel(level).length).toBeGreaterThan(0);
    }
  });
});
