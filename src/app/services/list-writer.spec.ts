import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ApiKeyStore } from './api-key-store';
import { ListWriteError } from './list-write-error';
import { ListWriter } from './list-writer';
import { ProfileStore } from './profile-store';
import { emptyProfile } from '../intro/profile';
import { WordLibrary } from '../words/word-library';
import { TrainingEngine } from '../training/training-engine';

const GOOD = {
  name: 'Rymden',
  words: [
    { en: 'moon', sv: 'måne', distractorsEn: ['sun', 'star'], distractorsSv: ['sol', 'stjärna'] },
    { en: 'star', sv: 'stjärna', distractorsEn: ['comet'], distractorsSv: ['komet'] },
  ],
};

describe('ListWriter', () => {
  let writer: ListWriter;
  let keys: ApiKeyStore;
  /** Vad som skickades: nyckeln och frågan. */
  let sent: [string, string][];

  function answerWith(reply: unknown): void {
    writer.ask = async (apiKey, request) => {
      sent.push([apiKey, request]);
      return reply;
    };
  }

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    writer = TestBed.inject(ListWriter);
    keys = TestBed.inject(ApiKeyStore);
    sent = [];
  });

  it('frågar aldrig Anthropic utan en nyckel', async () => {
    answerWith(GOOD);

    await expect(writer.write('rymden')).rejects.toMatchObject({ reason: 'no-key' });
    expect(sent).toHaveLength(0);
  });

  it('gör en lista av svaret, utan felsvar som står i listan', async () => {
    keys.save('sk-ant-test');
    answerWith(GOOD);

    const block = await writer.write('rymden');

    expect(block.name).toBe('Rymden');
    expect(block.words.map((pair) => pair.en)).toEqual(['moon', 'star']);
    // «star» och «stjärna» är glosor i samma lista och får inte vara felsvar.
    expect(block.words[0].distractorsEn).toEqual(['sun']);
    expect(block.words[0].distractorsSv).toEqual(['sol']);
  });

  it('skickar nyckeln, önskemålet och glosorna eleven redan har', async () => {
    keys.save('sk-ant-test');
    answerWith(GOOD);
    const known = TestBed.inject(WordLibrary).words[0];

    await writer.write('på restaurang');

    expect(sent).toHaveLength(1);
    const [apiKey, request] = sent[0];
    expect(apiKey).toBe('sk-ant-test');
    expect(request).toContain('på restaurang');
    expect(request).toContain(`${known.en} = ${known.sv}`);
  });

  it('ber inte om en lista utan vare sig önskemål eller profil', async () => {
    keys.save('sk-ant-test');
    answerWith(GOOD);

    await expect(writer.write('   ')).rejects.toMatchObject({ reason: 'no-wish' });
    expect(sent).toHaveLength(0);
  });

  it('låter appen välja tema åt den som gjort startrundan', async () => {
    keys.save('sk-ant-test');
    TestBed.inject(ProfileStore).save({
      interests: ['rymden'],
      age: 'child',
      voluntary: true,
      level: 1,
    });
    answerWith(GOOD);

    await writer.write('');

    const [, request] = sent[0];
    expect(request).toContain('Välj temat själv');
    expect(request).toContain('rymden');
    expect(request).toContain('under 13');
  });

  // Så att första varvet på listan kan säga om den låg rätt.
  it('antecknar nivån listan skrevs för', async () => {
    keys.save('sk-ant-test');
    TestBed.inject(ProfileStore).save({ ...emptyProfile(), level: 5 });
    answerWith(GOOD);

    expect((await writer.write('bakning')).level).toBe(5);
  });

  it('antecknar ingen nivå när ingen är känd', async () => {
    keys.save('sk-ant-test');
    answerWith(GOOD);

    expect((await writer.write('bakning')).level).toBeUndefined();
  });

  it('skickar med hur övningen gått: svåra ord och tidsåtgång', async () => {
    keys.save('sk-ant-test');
    const pair = TestBed.inject(WordLibrary).words[0];
    const engine = TestBed.inject(TrainingEngine);
    const statement = { pair, direction: 'en' as const, asked: pair.en, shown: 'fel', truthy: false };
    engine.record(statement, 'affirm', 3);
    answerWith(GOOD);

    await writer.write('rymden');

    expect(sent[0][1]).toContain('Hur övningen gått:');
    expect(sent[0][1]).toContain(`${pair.en} → ${pair.sv}: 0 rätt av 1; senast: fel`);
  });

  it('nämner listorna som redan finns', async () => {
    keys.save('sk-ant-test');
    TestBed.inject(WordLibrary).add({ id: 'egen-stallet', name: 'På stallet', words: GOOD.words });
    answerWith(GOOD);

    await writer.write('djur');

    expect(sent[0][1]).toContain('På stallet');
  });

  it('sparar ingenting — listan ska ses innan den hamnar bland de andra', async () => {
    keys.save('sk-ant-test');
    answerWith(GOOD);
    const before = TestBed.inject(WordLibrary).blocks.length;

    await writer.write('rymden');

    expect(TestBed.inject(WordLibrary).blocks).toHaveLength(before);
  });

  it('säger ifrån när svaret inte går att göra en lista av', async () => {
    keys.save('sk-ant-test');

    for (const junk of [null, 'text', { name: 'Tom', words: [] }]) {
      answerWith(junk);
      await expect(writer.write('rymden')).rejects.toBeInstanceOf(ListWriteError);
      await expect(writer.write('rymden')).rejects.toMatchObject({ reason: 'unreadable' });
    }
  });
});
