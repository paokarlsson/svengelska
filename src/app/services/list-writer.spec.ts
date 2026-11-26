import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ApiKeyStore } from './api-key-store';
import { ListWriteError } from './list-write-error';
import { ListWriter } from './list-writer';
import { WordLibrary } from '../words/word-library';

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
