import { beforeEach, describe, expect, it } from 'vitest';
import { MATCH_ROUND, SESSION_LENGTH, Task, TrainingSession } from './session';
import { TrainingEngine } from './training-engine';
import { DEFAULT_BASELINE, ProgressDocument, ProgressRepository, emptyDocument } from '../services/progress-store';
import { WordBlock, WordPair, wordKey } from '../words/word-catalog';
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

  it('börjar i match, eftersom inget ord kan något än', () => {
    const session = new TrainingSession(engine, BLOCK);
    const task = session.nextTask()!;
    expect(task.kind).toBe('match');
    expect(pairsIn(task)).toHaveLength(MATCH_ROUND);
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
