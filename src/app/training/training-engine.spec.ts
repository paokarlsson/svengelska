import { beforeEach, describe, expect, it } from 'vitest';
import { TrainingEngine } from './training-engine';
import { DEFAULT_BASELINE, ProgressDocument, ProgressRepository, emptyDocument } from '../services/progress-store';
import { WordPair } from '../words/word-catalog';
import { masteryIn } from './word-state';

/** Lagret som inte rör en webbläsare. */
class FakeRepository implements ProgressRepository {
  saved: ProgressDocument | null = null;
  cleared = false;

  constructor(private document: ProgressDocument = emptyDocument()) {}

  async load(): Promise<ProgressDocument> {
    return this.document;
  }

  async save(document: ProgressDocument): Promise<void> {
    this.saved = JSON.parse(JSON.stringify(document)) as ProgressDocument;
  }

  async clear(): Promise<void> {
    this.cleared = true;
    this.document = emptyDocument();
  }
}

const DOG: WordPair = { en: 'dog', sv: 'hund' };
const CAT: WordPair = { en: 'cat', sv: 'katt' };

describe('TrainingEngine', () => {
  let engine: TrainingEngine;
  let repository: FakeRepository;

  beforeEach(async () => {
    engine = new TrainingEngine();
    repository = new FakeRepository();
    engine.useRepository(repository);
    await engine.hydrate();
  });

  it('börjar med ett outforskat block, inte ett svagt', () => {
    expect(engine.stateFor(DOG)).toBe('UNSEEN');
    expect(engine.stepFor(DOG)).toBe('match');
    expect(engine.hasPractice).toBe(false);
  });

  it('låter en ingång låsas upp av ett ord, inte av alla', () => {
    const block = [DOG, CAT];
    expect(engine.reached(block, 'written')).toBe(false);
    expect(engine.reached(block, 'match')).toBe(true);

    for (const step of ['match', 'trueFalse', 'recall'] as const) {
      for (let i = 0; i < 5; i++) {
        engine.record(DOG, step, true, DEFAULT_BASELINE[step]);
      }
    }

    expect(engine.stepFor(DOG)).toBe('written');
    expect(engine.stepFor(CAT)).toBe('match');
    expect(engine.reached(block, 'written')).toBe(true);
  });

  it('lagrar farten som kvot mot stegets baslinje, aldrig som sekunder', async () => {
    // Halva baslinjen in ska bli kvoten 0,5 ut, oavsett vilket steg det är.
    engine.record(DOG, 'written', true, DEFAULT_BASELINE.written / 2);
    await engine.flush();

    const stat = repository.saved!.words['en:dog=hund'].written;
    expect(stat.paces).toEqual([0.5]);
    expect(stat.paces[0]).not.toBe(DEFAULT_BASELINE.written / 2);
  });

  it('ger samma kvot för samma ansträngning i två olika steg', async () => {
    engine.record(DOG, 'trueFalse', true, DEFAULT_BASELINE.trueFalse);
    engine.record(CAT, 'written', true, DEFAULT_BASELINE.written);
    await engine.flush();

    expect(repository.saved!.words['en:dog=hund'].trueFalse.paces).toEqual([1]);
    expect(repository.saved!.words['en:cat=katt'].written.paces).toEqual([1]);
  });

  it('mäter baslinjen bara på rätta svar', async () => {
    engine.record(DOG, 'recall', false, 9);
    await engine.flush();
    expect(repository.saved!.baselines.recall).toEqual([]);

    engine.record(DOG, 'recall', true, 2.4);
    await engine.flush();
    expect(repository.saved!.baselines.recall).toEqual([2.4]);
  });

  it('låter ett tappat kort inte bli en mätning', async () => {
    engine.record(DOG, 'recall', true, 300);
    await engine.flush();
    expect(repository.saved!.baselines.recall).toEqual([]);
    expect(repository.saved!.words['en:dog=hund'].recall.paces).toEqual([]);
    // Svaret räknas ändå — det var rätt, det gick bara inte att tajma.
    expect(repository.saved!.words['en:dog=hund'].recall.attempts).toBe(1);
  });

  it('för ordet vidare först när steget under sitter', () => {
    for (let i = 0; i < 5; i++) {
      engine.record(DOG, 'match', true, DEFAULT_BASELINE.match);
    }
    expect(masteryIn(engine.recordFor(DOG).match)).toBe('mastered');
    expect(engine.stepFor(DOG)).toBe('trueFalse');
    expect(engine.stateFor(DOG)).toBe('TRUE_FALSE');
  });

  it('räknar behärskade ord per steg, inte som en samlad poäng', () => {
    for (let i = 0; i < 5; i++) {
      engine.record(DOG, 'match', true, DEFAULT_BASELINE.match);
      engine.record(CAT, 'match', false, DEFAULT_BASELINE.match);
    }
    expect(engine.masteredCount([DOG, CAT], 'match')).toBe(1);
    expect(engine.masteredCount([DOG, CAT], 'written')).toBe(0);
  });

  it('glömmer allt vid nollställning, i minnet och i lagret', async () => {
    engine.record(DOG, 'match', true, 2);
    await engine.reset();
    expect(repository.cleared).toBe(true);
    expect(engine.stateFor(DOG)).toBe('UNSEEN');
    expect(engine.hasPractice).toBe(false);
  });

  it('minns vilket block som övas', async () => {
    engine.setActiveBlock('seed-1');
    await engine.flush();
    expect(repository.saved!.activeBlockId).toBe('seed-1');
  });
});
