import { describe, expect, it } from 'vitest';
import { ABOUT, IntroCard, IntroRun, LADDER, MAX_CARDS, wordsOnStep } from './intro-run';
import { TOP_LEVEL } from './profile';
import { Response } from '../training/word-state';

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

/** Spelar rundan till slut. Returnerar korten som visades. */
function play(run: IntroRun, respond: (card: IntroCard) => Response): IntroCard[] {
  const seen: IntroCard[] = [];
  for (let guard = 0; guard < 200; guard++) {
    const card = run.next();
    if (card === null) {
      return seen;
    }
    seen.push(card);
    run.answer(respond(card));
  }
  throw new Error('rundan tog aldrig slut');
}

/** Rätt svar på ett prov; `yes` på allt annat. */
function knowing(upTo: number, yes: Response = 'affirm') {
  return (card: IntroCard): Response => {
    if (card.kind !== 'probe') {
      return yes;
    }
    if (card.level >= upTo) {
      return 'unsure';
    }
    return card.statement.truthy ? 'affirm' : 'deny';
  };
}

describe('IntroRun', () => {
  it('börjar med frågor om en själv, inte med ett prov', () => {
    const seen = play(new IntroRun(seeded(1)), knowing(TOP_LEVEL));
    const firstProbe = seen.findIndex((card) => card.kind === 'probe');

    expect(seen[0].kind).toBe('ask');
    expect(firstProbe).toBeGreaterThanOrEqual(ABOUT.length);
    expect(seen.slice(firstProbe).every((card) => card.kind === 'probe')).toBe(true);
  });

  it('tar aldrig fler kort än mätaren räknar med', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const run = new IntroRun(seeded(seed));
      expect(play(run, knowing(TOP_LEVEL)).length).toBeLessThanOrEqual(MAX_CARDS);
      expect(run.progress).toBe(1);
    }
  });

  it('samlar det man sa ja till, och bara det', () => {
    const run = new IntroRun(seeded(1));
    play(run, (card) => (card.kind === 'ask' && card.id === 'animals' ? 'affirm' : 'deny'));
    expect(run.profile().interests).toEqual(['djur']);
  });

  it('räknar inte ett överhoppat kort som ett ja', () => {
    const run = new IntroRun(seeded(1));
    play(run, () => 'unsure');
    expect(run.profile().interests).toEqual([]);
  });

  describe('åldern', () => {
    const ageFor = (answers: Record<string, Response>) => {
      const run = new IntroRun(seeded(1));
      const seen = play(run, (card) =>
        card.kind === 'ask' ? (answers[card.id] ?? 'deny') : 'unsure',
      );
      return { age: run.profile().age, ids: seen.map((card) => (card.kind === 'ask' ? card.id : '')) };
    };

    it('är ett spann, och två svep räcker', () => {
      expect(ageFor({ 'age-13': 'deny' }).age).toBe('child');
      expect(ageFor({ 'age-13': 'affirm', 'age-18': 'deny' }).age).toBe('teen');
      expect(ageFor({ 'age-13': 'affirm', 'age-18': 'affirm' }).age).toBe('adult');
    });

    it('frågar inte en tolvåring om hen fyllt arton', () => {
      expect(ageFor({ 'age-13': 'deny' }).ids).not.toContain('age-18');
    });

    it('går att låta bli att säga', () => {
      const skipped = ageFor({ 'age-13': 'unsure' });
      expect(skipped.age).toBeNull();
      expect(skipped.ids).not.toContain('age-18');
      expect(ageFor({ 'age-13': 'affirm', 'age-18': 'unsure' }).age).toBeNull();
    });
  });

  it('minns om man övar för att man vill', () => {
    const answerWhy = (response: Response) => {
      const run = new IntroRun(seeded(1));
      play(run, (card) => (card.kind === 'ask' && card.id === 'why' ? response : 'unsure'));
      return run.profile().voluntary;
    };

    expect(answerWhy('affirm')).toBe(true);
    expect(answerWhy('deny')).toBe(false);
    expect(answerWhy('unsure')).toBeNull();
  });

  describe('trappan', () => {
    it('sätter nivån till antalet steg som höll', () => {
      for (let level = 0; level <= TOP_LEVEL; level++) {
        const run = new IntroRun(seeded(level + 1));
        play(run, knowing(level));
        expect(run.profile().level).toBe(level);
      }
    });

    // En nybörjare ska få två kort och inte tio.
    it('stannar vid första steget som inte höll', () => {
      const run = new IntroRun(seeded(1));
      const probes = play(run, knowing(1)).filter((card) => card.kind === 'probe');

      expect(probes).toHaveLength(4);
      expect(Math.max(...probes.map((card) => (card.kind === 'probe' ? card.level : 0)))).toBe(1);
    });

    // Ett sant/falskt-kort är ett myntkast. Den som sveper ja på allt ska inte
    // kunna svepa sig till en nivå.
    it('går inte att klättra i genom att svara samma sak på allt', () => {
      for (const always of ['affirm', 'deny', 'unsure'] as const) {
        const run = new IntroRun(seeded(1));
        play(run, () => always);
        expect(run.profile().level).toBe(0);
      }
    });

    it('räknar «vet ej» som att steget inte höll', () => {
      const run = new IntroRun(seeded(1));
      play(run, (card) => {
        if (card.kind !== 'probe') {
          return 'affirm';
        }
        return card.statement.truthy ? 'affirm' : 'unsure';
      });
      expect(run.profile().level).toBe(0);
    });

    it('har ett sant och ett falskt kort på varje steg', () => {
      for (const step of LADDER) {
        expect(step.filter((probe) => probe.shown === probe.truth)).toHaveLength(1);
      }
    });

    it('säger nivån är okänd innan den prövats', () => {
      expect(new IntroRun(seeded(1)).profile().level).toBeNull();
    });
  });

  it('har exempelord för varje steg, och inga för ett som inte finns', () => {
    expect(wordsOnStep(0)).toHaveLength(2);
    expect(wordsOnStep(LADDER.length)).toEqual([]);
  });
});
