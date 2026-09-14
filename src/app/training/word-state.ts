/**
 * De fyra stegen, och vad systemet anser om ett ord i vart och ett av dem.
 *
 * Allt här är rena funktioner på formen `gammalt tillstånd + händelse = nytt
 * tillstånd`. Ingen vy, ingen lagring, ingen tid — det är vad som gör att
 * reglerna går att pröva utan en spelare.
 *
 * Två beslut styr hela filen, och båda är ärvda från `ganger`:
 *
 * 1. **Tillståndet lagras inte, det härleds.** Sparas `state: "RECALL"` vid
 *    sidan av måtten finns två sanningar som kan glida isär. Här finns bara
 *    måtten; etiketten räknas fram vid visning.
 * 2. **Igenkänning kan aldrig befordra ett ord till automatiserat.** Match och
 *    true/false mäter att kopplingen känns igen, inte att den går att plocka
 *    fram. Regeln ligger i `stateFor()` och inte i en förhoppning: `AUTOMATIC`
 *    kräver att `written` sitter, och `written` är det enda steg som mäter
 *    fri produktion.
 */

/** De fyra stegen, i den ordning ett ord rör sig genom dem. */
export const STEPS = ['match', 'trueFalse', 'recall', 'written'] as const;
export type Step = (typeof STEPS)[number];

/** Vad ett ord kan vara. Härlett ur måtten, aldrig lagrat. */
export type WordState = 'UNSEEN' | 'MATCH' | 'TRUE_FALSE' | 'RECALL' | 'WRITTEN' | 'AUTOMATIC';

/** Hur väl ett ord sitter i *ett* steg. */
export type Mastery = 'weak' | 'learning' | 'mastered';

/**
 * Mätningarna i ett steg.
 *
 * `paces` är kvoter mot stegets egen baslinje, aldrig sekunder. Ett svep, ett
 * återkallat svar och ett skrivet svar ligger på tre olika tidsskalor, och
 * `ganger` har lärt sig två gånger att sekunder i ett delat fält blir ett mått
 * som jagar sin egen svans. En kvot på 1,0 är "lika snabb som du brukar vara i
 * det här steget", oavsett vilket steg det är.
 */
export interface StepStat {
  attempts: number;
  correct: number;
  /** Antal rätt i följd. Nollas av ett fel. */
  streak: number;
  /** De senaste farterna som kvot mot stegets baslinje, nyast sist. */
  paces: number[];
  /** De senaste utfallen, nyast sist. Fönstret domen vilar på. */
  recent: boolean[];
  /** Tidpunkt i ms, `null` innan ordet setts i det här steget. */
  lastSeen: number | null;
}

/** Vad appen vet om en glosa. Ett fält per steg, aldrig en samlad poäng. */
export type WordRecord = Record<Step, StepStat>;

/**
 * Så många av de senaste svaren domen vilar på, och hur många av dem som måste
 * vara rätt.
 *
 * Fönstret är vad som ger tröskeln hysteres utan att något extra behöver
 * sparas: uppåt krävs fyra av fem, nedåt krävs två missar i samma fönster. Ett
 * enstaka slarvfel tar alltså inte ifrån ett ord dess behärskning, och ett
 * tappat ord kan inte klättra tillbaka på ett enda rätt. Att etiketten inte
 * blinkar över gränsen är hela skälet till att det är ett fönster och inte en
 * räcka.
 *
 * ANTAGANDE: 5, 4 och 2 är satta på känsla. Se docs/plan.md.
 */
export const WINDOW = 5;
const MASTERED_HITS = 4;
const LEARNING_HITS = 2;

/**
 * Så många svar som krävs innan ett steg alls får dömas. Färre än så säger mer
 * om slumpen än om spelaren.
 *
 * ANTAGANDE: satt på känsla. Se docs/plan.md.
 */
export const MIN_ATTEMPTS = 4;

/**
 * Hur snabb ett behärskat ord måste vara, som kvot mot stegets baslinje.
 * Långsamt och rätt är inte samma sak som automatiserat.
 *
 * ANTAGANDE: satt på känsla. Se docs/plan.md.
 */
export const MASTERED_PACE = 1.25;

/**
 * Så många missar i rad i det pågående steget innan ordet får stöd av steget
 * under.
 *
 * ANTAGANDE: satt på känsla. Se docs/plan.md.
 */
export const FALLBACK_MISSES = 2;

export function emptyStat(): StepStat {
  return { attempts: 0, correct: 0, streak: 0, paces: [], recent: [], lastSeen: null };
}

export function emptyRecord(): WordRecord {
  return { match: emptyStat(), trueFalse: emptyStat(), recall: emptyStat(), written: emptyStat() };
}

/** Ett besvarat kort. `pace` är kvot mot stegets baslinje, `null` om otajmat. */
export interface Attempt {
  correct: boolean;
  pace: number | null;
  at: number;
}

/** `gammalt tillstånd + händelse = nytt tillstånd`. Skriver inget, returnerar. */
export function recordAttempt(stat: StepStat, attempt: Attempt): StepStat {
  return {
    attempts: stat.attempts + 1,
    correct: stat.correct + (attempt.correct ? 1 : 0),
    streak: attempt.correct ? stat.streak + 1 : 0,
    paces: attempt.pace === null ? stat.paces : [...stat.paces, attempt.pace].slice(-WINDOW),
    recent: [...stat.recent, attempt.correct].slice(-WINDOW),
    lastSeen: attempt.at,
  };
}

/** Medianen av de mätta farterna, `null` innan någon mätts. */
export function medianPace(stat: StepStat): number | null {
  if (stat.paces.length === 0) {
    return null;
  }
  const sorted = [...stat.paces].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

/**
 * Hur väl ordet sitter i ett steg.
 *
 * Farten får sänka en dom men aldrig höja den: ett ord som är rätt fyra gånger
 * av fem men segt är `learning`, medan ett snabbt ord med tre rätt av fem inte
 * blir behärskat av att vara snabbt. Otajmade svar saknar fart och bedöms bara
 * på utfall — annars skulle ett steg utan tidtagning aldrig kunna bli klart.
 */
export function masteryIn(stat: StepStat): Mastery {
  if (stat.attempts < MIN_ATTEMPTS) {
    return stat.attempts === 0 || hits(stat) < LEARNING_HITS ? 'weak' : 'learning';
  }

  const pace = medianPace(stat);
  const fastEnough = pace === null || pace <= MASTERED_PACE;
  if (hits(stat) >= MASTERED_HITS && fastEnough) {
    return 'mastered';
  }
  return hits(stat) >= LEARNING_HITS ? 'learning' : 'weak';
}

function hits(stat: StepStat): number {
  return stat.recent.filter(Boolean).length;
}

/**
 * Steget ordet ska övas i härnäst: det första som ännu inte sitter. `null` när
 * alla fyra sitter, vilket är vad `AUTOMATIC` betyder.
 *
 * Att gå framåt kräver alltså att steget under är behärskat, men inte att det
 * förblir det — ett ord som tappar sitt grepp om `recall` hamnar där igen av
 * sig självt nästa gång funktionen körs, utan att någon behöver skriva en
 * nedflyttning. Det är vinsten med att härleda i stället för att lagra.
 */
export function currentStep(record: WordRecord): Step | null {
  return STEPS.find((step) => masteryIn(record[step]) !== 'mastered') ?? null;
}

/**
 * Steget ordet faktiskt ska visas i nu.
 *
 * Skiljer sig från `currentStep()` bara när ordet nyss missat flera gånger i
 * rad: då hämtas stöd från steget under. Tillbakagången är ett *urvalsbeslut*
 * och ingen tillståndsändring — ordets dom i det steg det föll ifrån står kvar,
 * och det klättrar tillbaka så snart stödet hjälpt. Ett straff som nollställer
 * framsteg vore något annat, och sämre.
 */
export function trainingStep(record: WordRecord): Step | null {
  const step = currentStep(record);
  if (step === null) {
    return null;
  }

  const stat = record[step];
  const lately = stat.recent.slice(-FALLBACK_MISSES);
  const struggling = lately.length === FALLBACK_MISSES && lately.every((ok) => !ok);
  const index = STEPS.indexOf(step);
  return struggling && index > 0 ? STEPS[index - 1] : step;
}

/** Etiketten som visas. Härledd, aldrig lagrad. */
export function stateFor(record: WordRecord): WordState {
  if (STEPS.every((step) => record[step].attempts === 0)) {
    return 'UNSEEN';
  }
  const step = currentStep(record);
  if (step === null) {
    return 'AUTOMATIC';
  }
  return { match: 'MATCH', trueFalse: 'TRUE_FALSE', recall: 'RECALL', written: 'WRITTEN' }[
    step
  ] as WordState;
}

/**
 * Hur mycket ordet behöver övas, som vikt i urvalet inom blocket.
 *
 * Formen är `ganger`:s `needWeight` och bärs över för att skälet bär: ett
 * oprövat ord är värt att mäta, ett segt eller felstavat värt att nöta, och ett
 * behärskat ord får komma sällan — men *aldrig aldrig*, annars märks det inte
 * när det rostat.
 *
 * ANTAGANDE: hela trappan är satt på känsla — golvet 0,15, taket 3. Formen är
 * resonerad, siffrorna är inte mätta. Se docs/plan.md.
 */
export const NEED_FLOOR = 0.15;
export const NEED_CEILING = 3;

export function needFor(record: WordRecord, step: Step): number {
  const stat = record[step];
  if (stat.attempts === 0) {
    return 1;
  }

  const mastery = masteryIn(stat);
  if (mastery === 'mastered') {
    return NEED_FLOOR;
  }

  const pace = medianPace(stat);
  const slowness = pace === null ? 1 : Math.min(NEED_CEILING, pace);
  const missShare = 1 - hits(stat) / Math.max(1, stat.recent.length);
  return Math.max(NEED_FLOOR, Math.min(NEED_CEILING, slowness * (1 + 2 * missShare)));
}
