import { describe, expect, it } from 'vitest';
import {
  BASELINE_WINDOW,
  DEFAULT_BASELINE,
  MAX_SAMPLES,
  MIN_BASELINE_SAMPLES,
  SCHEMA_VERSION,
  baselineFor,
  emptyDocument,
  hasContent,
  normalize,
} from './progress-store';
import { emptyRecord, recordAttempt, emptyStat } from '../training/word-state';

describe('emptyDocument', () => {
  it('bär sitt versionsnummer, så nästa ändring har någonstans att hänga', () => {
    expect(emptyDocument().schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('är tomt, och vet om det', () => {
    expect(hasContent(emptyDocument())).toBe(false);
  });
});

describe('normalize', () => {
  it('ger ett tomt dokument för skräp i stället för att krascha', () => {
    for (const junk of [null, undefined, 42, 'nej', [], { words: 'inte ett objekt' }]) {
      expect(normalize(junk)).toEqual(emptyDocument());
    }
  });

  it('behåller det som går att känna igen och kastar resten', () => {
    const document = normalize({
      schemaVersion: 1,
      words: {
        'en:dog=hund': {
          match: { attempts: 3, correct: 2, streak: 0, paces: [1.1], recent: [true, false], lastSeen: 7 },
          trueFalse: 'trasig',
        },
        'en:cat=katt': 'inte ett kort',
      },
      baselines: { match: [2, 3], trueFalse: ['nej', 1.2], recall: null, written: [] },
      activeBlockId: 'seed-1',
      framtidaFält: { som: 'inte finns än' },
    });

    expect(document.words['en:dog=hund'].match.attempts).toBe(3);
    expect(document.words['en:dog=hund'].match.paces).toEqual([1.1]);
    // Ett trasigt steg blir tomt; resten av ordet överlever.
    expect(document.words['en:dog=hund'].trueFalse).toEqual(emptyStat());
    expect(document.words['en:cat=katt']).toEqual(emptyRecord());
    expect(document.baselines.match).toEqual([2, 3]);
    expect(document.baselines.trueFalse).toEqual([1.2]);
    expect(document.baselines.recall).toEqual([]);
    expect(document.activeBlockId).toBe('seed-1');
  });

  it('klipper fönster som vuxit sig för långa', () => {
    const document = normalize({
      words: {
        'en:dog=hund': {
          match: { attempts: 99, correct: 99, streak: 9, paces: Array(20).fill(1), recent: Array(20).fill(true), lastSeen: 1 },
        },
      },
      baselines: { match: Array(40).fill(2) },
    });
    expect(document.words['en:dog=hund'].match.paces).toHaveLength(MAX_SAMPLES);
    expect(document.words['en:dog=hund'].match.recent).toHaveLength(MAX_SAMPLES);
    expect(document.baselines.match).toHaveLength(BASELINE_WINDOW);
  });

  it('bär ingen ingång — ett val som gäller ett pass ska inte bli en gammal sanning', () => {
    // Ingången väljs på startsidan och gäller det passet. Skrevs den ned skulle
    // nästa vecka öppna i förra veckans ingång, och då vore den ett läge.
    const document = normalize({ ...emptyDocument(), entryStep: 'written' });
    expect(document).toEqual(emptyDocument());
    expect('entryStep' in document).toBe(false);
  });

  it('avvisar negativa räknare — ett redigerat dokument ska inte ge negativa svar', () => {
    const document = normalize({
      words: { 'en:dog=hund': { match: { attempts: -5, correct: -1, streak: -3 } } },
    });
    expect(document.words['en:dog=hund'].match.attempts).toBe(0);
    expect(document.words['en:dog=hund'].match.correct).toBe(0);
  });
});

describe('baselineFor', () => {
  it('använder stegets grundvärde tills det finns mätningar nog', () => {
    const document = emptyDocument();
    expect(baselineFor(document, 'written')).toBe(DEFAULT_BASELINE.written);

    document.baselines.written = Array(MIN_BASELINE_SAMPLES - 1).fill(2);
    expect(baselineFor(document, 'written')).toBe(DEFAULT_BASELINE.written);
  });

  it('tar medianen, så att ett tappat kort inte flyttar tröskeln', () => {
    const document = emptyDocument();
    document.baselines.recall = [2, 2.2, 2.1, 30];
    expect(baselineFor(document, 'recall')).toBeLessThan(3);
  });

  it('håller stegen isär — en kvot betyder samma sak i alla fyra', () => {
    const document = emptyDocument();
    expect(DEFAULT_BASELINE.trueFalse).toBeLessThan(DEFAULT_BASELINE.written);
    document.baselines.trueFalse = [1.5, 1.4, 1.6];
    expect(baselineFor(document, 'trueFalse')).not.toBe(baselineFor(document, 'written'));
  });
});

describe('hasContent', () => {
  it('ser ett ord som faktiskt övats', () => {
    const document = emptyDocument();
    const record = emptyRecord();
    record.match = recordAttempt(record.match, { correct: true, pace: 1, at: 1 });
    document.words['en:dog=hund'] = record;
    expect(hasContent(document)).toBe(true);
  });

  it('ser en mätt baslinje även utan ord', () => {
    const document = emptyDocument();
    document.baselines.match = [2];
    expect(hasContent(document)).toBe(true);
  });
});
