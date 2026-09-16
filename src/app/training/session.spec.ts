import { beforeEach, describe, expect, it } from 'vitest';
import { MATCH_ROUND, SESSION_LENGTH, Task, TrainingSession } from './session';
import { TrainingEngine } from './training-engine';
import { DEFAULT_BASELINE, ProgressDocument, ProgressRepository, emptyDocument } from '../services/progress-store';
import { WordBlock, WordPair, wordKey } from '../words/word-catalog';
import { Random } from '../words/shuffle';
import { STEPS, Step } from './word-state';

/** Lagret som inte rör en webbläsare. */
class FakeRepository implements ProgressRepository {
  private document = emptyDocument();

  async load(): Promise<ProgressDocument> {
    return this.document;
  }

  async save(): Promise<void> {}

  async clear(): Promise<void> {
    this.document = emptyDocument();
  }
}

const WORDS: readonly WordPair[] = [
  { en: 'mother', sv: 'mamma', distractorsSv: ['pappa'] },
  { en: 'father', sv: 'pappa' },
  { en: 'sister', sv: 'syster' },
  { en: 'brother', sv: 'bror' },
  { en: 'aunt', sv: 'moster' },
  { en: 'uncle', sv: 'morbror' },
];

const BLOCK: WordBlock = { id: 'test', name: 'Test', words: WORDS };

/**
 * En slumpkälla som alltid drar det första alternativet.
 *
 * Där en fördelning ska prövas behövs en fröad följd (se `word-selector.spec`),
 * men här är frågan vilket *steg* ett bestämt ord visas i, och då är slumpen
 * bara brus: ett test som drar ett ord av sex och hoppas att det blir rätt är
 * nyckfullt av skäl som inte har med det testade att göra.
 */
const FIRST_CANDIDATE: Random = () => 0;

/** Orden en uppgift handlar om, oavsett vilken vy som skulle ritat den. */
function pairsIn(task: Task): readonly WordPair[] {
  switch (task.kind) {
    case 'match':
      return task.pairs;
    case 'trueFalse':
      return [task.statement.pair];
    default:
      return [task.pair];
  }
}

/** Steget en uppgift hör till. */
function stepIn(task: Task): Step {
  return task.kind === 'match' ? 'match' : task.kind === 'trueFalse' ? 'trueFalse' : task.kind;
}

describe('TrainingSession', () => {
  let engine: TrainingEngine;

  /** Nöter ett steg tills det sitter, utan att gå via en vy. */
  function master(pair: WordPair, step: Step): void {
    for (let i = 0; i < 5; i++) {
      engine.record(pair, step, true, DEFAULT_BASELINE[step]);
    }
  }

  function masterThrough(last: Step): void {
    for (const pair of WORDS) {
      for (const step of STEPS) {
        master(pair, step);
        if (step === last) {
          break;
        }
      }
    }
  }

  beforeEach(async () => {
    engine = new TrainingEngine();
    engine.useRepository(new FakeRepository());
    await engine.hydrate();
  });

  it('börjar i den ingång passet fick', () => {
    const session = new TrainingSession(engine, BLOCK, 'match');
    const task = session.nextTask()!;
    expect(task.kind).toBe('match');
    expect(pairsIn(task)).toHaveLength(MATCH_ROUND);
  });

  it('kliver in där användaren valde, hur orört blocket än är', () => {
    for (const entry of STEPS) {
      const session = new TrainingSession(engine, BLOCK, entry);
      expect(stepIn(session.nextTask()!)).toBe(entry);
    }
  });

  it('byter steg under passets gång utan att fråga någon', () => {
    masterThrough('recall');
    const session = new TrainingSession(engine, BLOCK);
    expect(session.nextTask()!.kind).toBe('written');
  });

  it('räknar svaren och slutar när passet är fullt', () => {
    const session = new TrainingSession(engine, BLOCK);
    for (let i = 0; i < SESSION_LENGTH; i++) {
      const task = session.nextTask()!;
      session.record(pairsIn(task)[0], stepIn(task), i % 2 === 0, 2);
    }
    expect(session.answered).toBe(SESSION_LENGTH);
    expect(session.correct).toBe(SESSION_LENGTH / 2);
    expect(session.done).toBe(true);
    expect(session.nextTask()).toBeNull();
  });

  it('låter ett missat ord komma tillbaka i samma pass', () => {
    masterThrough('recall');
    const session = new TrainingSession(engine, BLOCK);

    const missed = session.nextTask()!;
    const pair = pairsIn(missed)[0];
    session.record(pair, stepIn(missed), false, 4);

    let returned = false;
    for (let i = 0; i < 6 && !returned; i++) {
      const task = session.nextTask()!;
      returned = pairsIn(task).some((word) => wordKey(word) === wordKey(pair));
      session.record(pairsIn(task)[0], stepIn(task), true, 2);
    }
    expect(returned).toBe(true);
  });

  it('visar inte samma ord två gånger i rad', () => {
    masterThrough('recall');
    const session = new TrainingSession(engine, BLOCK);

    let previous = '';
    for (let i = 0; i < SESSION_LENGTH; i++) {
      const task = session.nextTask()!;
      const key = wordKey(pairsIn(task)[0]);
      expect(key).not.toBe(previous);
      previous = key;
      session.record(pairsIn(task)[0], stepIn(task), true, 2);
    }
  });

  it('vet när blocket är genomarbetat, och slutar då oavsett passets längd', () => {
    masterThrough('written');
    const session = new TrainingSession(engine, BLOCK);
    expect(session.blockComplete).toBe(true);
    expect(session.done).toBe(true);
    expect(session.nextTask()).toBeNull();
  });

  it('låter ingen ingång göra blocket omöjligt att slutföra', () => {
    // Vakten mot den tysta fällan: mäts aldrig ett överhoppat steg pekar
    // `currentStep()` på det för alltid, och blocket kan aldrig bli klart.
    for (const entry of STEPS) {
      engine = new TrainingEngine();
      engine.useRepository(new FakeRepository());
      let session = new TrainingSession(engine, BLOCK, entry);

      for (let pass = 0; pass < 40 && !session.blockComplete; pass++) {
        while (!session.done) {
          const task = session.nextTask()!;
          for (const pair of pairsIn(task)) {
            session.record(pair, stepIn(task), true, DEFAULT_BASELINE[stepIn(task)]);
          }
        }
        session = new TrainingSession(engine, BLOCK, entry);
      }
      expect(session.blockComplete).toBe(true);
    }
  });

  it('är ett golv och inget läge: ett ord som sitter puttas vidare uppåt', () => {
    // Ordet nötte klart återkalla i ett tidigare pass; resten av blocket är
    // orört. Golvet säger `recall`, mätningen säger att just det här ordet är
    // förbi det, och mätningen väger tyngre.
    //
    // Att det är ett *tidigare* pass är ingen bekvämlighet utan vad som gäller:
    // ett orört ord hinner aldrig förbi sin ingång inom ett pass. Se
    // «Uppflyttningen sker mellan pass» i docs/plan.md.
    master(WORDS[0], 'recall');
    const session = new TrainingSession(engine, BLOCK, 'recall', FIRST_CANDIDATE);

    const lifted = session.nextTask()!;
    expect(lifted.kind).toBe('written');
    expect(pairsIn(lifted)[0].en).toBe(WORDS[0].en);

    // Och golvet står kvar för de andra: det lyfter ett orört ord till
    // ingången, och sänker aldrig det som kommit längre.
    session.record(pairsIn(lifted)[0], stepIn(lifted), true, DEFAULT_BASELINE.written);
    expect(stepIn(session.nextTask()!)).toBe('recall');
  });

  it('…och nedåt: ett ord som kämpar får stöd under ingången', () => {
    const session = new TrainingSession(engine, BLOCK, 'recall');
    let supported = false;

    for (let i = 0; i < 60 && !supported; i++) {
      const task = session.nextTask()!;
      supported = STEPS.indexOf(stepIn(task)) < STEPS.indexOf('recall');
      session.record(pairsIn(task)[0], stepIn(task), false, 4);
    }
    expect(supported).toBe(true);
  });

  it('visar inte samma kort två gånger i rad, oavsett ingång', () => {
    for (const entry of STEPS) {
      engine = new TrainingEngine();
      engine.useRepository(new FakeRepository());
      const session = new TrainingSession(engine, BLOCK, entry);

      let previous = '';
      while (!session.done) {
        const task = session.nextTask()!;
        const answered = pairsIn(task);

        // En match-runda är fem par på skärmen samtidigt och har inget enskilt
        // ord att jämföra med det föregående — spärren gäller korten. Vad den
        // lovar om rundan är i stället att nästa kort inte upprepar något ur
        // den, och det är vad `previous` bär vidare.
        if (task.kind !== 'match') {
          expect(wordKey(answered[0])).not.toBe(previous);
        }

        // Hela rundan besvaras, för det är vad vyn gör: `match-view` skickar ett
        // svar per par. Svarade testet bara för det första paret såg dirigenten
        // aldrig de andra fyra, och spärren den bygger på `recent` vore mätt mot
        // något appen inte gör.
        for (const pair of answered) {
          session.record(pair, stepIn(task), true, 2);
        }
        previous = wordKey(answered[answered.length - 1]);
      }
    }
  });

  it('berättar vilka ord som tog ett steg', () => {
    const session = new TrainingSession(engine, BLOCK);
    const pair = WORDS[0];
    for (let i = 0; i < 5; i++) {
      session.record(pair, 'match', true, DEFAULT_BASELINE.match);
    }

    const summary = session.summary();
    expect(summary.answered).toBe(5);
    expect(summary.correct).toBe(5);
    expect(summary.advanced.map((word) => word.en)).toEqual([pair.en]);
    expect(summary.automatic).toBe(0);
  });
});
