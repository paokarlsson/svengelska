import { beforeEach, describe, expect, it } from 'vitest';
import { TrainingEngine } from './training-engine';
import {
  DEFAULT_BASELINE,
  MAX_NEW_PER_DAY,
  ProgressDocument,
  ProgressRepository,
  emptyDocument,
} from '../services/progress-store';
import { Statement, statementWith } from '../words/distractors';
import { Direction, WordPair } from '../words/word-catalog';
import { MASTERED_PACE, masteryIn } from './word-state';
import { DAY_MS } from './schedule';

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

const DOG: WordPair = { en: 'dog', sv: 'hund', distractorsEn: ['cat'], distractorsSv: ['katt'] };
const CAT: WordPair = { en: 'cat', sv: 'katt', distractorsEn: ['dog'], distractorsSv: ['hund'] };
const BLOCK = [DOG, CAT];

function say(pair: WordPair, direction: Direction, truthy: boolean): Statement {
  return statementWith(pair, direction, BLOCK, truthy, () => 0);
}

describe('TrainingEngine', () => {
  let engine: TrainingEngine;
  let repository: FakeRepository;

  beforeEach(async () => {
    engine = new TrainingEngine();
    repository = new FakeRepository();
    engine.useRepository(repository);
    await engine.hydrate();
  });

  it('börjar med ett outforskat ord åt båda hållen', () => {
    for (const direction of ['en', 'sv'] as const) {
      expect(engine.stateFor({ pair: DOG, direction })).toBe('UNSEEN');
    }
    expect(engine.hasPractice).toBe(false);
  });

  /**
   * Riktningarna är två färdigheter och ska inte kunna smitta varandra. Ett
   * gemensamt mått hade gjort framstegen på det lätta hållet till en lögn om
   * det svåra.
   */
  it('håller de två hållen isär', async () => {
    engine.record(say(DOG, 'en', true), 'affirm', 1);
    await engine.flush();

    expect(repository.saved!.words['en:dog=hund'].trueFalse.attempts).toBe(1);
    expect(repository.saved!.words['sv:hund=dog']).toBeUndefined();
    expect(engine.stateFor({ pair: DOG, direction: 'sv' })).toBe('UNSEEN');
  });

  it('lagrar farten som kvot mot kanalens golv, aldrig som sekunder', async () => {
    const seconds = DEFAULT_BASELINE['en:true'] / 2;
    engine.record(say(DOG, 'en', true), 'affirm', seconds);
    await engine.flush();

    const stat = repository.saved!.words['en:dog=hund'].trueFalse;
    expect(stat.paces).toEqual([0.5]);
    expect(stat.paces[0]).not.toBe(seconds);
  });

  /**
   * Hela skälet till att kanalerna finns: att förkasta tar längre tid än att
   * bekräfta även för den som kan ordet. Mäts båda mot samma snitt får varje
   * falskt påstående en straffavgift som inte har med kunnandet att göra.
   */
  it('mäter ett falskt påstående mot sitt eget golv', async () => {
    engine.record(say(DOG, 'en', true), 'affirm', DEFAULT_BASELINE['en:true']);
    engine.record(say(CAT, 'en', false), 'deny', DEFAULT_BASELINE['en:false']);
    await engine.flush();

    // Samma ansträngning i sin egen kanal ger samma kvot, fast sekunderna skiljer.
    expect(repository.saved!.words['en:dog=hund'].trueFalse.paces).toEqual([1]);
    expect(repository.saved!.words['en:cat=katt'].trueFalse.paces).toEqual([1]);
    expect(DEFAULT_BASELINE['en:false']).not.toBe(DEFAULT_BASELINE['en:true']);
  });

  it('dömer ett svep mot ett falskt påstående', () => {
    expect(engine.record(say(DOG, 'en', false), 'affirm', 1)).toBe('miss');
    expect(engine.record(say(DOG, 'en', false), 'deny', 1)).toBe('hit');
  });

  it('skiljer ett segt rätt från ett rätt i tempo', () => {
    const quick = DEFAULT_BASELINE['en:true'];
    const slow = DEFAULT_BASELINE['en:true'] * (MASTERED_PACE + 0.5);
    expect(engine.record(say(DOG, 'en', true), 'affirm', quick)).toBe('hit');
    expect(engine.record(say(DOG, 'en', true), 'affirm', slow)).toBe('slow');
  });

  it('antar inte att ett otajmat rätt var segt', () => {
    // Tvivlet tillfaller den som svarade.
    expect(engine.record(say(DOG, 'en', true), 'affirm', null)).toBe('hit');
  });

  /** «Ner bär ingen fart»: tiden mäter ärlighet, inte framplockning. */
  it('lämnar inget fartspår efter ett «vet ej»', async () => {
    engine.record(say(DOG, 'en', true), 'unsure', 1.0);
    await engine.flush();

    const stat = repository.saved!.words['en:dog=hund'].trueFalse;
    expect(stat.paces).toEqual([]);
    expect(stat.recent).toEqual(['unsure']);
    // Svaret räknas ändå — det var ett svar.
    expect(stat.attempts).toBe(1);
  });

  it('låter bara kalibreringen mata golvet', async () => {
    engine.record(say(DOG, 'en', true), 'affirm', 1.1);
    await engine.flush();
    expect(repository.saved!.baselines['en:true']).toEqual([]);

    engine.calibrate('en:true', 1.3);
    await engine.flush();
    expect(repository.saved!.baselines['en:true']).toEqual([1.3]);
  });

  it('låter ett tappat kort varken bli en mätning eller ett golv', async () => {
    engine.record(say(DOG, 'en', true), 'affirm', 300);
    engine.calibrate('en:true', 300);
    await engine.flush();

    expect(repository.saved!.baselines['en:true']).toEqual([]);
    expect(repository.saved!.words['en:dog=hund'].trueFalse.paces).toEqual([]);
    expect(repository.saved!.words['en:dog=hund'].trueFalse.attempts).toBe(1);
  });

  it('flyttar ordet uppåt i planen på rätt i tempo', () => {
    const word = { pair: DOG, direction: 'en' as const };
    expect(engine.statFor(word).box).toBe(0);
    engine.record(say(DOG, 'en', true), 'affirm', DEFAULT_BASELINE['en:true']);
    expect(engine.statFor(word).box).toBe(1);
  });

  it('räknar ett ord som klart först när båda hållen sitter', () => {
    for (let i = 0; i < 5; i++) {
      engine.record(say(DOG, 'en', true), 'affirm', DEFAULT_BASELINE['en:true']);
    }
    expect(masteryIn(engine.statFor({ pair: DOG, direction: 'en' }))).toBe('mastered');
    expect(engine.masteredCount(BLOCK)).toBe(0);

    for (let i = 0; i < 5; i++) {
      engine.record(say(DOG, 'sv', true), 'affirm', DEFAULT_BASELINE['sv:true']);
    }
    expect(engine.masteredCount(BLOCK)).toBe(1);
  });

  describe('dagsbudgeten', () => {
    it('börjar på standard och går att ställa om', () => {
      const before = engine.settings.newWordsPerDay;
      engine.setNewWordsPerDay(3);
      expect(engine.settings.newWordsPerDay).toBe(3);
      expect(before).not.toBe(3);
    });

    it('klampar i stället för att tro på vad som helst', () => {
      engine.setNewWordsPerDay(-9);
      expect(engine.settings.newWordsPerDay).toBe(0);
      engine.setNewWordsPerDay(1000);
      expect(engine.settings.newWordsPerDay).toBe(MAX_NEW_PER_DAY);
      engine.setNewWordsPerDay(Number.NaN);
      expect(engine.settings.newWordsPerDay).toBe(0);
    });

    /**
     * Räknat i ord och inte i kort: en glosa som introducerades åt båda hållen i
     * samma varv är ett nytt ord och inte två.
     */
    it('räknar ett ord som introducerats åt båda hållen en gång', () => {
      engine.record(say(DOG, 'en', true), 'affirm', 1);
      engine.record(say(DOG, 'sv', true), 'affirm', 1);
      expect(engine.newWordsToday(BLOCK)).toBe(1);
    });

    it('räknar bara dagens ord', () => {
      engine.record(say(DOG, 'en', true), 'affirm', 1);
      expect(engine.newWordsToday(BLOCK, Date.now() + 2 * DAY_MS)).toBe(0);
    });

    it('drar det som tagits från budgeten, men aldrig under noll', () => {
      engine.setNewWordsPerDay(1);
      expect(engine.newWordsLeft(BLOCK)).toBe(1);
      engine.record(say(DOG, 'en', true), 'affirm', 1);
      engine.record(say(CAT, 'en', true), 'affirm', 1);
      expect(engine.newWordsLeft(BLOCK)).toBe(0);
    });
  });

  it('glömmer allt vid nollställning, i minnet och i lagret', async () => {
    engine.record(say(DOG, 'en', true), 'affirm', 2);
    await engine.reset();
    expect(repository.cleared).toBe(true);
    expect(engine.stateFor({ pair: DOG, direction: 'en' })).toBe('UNSEEN');
    expect(engine.hasPractice).toBe(false);
  });

  it('minns vilken lista nya ord hämtas ur', async () => {
    engine.setActiveBlock('seed-1');
    await engine.flush();
    expect(repository.saved!.activeBlockId).toBe('seed-1');
  });
});
