import { beforeEach, describe, expect, it } from 'vitest';
import { Task, TrainingSession } from './session';
import { CALIBRATION_CARDS } from './calibration';
import { ROUND_WORDS } from './round';
import { TrainingEngine } from './training-engine';
import { Response } from './word-state';
import { ProgressDocument, ProgressRepository, emptyDocument } from '../services/progress-store';
import { WordPair, pairKey } from '../words/word-catalog';

class MemoryRepository implements ProgressRepository {
  private document = emptyDocument();
  async load(): Promise<ProgressDocument> {
    return this.document;
  }
  async save(document: ProgressDocument): Promise<void> {
    this.document = document;
  }
  async clear(): Promise<void> {
    this.document = emptyDocument();
  }
}

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

function words(count: number): WordPair[] {
  return Array.from({ length: count }, (_, i) => ({
    en: `w${i}`,
    sv: `o${i}`,
    distractorsEn: [`w${(i + 1) % count}`],
    distractorsSv: [`o${(i + 1) % count}`],
  }));
}

const CATALOG = words(30);

/** Spelar ett helt varv med samma svar på varje kort. Returnerar uppgifterna. */
function play(session: TrainingSession, response: Response | ((task: Task) => Response)): Task[] {
  const seen: Task[] = [];
  for (let guard = 0; guard < 200; guard++) {
    const task = session.nextTask();
    if (task === null) {
      return seen;
    }
    seen.push(task);
    session.record(task, typeof response === 'function' ? response(task) : response, 1);
  }
  throw new Error('varvet tog aldrig slut');
}

describe('TrainingSession', () => {
  let engine: TrainingEngine;

  beforeEach(async () => {
    engine = new TrainingEngine();
    engine.useRepository(new MemoryRepository());
    await engine.hydrate();
    engine.setNewWordsPerDay(ROUND_WORDS);
  });

  function round(seed = 1): TrainingSession {
    return new TrainingSession(engine, CATALOG, CATALOG, seeded(seed));
  }

  it('inleder varvet med kalibreringen och sedan tjugo kort', () => {
    const session = round();
    expect(session.target).toBe(ROUND_WORDS * 2);

    const tasks = play(session, 'affirm');
    const probes = tasks.filter((task) => task.calibration !== null);
    expect(probes).toHaveLength(CALIBRATION_CARDS);
    // Kalibreringen ligger först, och inte utspridd i varvet.
    expect(tasks.slice(0, CALIBRATION_CARDS).every((task) => task.calibration !== null)).toBe(true);
  });

  it('visar varje ord åt båda hållen', () => {
    const tasks = play(round(), 'affirm').filter((task) => task.calibration === null);
    const byWord = new Map<string, Set<string>>();
    for (const task of tasks) {
      const key = pairKey(task.statement.pair);
      byWord.set(key, (byWord.get(key) ?? new Set()).add(task.statement.direction));
    }
    expect(byWord.size).toBe(ROUND_WORDS);
    for (const directions of byWord.values()) {
      expect([...directions].sort()).toEqual(['en', 'sv']);
    }
  });

  it('lägger aldrig samma ords två håll intill varandra', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const scored = play(round(seed), 'affirm').filter((task) => task.calibration === null);
      for (let i = 1; i < scored.length; i++) {
        expect(pairKey(scored[i].statement.pair)).not.toBe(pairKey(scored[i - 1].statement.pair));
      }
    }
  });

  /**
   * Kalibreringen är ett instrument och ingen övning. Räknades provet skulle
   * mätstickan ligga i samma hög som det den mäter.
   */
  it('låter kalibreringen inte bli en dom eller en låda', () => {
    const session = round();
    const probe = session.nextTask()!;
    expect(probe.calibration).not.toBeNull();

    session.record(probe, 'affirm', 1.2);
    const word = { pair: probe.statement.pair, direction: probe.statement.direction };
    expect(engine.statFor(word).attempts).toBe(0);
    expect(session.answered).toBe(0);
  });

  it('kastar ett kalibreringsprov som mötts med «vet ej»', () => {
    // Ett lätt ord som inte var lätt mäter fel sak med rätt precision.
    const session = round();
    const first = session.nextTask()!;
    session.record(first, 'unsure', 1.2);

    const replacement = session.nextTask()!;
    expect(replacement.calibration).toBe(first.calibration);
    expect(pairKey(replacement.statement.pair)).not.toBe(pairKey(first.statement.pair));
  });

  it('kommer förbi kalibreringen även för den som svepar «vet ej» på allt', () => {
    // Ett varv som aldrig börjar är sämre än ett varv med grundvärden som golv.
    const tasks = play(round(), 'unsure');
    expect(tasks.filter((task) => task.calibration === null).length).toBeGreaterThan(0);
  });

  /**
   * Varvet ska täcka varje ord åt båda hållen minst en gång. Ett varv som
   * kortas av sina egna misstag täcker minst där det behövs mest.
   */
  it('tar tillbaka ett missat kort efter de tjugo, inte i stället för ett', () => {
    const session = round();
    let firstScored: Task | null = null;
    const tasks = play(session, (task) => {
      if (task.calibration !== null) {
        return 'affirm';
      }
      if (firstScored === null) {
        firstScored = task;
        // Ett svar som garanterat är fel, oavsett vad kortet påstod.
        return task.statement.truthy ? 'deny' : 'affirm';
      }
      return task.statement.truthy ? 'affirm' : 'deny';
    });

    const scored = tasks.filter((task) => task.calibration === null);
    expect(scored).toHaveLength(ROUND_WORDS * 2 + 1);
    expect(pairKey(scored.at(-1)!.statement.pair)).toBe(pairKey(firstScored!.statement.pair));
  });

  it('tar tillbaka ett «vet ej» på samma sätt som ett fel', () => {
    const session = round();
    let once = false;
    const tasks = play(session, (task) => {
      if (task.calibration !== null) {
        return 'affirm';
      }
      if (!once) {
        once = true;
        return 'unsure';
      }
      return task.statement.truthy ? 'affirm' : 'deny';
    });
    expect(tasks.filter((task) => task.calibration === null)).toHaveLength(ROUND_WORDS * 2 + 1);
  });

  it('räknar de fyra utfallen var för sig', () => {
    const session = round();
    play(session, (task) =>
      task.calibration !== null ? 'affirm' : task.statement.truthy ? 'affirm' : 'unsure',
    );
    const summary = session.summary();
    expect(summary.answered).toBe(summary.hits + summary.slow + summary.misses + summary.unsure);
    expect(summary.unsure).toBeGreaterThan(0);
    expect(summary.words).toBe(ROUND_WORDS);
  });

  it('säger vilka håll som flyttade fram', () => {
    const session = round();
    play(session, (task) =>
      task.calibration !== null ? 'affirm' : task.statement.truthy ? 'affirm' : 'deny',
    );
    const summary = session.summary();
    expect(summary.advanced.length).toBeGreaterThan(0);
    expect(summary.misses).toBe(0);
  });

  it('blir hellre kort än fyller ut: tom budget och inget moget ger inget varv', () => {
    engine.setNewWordsPerDay(0);
    const session = round();
    expect(session.target).toBe(0);
    expect(session.nextTask()).toBeNull();
    expect(session.done).toBe(true);
  });

  it('säger ifrån när varvet inte räckte till tio ord', () => {
    engine.setNewWordsPerDay(3);
    const session = round();
    expect(session.words).toBe(3);
    expect(session.short).toBe(true);
  });
});
