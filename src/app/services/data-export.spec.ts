import { describe, expect, it } from 'vitest';
import { API_KEY_KEY, ApiKeyStore } from './api-key-store';
import { EXPORT_VERSION, ExportSources, buildExport, exportText } from './data-export';
import { emptyDocument } from './progress-store';
import { emptyRecord, emptyStat, recordAttempt } from '../training/word-state';
import { WordBlock } from '../words/word-catalog';

const BLOCKS: WordBlock[] = [
  { id: 'djur', name: 'Djur', words: [{ en: 'dog', sv: 'hund', distractorsSv: ['räv'] }] },
  { id: 'egen-rymden', name: 'Rymden', words: [{ en: 'moon', sv: 'måne' }] },
];

function sources(overrides: Partial<ExportSources> = {}): ExportSources {
  return {
    document: emptyDocument(),
    profile: null,
    blocks: BLOCKS,
    isOwn: (id) => id.startsWith('egen-'),
    now: Date.UTC(2026, 10, 27, 8, 30),
    ...overrides,
  };
}

describe('buildExport', () => {
  it('säger vad den är och när den gjordes', () => {
    const data = buildExport(sources());

    expect(data.app).toBe('svengelska');
    expect(data.exportVersion).toBe(EXPORT_VERSION);
    expect(data.exportedAt).toBe('2026-11-27T08:30:00.000Z');
    expect(data.exportedAtMs).toBe(Date.UTC(2026, 10, 27, 8, 30));
  });

  it('bär bara håll som faktiskt mätts', () => {
    const document = emptyDocument();
    const seen = emptyRecord();
    seen.trueFalse = recordAttempt(emptyStat(), { outcome: 'hit', pace: 0.8, at: 1000 });
    document.words['en:dog=hund'] = seen;
    document.words['sv:hund=dog'] = emptyRecord();

    const data = buildExport(sources({ document }));

    expect(Object.keys(data.words)).toEqual(['en:dog=hund']);
    expect(data.words['en:dog=hund']).toMatchObject({ attempts: 1, recent: ['hit'], box: 1 });
  });

  it('bär golven, rekordet, inställningarna och profilen', () => {
    const document = emptyDocument();
    document.baselines['sv:false'] = [2.1, 2.4];
    document.bestStreak = 9;
    document.settings = { newWordsPerDay: 7 };
    const profile = { interests: ['djur'], age: 'child' as const, voluntary: true, level: 2 };

    const data = buildExport(sources({ document, profile }));

    expect(data.baselines['sv:false']).toEqual([2.1, 2.4]);
    expect(data.bestStreak).toBe(9);
    expect(data.settings.newWordsPerDay).toBe(7);
    expect(data.profile).toEqual(profile);
  });

  it('bär listorna med sina felsvar, och säger vilka appen skrev', () => {
    const data = buildExport(sources());

    expect(data.lists.map((list) => [list.id, list.own])).toEqual([
      ['djur', false],
      ['egen-rymden', true],
    ]);
    expect(data.lists[0].words[0].distractorsSv).toEqual(['räv']);
  });
});

describe('exportText', () => {
  it('är JSON som går att läsa tillbaka', () => {
    expect(JSON.parse(exportText(sources())).app).toBe('svengelska');
  });

  it('är tät: texten ska klistras in för hand', () => {
    expect(exportText(sources())).not.toMatch(/\n| {2}/);
  });

  // Det enda i appen som är en hemlighet. Exporten byggs ur framstegen,
  // profilen och listorna, och nyckeln har ingen väg in i någon av dem.
  it('innehåller aldrig nyckeln', () => {
    localStorage.clear();
    new ApiKeyStore().save('sk-ant-hemlig-1234');

    const text = exportText(sources());

    expect(text).not.toContain('sk-ant-hemlig-1234');
    expect(text).not.toContain(API_KEY_KEY);
    expect(text.toLowerCase()).not.toContain('apikey');
  });
});
