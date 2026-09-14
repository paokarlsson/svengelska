import { describe, expect, it } from 'vitest';
import {
  Attempt,
  FALLBACK_MISSES,
  MASTERED_PACE,
  MIN_ATTEMPTS,
  NEED_FLOOR,
  STEPS,
  Step,
  StepStat,
  WordRecord,
  currentStep,
  emptyRecord,
  emptyStat,
  hasReached,
  masteryIn,
  medianPace,
  needFor,
  recordAttempt,
  settled,
  stateFor,
  trainingStep,
} from './word-state';

/** Bygger en statistik ur en rad utfall. `pace` är kvot mot baslinjen. */
function statFrom(outcomes: readonly boolean[], pace: number | null = 1): StepStat {
  return outcomes.reduce<StepStat>(
    (stat, correct, index) => recordAttempt(stat, { correct, pace, at: index }),
    emptyStat(),
  );
}

function recordWith(parts: Partial<Record<Step, StepStat>>): WordRecord {
  return { ...emptyRecord(), ...parts };
}

/** Ett steg som sitter: fem rätt i normal fart. */
function mastered(): StepStat {
  return statFrom([true, true, true, true, true]);
}

describe('recordAttempt', () => {
  it('nollar räckan på ett fel men behåller historiken', () => {
    const stat = statFrom([true, true, false]);
    expect(stat.streak).toBe(0);
    expect(stat.attempts).toBe(3);
    expect(stat.correct).toBe(2);
  });

  it('håller fönstret vid fem svar', () => {
    const stat = statFrom([true, true, true, true, true, false, false]);
    expect(stat.recent).toHaveLength(5);
    expect(stat.recent.at(-1)).toBe(false);
    expect(stat.attempts).toBe(7);
  });

  it('sparar ingen fart för ett otajmat svar', () => {
    const attempt: Attempt = { correct: true, pace: null, at: 1 };
    expect(recordAttempt(emptyStat(), attempt).paces).toHaveLength(0);
  });

  it('rör inte det den fick', () => {
    const before = statFrom([true]);
    const snapshot = JSON.stringify(before);
    recordAttempt(before, { correct: false, pace: 2, at: 9 });
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe('masteryIn', () => {
  it('dömer ingenting innan det finns svar nog', () => {
    expect(masteryIn(statFrom([true, true, true]))).not.toBe('mastered');
    expect(statFrom([true, true, true]).attempts).toBeLessThan(MIN_ATTEMPTS);
  });

  it('låter ett enstaka slarvfel behålla behärskningen', () => {
    expect(masteryIn(statFrom([true, true, true, true, true]))).toBe('mastered');
    expect(masteryIn(statFrom([true, true, true, true, true, false]))).toBe('mastered');
  });

  it('tar ifrån ordet behärskningen först vid två missar i fönstret', () => {
    expect(masteryIn(statFrom([true, true, true, true, false, false]))).toBe('learning');
  });

  it('kräver mer än ett rätt för att klättra tillbaka', () => {
    const fallen = statFrom([true, true, true, false, false]);
    expect(masteryIn(fallen)).toBe('learning');
    expect(masteryIn(recordAttempt(fallen, { correct: true, pace: 1, at: 6 }))).toBe('learning');
  });

  it('låter farten sänka en dom men aldrig höja den', () => {
    const slow = statFrom([true, true, true, true, true], MASTERED_PACE + 0.5);
    expect(masteryIn(slow)).toBe('learning');

    const fastButWrong = statFrom([true, false, true, false, true], 0.2);
    expect(masteryIn(fastButWrong)).not.toBe('mastered');
  });

  it('dömer på utfall ensamt när steget inte tar tid', () => {
    expect(masteryIn(statFrom([true, true, true, true, true], null))).toBe('mastered');
  });
});

describe('currentStep', () => {
  it('pekar på det första steg som inte sitter', () => {
    const record = recordWith({ match: mastered(), trueFalse: mastered() });
    expect(currentStep(record)).toBe('recall');
  });

  it('ger null först när alla fyra sitter, vilket är vad automatiserat betyder', () => {
    const all = Object.fromEntries(STEPS.map((step) => [step, mastered()])) as WordRecord;
    expect(currentStep(all)).toBeNull();
    expect(stateFor(all)).toBe('AUTOMATIC');
  });

  it('tar tillbaka ett ord som tappat greppet, utan att något flyttas', () => {
    const rusty = recordWith({
      match: mastered(),
      trueFalse: mastered(),
      recall: statFrom([true, true, true, false, false]),
    });
    expect(currentStep(rusty)).toBe('recall');
  });

  it('räknar ett överhoppat steg som klart när ett svårare sitter', () => {
    // Kliver passet in i svepet mäts match aldrig. Utan den här regeln vore
    // ordet låst till match för alltid, och automatiserat oåtkomligt.
    const skipped = recordWith({ written: mastered() });
    expect(skipped.match.attempts).toBe(0);
    expect(currentStep(skipped)).toBeNull();
    expect(stateFor(skipped)).toBe('AUTOMATIC');
  });

  it('läser aldrig regeln åt andra hållet: igenkänning täcker inget svårare', () => {
    const recognisedOnly = recordWith({ match: mastered(), trueFalse: mastered() });
    expect(settled(recognisedOnly, 'match')).toBe(true);
    expect(settled(recognisedOnly, 'written')).toBe(false);
    expect(currentStep(recognisedOnly)).toBe('recall');
  });
});

describe('hasReached', () => {
  it('ser inte skrivsteget i ett orört ord', () => {
    expect(hasReached(emptyRecord(), 'written')).toBe(false);
    expect(hasReached(emptyRecord(), 'match')).toBe(true);
  });

  it('ser varje steg i ett automatiserat ord', () => {
    const all = Object.fromEntries(STEPS.map((step) => [step, mastered()])) as WordRecord;
    expect(STEPS.every((step) => hasReached(all, step))).toBe(true);
  });

  it('ser fram till det pågående steget, men inte förbi det', () => {
    const record = recordWith({ match: mastered(), trueFalse: mastered() });
    expect(hasReached(record, 'recall')).toBe(true);
    expect(hasReached(record, 'written')).toBe(false);
  });
});

describe('stateFor', () => {
  it('kallar ett oprövat ord outforskat, inte svagt', () => {
    expect(stateFor(emptyRecord())).toBe('UNSEEN');
  });

  it('låter aldrig igenkänning ensam nå automatiserat', () => {
    // Match och sant/falskt är igenkänning. Sitter bara de två kan ordet inte
    // vara automatiserat — annars går det att matcha sig till en grön karta.
    const recognisedOnly = recordWith({ match: mastered(), trueFalse: mastered() });
    expect(stateFor(recognisedOnly)).not.toBe('AUTOMATIC');
    expect(stateFor(recognisedOnly)).toBe('RECALL');
  });

  it('kräver skriftligt för automatiserat även när återkallningen sitter', () => {
    const recalled = recordWith({
      match: mastered(),
      trueFalse: mastered(),
      recall: mastered(),
    });
    expect(stateFor(recalled)).toBe('WRITTEN');
  });
});

describe('trainingStep', () => {
  it('följer det pågående steget så länge det går framåt', () => {
    const record = recordWith({ match: mastered(), trueFalse: statFrom([true, false, true]) });
    expect(trainingStep(record)).toBe('trueFalse');
  });

  it('hämtar stöd från steget under efter missar i rad', () => {
    const misses = Array<boolean>(FALLBACK_MISSES).fill(false);
    const record = recordWith({
      match: mastered(),
      trueFalse: mastered(),
      recall: statFrom([true, ...misses]),
    });
    expect(currentStep(record)).toBe('recall');
    expect(trainingStep(record)).toBe('trueFalse');
  });

  it('har inget steg under match att falla till', () => {
    const record = recordWith({ match: statFrom([false, false]) });
    expect(trainingStep(record)).toBe('match');
  });

  it('lämnar domen i steget ordet föll ifrån orörd — stödet är inget straff', () => {
    const record = recordWith({
      match: mastered(),
      trueFalse: mastered(),
      recall: statFrom([false, false]),
    });
    trainingStep(record);
    expect(masteryIn(record.trueFalse)).toBe('mastered');
  });

  it('beter sig som förr när ingen ingång valts', () => {
    // Kvittot på att golvet är additivt: utan argument ska ingenting ha ändrats.
    const records = [
      emptyRecord(),
      recordWith({ match: mastered() }),
      recordWith({ match: mastered(), trueFalse: statFrom([false, false]) }),
      recordWith({ match: mastered(), trueFalse: mastered(), recall: mastered() }),
    ];
    for (const record of records) {
      expect(trainingStep(record)).toBe(trainingStep(record, STEPS[0]));
    }
  });
});

describe('trainingStep med en vald ingång', () => {
  it('låter ett orört ord kliva in där passet börjar, inte längst ned', () => {
    for (const floor of STEPS) {
      expect(trainingStep(emptyRecord(), floor)).toBe(floor);
    }
  });

  it('är ett golv och inget tak — ett ord som kommit längre sänks inte', () => {
    const record = recordWith({ match: mastered(), trueFalse: mastered(), recall: mastered() });
    expect(currentStep(record)).toBe('written');
    for (const floor of STEPS) {
      expect(trainingStep(record, floor)).toBe('written');
    }
  });

  it('låter stödet gå under golvet, för stöd är inget straff', () => {
    const misses = Array<boolean>(FALLBACK_MISSES).fill(false);
    const record = recordWith({ recall: statFrom(misses) });
    expect(trainingStep(record, 'recall')).toBe('trueFalse');
  });

  it('mäter kämpandet i det steg ordet faktiskt visades i', () => {
    // Missarna ligger i match, men passet kliver in i svepet: ordet har aldrig
    // setts där, så det finns inget att falla ifrån.
    const misses = Array<boolean>(FALLBACK_MISSES).fill(false);
    const record = recordWith({ match: statFrom(misses) });
    expect(trainingStep(record, 'recall')).toBe('recall');
    expect(trainingStep(record, 'match')).toBe('match');
  });
});

describe('needFor', () => {
  it('är värt att mäta när ordet aldrig prövats', () => {
    expect(needFor(emptyRecord(), 'match')).toBe(1);
  });

  it('sjunker till golvet för ett behärskat ord, men aldrig till noll', () => {
    const record = recordWith({ match: mastered() });
    expect(needFor(record, 'match')).toBe(NEED_FLOOR);
    expect(needFor(record, 'match')).toBeGreaterThan(0);
  });

  it('väger ett segt och felstavat ord tyngre än ett säkert', () => {
    const shaky = recordWith({ recall: statFrom([false, true, false, true, false], 2) });
    const solid = recordWith({ recall: mastered() });
    expect(needFor(shaky, 'recall')).toBeGreaterThan(needFor(solid, 'recall'));
  });
});

describe('medianPace', () => {
  it('ger null innan någon fart mätts', () => {
    expect(medianPace(emptyStat())).toBeNull();
  });

  it('låter ett tappat kort inte dra iväg medianen', () => {
    const stat = statFrom([true, true, true], 1);
    const dropped = recordAttempt(stat, { correct: true, pace: 40, at: 9 });
    expect(medianPace(dropped)).toBeLessThan(2);
  });
});
