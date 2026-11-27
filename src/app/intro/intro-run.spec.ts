import { describe, expect, it } from 'vitest';
import { ABOUT, ASKS_BETWEEN, IntroCard, IntroRun, LADDER, OPENING, wordsOnStep } from './intro-run';
import { TRAITS } from './personality';
import { SEEDS } from './breaks';
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

/** Vuxen eller barn på ålderskorten, ja på allt annat, och rätt på trappan upp till `upTo`. */
function knowing(upTo: number, age: 'child' | 'teen' | 'adult' | 'unsure' = 'adult') {
  return (card: IntroCard): Response => {
    if (card.kind === 'probe') {
      if (card.level >= upTo) {
        return 'unsure';
      }
      return card.statement.truthy ? 'affirm' : 'deny';
    }
    if (card.id === 'age-13') {
      return age === 'unsure' ? 'unsure' : age === 'child' ? 'deny' : 'affirm';
    }
    if (card.id === 'age-18') {
      return age === 'adult' ? 'affirm' : 'deny';
    }
    return 'affirm';
  };
}

const ids = (cards: IntroCard[]) => cards.map((card) => (card.kind === 'ask' ? card.id : `#${card.level}`));
const steps = (cards: IntroCard[]) =>
  [...new Set(cards.filter((card) => card.kind === 'probe').map((card) => (card.kind === 'probe' ? card.level : -1)))];

describe('IntroRun', () => {
  it('börjar med frågor om en själv, inte med ett prov', () => {
    const seen = play(new IntroRun(seeded(1)), knowing(TOP_LEVEL));
    const firstProbe = seen.findIndex((card) => card.kind === 'probe');

    expect(seen.slice(0, OPENING).every((card) => card.kind === 'ask' && card.phase === 'about')).toBe(true);
    expect(firstProbe).toBeGreaterThan(OPENING);
  });

  it('frågar om ålder och skäl innan provet, eftersom åldern avgör var det börjar', () => {
    const seen = ids(play(new IntroRun(seeded(1)), knowing(TOP_LEVEL)));
    expect(seen.indexOf('why')).toBeLessThan(seen.findIndex((id) => id.startsWith('#')));
  });

  // Så var det inte först: tolv intressen, sedan ålder, sedan prov.
  it('varvar trappan med påståenden', () => {
    const seen = play(new IntroRun(seeded(1)), knowing(4));
    const afterWhy = ids(seen).slice(ids(seen).indexOf('why') + 1);

    // Steg, två påståenden, steg, två påståenden …
    expect(afterWhy.slice(0, 2).every((id) => id.startsWith('#'))).toBe(true);
    expect(afterWhy.slice(2, 2 + ASKS_BETWEEN).every((id) => !id.startsWith('#'))).toBe(true);
    expect(afterWhy[2 + ASKS_BETWEEN].startsWith('#')).toBe(true);
  });

  describe('avbrotten', () => {
    it('kommer efter varje trappsteg, före något annat', () => {
      const seen = ids(play(new IntroRun(seeded(1)), knowing(5)));
      seen.forEach((id, i) => {
        if (id.startsWith('#') && i + 1 < seen.length && !seen[i + 1].startsWith('#') && seen[i - 1] === id) {
          expect(seen[i + 1]).toBe('break');
        }
      });
      expect(seen.filter((id) => id === 'break').length).toBe(3);
    });

    it('bygger vidare på ett ja redan vid nästa avbrott', () => {
      const run = new IntroRun(seeded(1));
      const breaks = play(run, knowing(5)).filter((card) => card.kind === 'ask' && card.phase === 'break');
      const first = SEEDS.find((seed) => breaks[0].kind === 'ask' && seed.text === breaks[0].text)!;
      if (first.then !== undefined) {
        expect(breaks[1].kind === 'ask' && breaks[1].text).toBe(first.then);
      }
      expect(run.profile().breaks!.map((note) => note.answer)).toEqual(['yes', 'yes', 'yes']);
    });
  });

  it('frågar om vart och ett av dragen, en gång', () => {
    const seen = play(new IntroRun(seeded(1)), knowing(TOP_LEVEL));
    const how = seen.filter((card) => card.kind === 'ask' && card.phase === 'how');
    expect(ids(how).sort()).toEqual(TRAITS.map((item) => item.id).sort());
  });

  it('tar mätaren till slutet utan att backa', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const run = new IntroRun(seeded(seed));
      let last = 0;
      for (let guard = 0; guard < 200 && run.next() !== null; guard++) {
        run.answer(knowing(seed % TOP_LEVEL, seed % 2 === 0 ? 'adult' : 'child')(run.next()!));
        expect(run.progress).toBeGreaterThanOrEqual(last);
        last = run.progress;
      }
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

  describe('intressena efter åldern', () => {
    const asked = (age: 'child' | 'adult' | 'unsure') =>
      ids(play(new IntroRun(seeded(1)), knowing(0, age)));

    it('frågar en vuxen om jobbet, och ett barn om rymden', () => {
      expect(asked('adult')).toContain('work');
      expect(asked('adult')).not.toContain('space');
      expect(asked('child')).toContain('space');
      expect(asked('child')).not.toContain('work');
    });

    it('frågar om allt när åldern inte sagts', () => {
      const all = asked('unsure');
      for (const about of ABOUT) {
        expect(all).toContain(about.id);
      }
    });
  });

  describe('dragen', () => {
    it('sparar vad ett ja betyder för draget, inte svaret', () => {
      const run = new IntroRun(seeded(1));
      play(run, knowing(0));
      // Ja till «Det får gärna vara svårt» är för motstånd; ja till «Jag
      // tröttnar fort» är emot uthållighet.
      expect(run.profile().traits).toMatchObject({ challenge: 1, persistent: -1, careful: -1 });
    });

    it('sparar ett vet ej som noll', () => {
      const run = new IntroRun(seeded(1));
      play(run, () => 'unsure');
      expect(Object.values(run.profile().traits ?? {})).toEqual(TRAITS.map(() => 0));
    });

    it('säger inget om dragen innan de frågats', () => {
      expect(new IntroRun(seeded(1)).profile().traits).toBeUndefined();
    });
  });

  describe('åldern', () => {
    const ageFor = (answers: Record<string, Response>) => {
      const run = new IntroRun(seeded(1));
      const seen = play(run, (card) =>
        card.kind === 'ask' ? (answers[card.id] ?? 'deny') : 'unsure',
      );
      return { age: run.profile().age, ids: ids(seen) };
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
    it('har ett steg per nivå', () => {
      expect(LADDER).toHaveLength(TOP_LEVEL);
    });

    it('sätter nivån till antalet steg som höll, var den än började', () => {
      for (const age of ['child', 'teen', 'adult', 'unsure'] as const) {
        for (let level = 0; level <= TOP_LEVEL; level++) {
          const run = new IntroRun(seeded(level + 1));
          play(run, knowing(level, age));
          expect(run.profile().level, `${age}, nivå ${level}`).toBe(level);
        }
      }
    });

    // Det loggen visade: en vuxen fick börja vid `cat`.
    it('låter en vuxen börja ovanför de lättaste orden', () => {
      const seen = play(new IntroRun(seeded(1)), knowing(TOP_LEVEL, 'adult'));
      expect(steps(seen)[0]).toBeGreaterThan(0);
      expect(steps(seen)).not.toContain(0);
    });

    it('börjar vid de lättaste orden för ett barn', () => {
      expect(steps(play(new IntroRun(seeded(1)), knowing(TOP_LEVEL, 'child')))[0]).toBe(0);
    });

    it('går nedåt när första steget inte håller, och stannar där det håller', () => {
      const seen = play(new IntroRun(seeded(1)), knowing(1, 'adult'));
      expect(steps(seen)).toEqual([3, 2, 1, 0]);
    });

    it('går uppåt tills ett steg inte håller', () => {
      const seen = play(new IntroRun(seeded(1)), knowing(5, 'adult'));
      expect(steps(seen)).toEqual([3, 4, 5]);
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
