import { describe, expect, it } from 'vitest';
import {
  BASELINE_WINDOW,
  CHANNELS,
  DEFAULT_BASELINE,
  DEFAULT_NEW_PER_DAY,
  MAX_NEW_PER_DAY,
  MAX_SAMPLES,
  MIN_BASELINE_SAMPLES,
  SCHEMA_VERSION,
  baselineFor,
  channelFor,
  emptyDocument,
  hasContent,
  normalize,
} from './progress-store';

describe('normalize', () => {
  it('ger ett tomt dokument för skräp', () => {
    for (const junk of [null, 42, 'nej', [], undefined]) {
      expect(normalize(junk)).toEqual(emptyDocument());
    }
  });

  it('behåller det som går att känna igen och släpper resten', () => {
    const document = normalize({
      words: {
        'en:dog=hund': {
          trueFalse: { attempts: 3, correct: 2, streak: 1, paces: [1, 2], recent: ['hit'], box: 2 },
          skräp: 17,
        },
      },
      baselines: { 'en:true': [1.2, 1.4], strunt: [9] },
      activeBlockId: 'v1',
    });

    const stat = document.words['en:dog=hund'].trueFalse;
    expect(stat.attempts).toBe(3);
    expect(stat.box).toBe(2);
    expect(stat.recent).toEqual(['hit']);
    expect(document.baselines['en:true']).toEqual([1.2, 1.4]);
    expect(document.activeBlockId).toBe('v1');
  });

  it('klipper fönstren till sin längd', () => {
    const document = normalize({
      words: {
        'en:dog=hund': {
          trueFalse: {
            paces: Array(MAX_SAMPLES + 4).fill(1),
            recent: Array(MAX_SAMPLES + 4).fill('hit'),
          },
        },
      },
      baselines: { 'en:true': Array(BASELINE_WINDOW + 5).fill(2) },
    });
    expect(document.words['en:dog=hund'].trueFalse.paces).toHaveLength(MAX_SAMPLES);
    expect(document.words['en:dog=hund'].trueFalse.recent).toHaveLength(MAX_SAMPLES);
    expect(document.baselines['en:true']).toHaveLength(BASELINE_WINDOW);
  });

  it('vägrar negativa räknare', () => {
    const document = normalize({
      words: { 'en:dog=hund': { trueFalse: { attempts: -3, box: -1 } } },
    });
    expect(document.words['en:dog=hund'].trueFalse.attempts).toBe(0);
    expect(document.words['en:dog=hund'].trueFalse.box).toBe(0);
  });
});

/**
 * Första gången `schemaVersion` gör nytta. Ett dokument skrivet av version 1
 * ska gå att öva vidare på — inte för att formen är helig, utan för att ett
 * barn som redan lagt tjugo varv inte ska förlora dem för att appen bytte form.
 */
describe('migreringen från version 1', () => {
  const v1 = {
    schemaVersion: 1,
    words: {
      'en:dog=hund': {
        trueFalse: {
          attempts: 5,
          correct: 4,
          streak: 2,
          paces: [1, 1.2],
          recent: [true, true, false, true, true],
          lastSeen: 1000,
        },
      },
    },
    baselines: { match: [3, 3.1], trueFalse: [1.5, 1.6, 1.7], recall: [], written: [6] },
    activeBlockId: 'v3-djur',
  };

  it('översätter utfallen utan att hitta på', () => {
    // Ingenting lagrat före grenen kan vara en lucka — gesten fanns inte — och
    // ingenting kan vara segt, eftersom kanalgolven inte heller fanns.
    const stat = normalize(v1).words['en:dog=hund'].trueFalse;
    expect(stat.recent).toEqual(['hit', 'hit', 'miss', 'hit', 'hit']);
  });

  it('sår alla fyra kanalerna ur det gamla svepfönstret', () => {
    // Det är spelarens egen tumme, mätt på samma gest fast utan uppdelning.
    // Bättre än att börja från grundvärdena, och kalibreringen skriver ändå
    // över det inom ett varv.
    const document = normalize(v1);
    for (const channel of CHANNELS) {
      expect(document.baselines[channel]).toEqual([1.5, 1.6, 1.7]);
    }
  });

  it('ger ett gammalt ord ingen låda och ingen första gång', () => {
    const stat = normalize(v1).words['en:dog=hund'].trueFalse;
    expect(stat.box).toBe(0);
    expect(stat.firstSeen).toBeNull();
  });

  it('behåller listan som övades och sätter inställningarna till standard', () => {
    const document = normalize(v1);
    expect(document.activeBlockId).toBe('v3-djur');
    expect(document.settings.newWordsPerDay).toBe(DEFAULT_NEW_PER_DAY);
    expect(document.schemaVersion).toBe(SCHEMA_VERSION);
  });
});

describe('inställningarna', () => {
  it('står på standard när ingen rört dem', () => {
    expect(emptyDocument().settings.newWordsPerDay).toBe(DEFAULT_NEW_PER_DAY);
  });

  it('klampar ett redigerat dokument i stället för att tro på det', () => {
    expect(normalize({ settings: { newWordsPerDay: -4 } }).settings.newWordsPerDay).toBe(0);
    expect(normalize({ settings: { newWordsPerDay: 900 } }).settings.newWordsPerDay).toBe(
      MAX_NEW_PER_DAY,
    );
    expect(normalize({ settings: 'nej' }).settings.newWordsPerDay).toBe(DEFAULT_NEW_PER_DAY);
  });
});

describe('channelFor', () => {
  it('skiljer riktning och sanningsvärde åt', () => {
    expect(channelFor('en', true)).toBe('en:true');
    expect(channelFor('sv', false)).toBe('sv:false');
    expect(new Set(CHANNELS).size).toBe(4);
  });
});

describe('baselineFor', () => {
  it('använder grundvärdet innan det finns mätningar nog', () => {
    const document = emptyDocument();
    expect(baselineFor(document, 'sv:false')).toBe(DEFAULT_BASELINE['sv:false']);

    document.baselines['sv:false'] = Array(MIN_BASELINE_SAMPLES - 1).fill(1);
    expect(baselineFor(document, 'sv:false')).toBe(DEFAULT_BASELINE['sv:false']);
  });

  it('tar medianen när det finns nog, så ett tappat kort inte styr', () => {
    const document = emptyDocument();
    document.baselines['en:true'] = [1, 1.1, 1.2, 30];
    expect(baselineFor(document, 'en:true')).toBeCloseTo(1.15);
  });

  /**
   * Att förkasta antas ta längre tid än att bekräfta, och svenskan som fråga
   * längre tid än engelskan. Talen är gissningar — ordningen mellan dem är det
   * inte.
   */
  it('antar att förkasta tar längre tid än att bekräfta', () => {
    expect(DEFAULT_BASELINE['en:false']).toBeGreaterThan(DEFAULT_BASELINE['en:true']);
    expect(DEFAULT_BASELINE['sv:false']).toBeGreaterThan(DEFAULT_BASELINE['sv:true']);
  });

  it('antar att den svårare riktningen tar längre tid', () => {
    expect(DEFAULT_BASELINE['sv:true']).toBeGreaterThan(DEFAULT_BASELINE['en:true']);
  });
});

describe('hasContent', () => {
  it('ser skillnad på tomt och övat', () => {
    expect(hasContent(emptyDocument())).toBe(false);

    expect(hasContent(normalize({ words: { 'en:dog=hund': {} } }))).toBe(true);

    const withBaseline = emptyDocument();
    withBaseline.baselines['en:true'] = [1];
    expect(hasContent(withBaseline)).toBe(true);
  });
});
