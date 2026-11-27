import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { SEEDS } from '../intro/breaks';
import { emptyProfile } from '../intro/profile';
import { ApiKeyStore } from './api-key-store';
import { BreakDeck, breakRequestText } from './break-deck';
import { ProfileStore } from './profile-store';

const withThen = SEEDS.find((seed) => seed.then !== undefined)!;

describe('BreakDeck', () => {
  let deck: BreakDeck;
  let profiles: ProfileStore;
  let sent: string[];
  let reply: unknown;

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    deck = TestBed.inject(BreakDeck);
    profiles = TestBed.inject(ProfileStore);
    sent = [];
    reply = {
      breaks: [
        { text: 'Jag har sett en val', opens: 'havet' },
        { text: 'Jag kan jonglera', opens: 'cirkus' },
      ],
    };
    deck.ask = async (_key, request) => {
      sent.push(request);
      return reply;
    };
  });

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  it('visar inga avbrott för den som saknar profil', () => {
    expect(deck.available).toBe(false);
    expect(deck.peek()).toBeNull();
  });

  it('tar ett frö utan nyckel, och sparar svaret i profilen', () => {
    profiles.save(emptyProfile());
    const item = deck.peek(() => 0)!;
    expect(SEEDS.map((seed) => seed.text)).toContain(item.text);

    deck.answer(item, 'affirm');
    expect(profiles.profile!.breaks).toEqual([{ text: item.text, answer: 'yes', opens: item.opens }]);
    expect(sent).toHaveLength(0);
  });

  it('skriver nya med en nyckel, och visar dem före fröna', async () => {
    TestBed.inject(ApiKeyStore).save('sk-ant-test');
    profiles.save({ ...emptyProfile(), interests: ['resor'] });
    deck.refill();
    await settle();

    expect(sent[0]).toContain('resor');
    expect(deck.peek()).toEqual({ text: 'Jag har sett en val', opens: 'havet' });
    deck.answer(deck.peek()!, 'deny');
    expect(deck.peek()?.text).toBe('Jag kan jonglera');
  });

  it('låter följdfrågan till ett ja gå före det skrivna', async () => {
    TestBed.inject(ApiKeyStore).save('sk-ant-test');
    profiles.save(emptyProfile());
    deck.answer(withThen, 'affirm');
    await settle();

    expect(deck.peek()?.text).toBe(withThen.then);
  });

  it('berättar för Claude vilka avbrott som redan frågats, även de med vet ej', () => {
    const text = breakRequestText({ ...emptyProfile(), breaks: [{ text: 'Jag kan jonglera', answer: 'unsure' }] });
    expect(text).toContain('Jag kan jonglera');
  });

  it('glömmer det skrivna för den som börjar om', async () => {
    TestBed.inject(ApiKeyStore).save('sk-ant-test');
    profiles.save(emptyProfile());
    deck.refill();
    await settle();
    deck.forget();
    expect(SEEDS.map((seed) => seed.text)).toContain(deck.peek()!.text);
  });

  // Loggen: Claude skrev «Jag kan vissla med två fingrar i munnen» medan fröet
  // om att vissla med fingrarna låg och väntade.
  it('berättar för Claude vilka frön som väntar, och inte de som frågats', () => {
    const asked = SEEDS[0].text;
    const text = breakRequestText({ ...emptyProfile(), breaks: [{ text: asked, answer: 'no' }] });
    const waiting = text.split('Ligger redan i appens hög')[1];
    expect(waiting).toContain(SEEDS[1].text);
    expect(waiting).not.toContain(asked);
  });
});
