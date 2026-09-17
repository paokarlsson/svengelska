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

import { ACTIVE_STEPS } from './scope';

/** De fyra stegen, i den ordning ett ord rör sig genom dem. */
export const STEPS = ['match', 'trueFalse', 'recall', 'written'] as const;
export type Step = (typeof STEPS)[number];

/**
 * Kontrollen `scope.ts` inte kan göra själv: att spärrens strängar är steg.
 * Skrivs ett stavfel där faller bygget här, på raden som förklarar varför.
 */
const ACTIVE: readonly Step[] = ACTIVE_STEPS;

/**
 * Det lägsta steg som når skärmen.
 *
 * Skilt från passets golv, och skillnaden är hela ändringen spärren kräver:
 * stödsteget får gå under *användarens* golv, eftersom missarna är en mätning
 * och golvet ett antagande — men aldrig under det *aktiva*, eftersom det steget
 * inte ritas av någon vy. Ett stöd som pekar på en avstängd vy är ett kort som
 * aldrig kommer.
 */
export const LOWEST_ACTIVE: Step = STEPS.find((step) => ACTIVE.includes(step)) ?? STEPS[0];

/**
 * Vad ett svar var.
 *
 * Fyra utfall och inte två, och båda uppdelningarna är betalda av något:
 *
 * `hit` mot `slow` — rätt i tempo mot rätt men segt. Att kunna ett ord
 * långsamt är inte att kunna det, och utan den skillnaden i utfallet skulle
 * repetitionsplanen inte kunna låta ett segt rätt stå kvar i sin låda.
 *
 * `miss` mot `unsure` — fel mot «vet ej». Tre `miss` är ett ord som lärts in
 * fel; tre `unsure` är ett ord som aldrig lärts in. Åtgärden skiljer sig —
 * rätta mot introducera — och slås de ihop försvinner skillnaden i samma stund
 * den uppstår. För domen «sitter det?» är de ändå samma svar; se `hits()`.
 */
export type Outcome = 'hit' | 'slow' | 'miss' | 'unsure';

/**
 * Vad den som övar svarade — gesten, inte domen.
 *
 * Höger är sant, vänster är falskt, ner är «vet ej». Att en vy skickar det här
 * och inte ett `correct` är treskiktningen i en rad: om kortet var sant, om
 * svaret var i tempo och vad det gör med planen är motorns sak, och en vy som
 * räknade ut det själv vore den första sprickan.
 */
export type Response = 'affirm' | 'deny' | 'unsure';

/** Om utfallet var ett rätt svar, snabbt eller långsamt. */
export function isCorrect(outcome: Outcome): boolean {
  return outcome === 'hit' || outcome === 'slow';
}

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
  /** De senaste farterna som kvot mot kanalens baslinje, nyast sist. */
  paces: number[];
  /** De senaste utfallen, nyast sist. Fönstret domen vilar på. */
  recent: Outcome[];
  /** Tidpunkt i ms, `null` innan ordet setts i det här steget. */
  lastSeen: number | null;
  /**
   * Tidpunkten för det *första* svaret, satt en gång och aldrig ändrad.
   *
   * Finns för dagsbudgeten av nya ord. En räknare som nollas vid midnatt är ett
   * fält som kan glida isär från verkligheten; ett fält som skrivs en gång kan
   * det inte. «Nya ord i dag» är antalet ord vars `firstSeen` infaller i dag,
   * och det är en fråga och inte en bokföring.
   */
  firstSeen: number | null;
  /**
   * Lådan i repetitionsplanen. Se `schedule.ts` för trappan.
   *
   * Det här är det enda lagrade tillstånd appen har som inte också går att
   * härleda, och avsteget är medvetet: fönstret `recent` är fem svar långt, och
   * en låda som bara får minnas fem svar kan aldrig växa förbi den femte. Ett
   * ord som svarats rätt tjugo gånger ska ha ett långt intervall, och det går
   * inte att läsa ur ett kort fönster utan att ljuga. Se `nextBox()`.
   */
  box: number;
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
  return {
    attempts: 0,
    correct: 0,
    streak: 0,
    paces: [],
    recent: [],
    lastSeen: null,
    firstSeen: null,
    box: 0,
  };
}

export function emptyRecord(): WordRecord {
  return { match: emptyStat(), trueFalse: emptyStat(), recall: emptyStat(), written: emptyStat() };
}

/** Ett besvarat kort. `pace` är kvot mot kanalens baslinje, `null` om otajmat. */
export interface Attempt {
  outcome: Outcome;
  pace: number | null;
  at: number;
}

/** `gammalt tillstånd + händelse = nytt tillstånd`. Skriver inget, returnerar. */
export function recordAttempt(stat: StepStat, attempt: Attempt): StepStat {
  const correct = isCorrect(attempt.outcome);
  return {
    attempts: stat.attempts + 1,
    correct: stat.correct + (correct ? 1 : 0),
    streak: correct ? stat.streak + 1 : 0,
    paces: attempt.pace === null ? stat.paces : [...stat.paces, attempt.pace].slice(-WINDOW),
    recent: [...stat.recent, attempt.outcome].slice(-WINDOW),
    lastSeen: attempt.at,
    firstSeen: stat.firstSeen ?? attempt.at,
    box: nextBox(stat.box, attempt.outcome),
  };
}

/**
 * Så många lådor trappan har. Trappan själv — intervallen i dygn — ligger i
 * `schedule.ts`, eftersom den är en plan och inte en regel om ett ord.
 */
export const MAX_BOX = 6;

/**
 * Lådan efter ett svar, och det är här priset på «vet ej» står i kod.
 *
 * Räkningen bakom asymmetrin: den som chansar har rätt varannan gång, så den
 * väntade kostnaden för att gissa är halva felets. Ärlighet är därför det
 * rationella valet först när ett «vet ej» kostar *mindre än hälften* av vad ett
 * fel kostar — lika pris räcker inte, det gör gissandet till den bättre
 * strategin. Botten mot ett steg ned är den billigaste formen som uppfyller det.
 *
 * Att felet är det hårdare av de två stämmer även utan räkningen: ett fel på
 * ett sant/falskt-kort är antingen en falsk föreställning eller en chansning,
 * och båda förtjänar nollställningen. En ärlig lucka gör det inte.
 *
 * `slow` står kvar: ett ord som svarats rätt men segt har inte förtjänat ett
 * längre intervall, och utan den raden vandrar ord ut till trettiotvå dygn på
 * svar som varje gång tar tre gånger så lång tid som ett ord man kan.
 */
export function nextBox(box: number, outcome: Outcome): number {
  const current = Math.max(0, Math.min(MAX_BOX, Math.floor(box)));
  if (outcome === 'hit') {
    return Math.min(MAX_BOX, current + 1);
  }
  if (outcome === 'slow') {
    return current;
  }
  return outcome === 'unsure' ? Math.max(0, current - 1) : 0;
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

/**
 * Antalet rätt i fönstret.
 *
 * Ett «vet ej» räknas som en miss här, och det är rätt: frågan `masteryIn()`
 * ställer är «sitter ordet?», och på den frågan är en lucka och ett fel samma
 * svar. Skillnaden mellan dem betyder något i planen och på kartan, inte i
 * domen.
 */
function hits(stat: StepStat): number {
  return stat.recent.filter(isCorrect).length;
}

/**
 * Om steget är avklarat: det sitter självt, eller något svårare sitter.
 *
 * Nödvändig i samma stund passets ingång går att välja. Kliver ett pass in i
 * `recall` mäts `match` aldrig, och `masteryIn()` på ett tomt steg är `weak` —
 * läste `currentStep()` bara sin egen dom skulle den peka på `match` för
 * alltid, och då kunde inget ord någonsin bli automatiserat.
 *
 * Regeln läses bara *nedåt*: `slice` går från steget och uppåt, så ett
 * behärskat `match` gör aldrig `written` avklarat. Fri produktion bevisar
 * igenkänning; igenkänning bevisar aldrig produktion. Det är samma asymmetri
 * som `stateFor()` redan vilar på, läst åt andra hållet.
 *
 * För ett ord som gått stegen i ordning ändrar den ingenting — har det nått
 * skrivsteget sitter allt under ändå. Grenen kan bara falla ut för ett ord som
 * hoppat över något, vilket är precis vad den finns för.
 *
 * Hörnfall: ett ord som nått automatiserat via svep-ingången och sedan tappar
 * `written` får `currentStep() === 'match'`, eftersom ingen mätning finns kvar
 * under. Det är ärligt — det finns ingen dom som håller — och i passet är det
 * osynligt, för golvet i `trainingStep()` lyfter ordet till ingångssteget igen.
 */
export function settled(record: WordRecord, step: Step): boolean {
  return STEPS.slice(STEPS.indexOf(step)).some((above) => masteryIn(record[above]) === 'mastered');
}

/**
 * Steget ordet ska övas i härnäst: det första som ännu inte är avklarat. `null`
 * när alla fyra är det, vilket är vad `AUTOMATIC` betyder.
 *
 * Att gå framåt kräver alltså att steget under är behärskat, men inte att det
 * förblir det — ett ord som tappar sitt grepp om `recall` hamnar där igen av
 * sig självt nästa gång funktionen körs, utan att någon behöver skriva en
 * nedflyttning. Det är vinsten med att härleda i stället för att lagra.
 */
export function currentStep(record: WordRecord): Step | null {
  return STEPS.find((step) => !settled(record, step)) ?? null;
}

/**
 * Om ordet tagit sig fram till steget — dess nuvarande steg, eller passerat.
 *
 * Det som låser upp en ingång på startsidan. Skild från `settled()`: den frågar
 * om steget är *avklarat*, den här om det är *nått*.
 */
export function hasReached(record: WordRecord, step: Step): boolean {
  const current = currentStep(record);
  return current === null || STEPS.indexOf(current) >= STEPS.indexOf(step);
}

/**
 * Steget ordet faktiskt ska visas i nu.
 *
 * Skiljer sig från `currentStep()` på två sätt. Det ena är stödet: har ordet
 * nyss missat flera gånger i rad hämtas nästa exponering från steget under.
 * Tillbakagången är ett *urvalsbeslut* och ingen tillståndsändring — ordets dom
 * i det steg det föll ifrån står kvar, och det klättrar tillbaka så snart
 * stödet hjälpt. Ett straff som nollställer framsteg vore något annat, och
 * sämre.
 *
 * Det andra är `floor`: var passet kliver in. Det är ett *golv och inget läge* —
 * användaren säger var veckan börjar, men varje kort efter det första avgörs av
 * mätningen. Ett ord som sitter puttas vidare uppåt av `currentStep()` mitt i
 * passet, precis som förut.
 */
export function trainingStep(record: WordRecord, floor: Step = STEPS[0]): Step | null {
  const step = currentStep(record);
  if (step === null) {
    return null;
  }

  // Math.max, inte min: golvet lyfter ett ord till där passet kliver in, men
  // sänker aldrig ett ord som redan kommit längre.
  const index = Math.max(STEPS.indexOf(step), STEPS.indexOf(floor));

  // Domen läses ur det *klampade* steget. Lyfte golvet ordet till `recall` ska
  // frågan "kämpar det?" avgöras av de senaste svepsvaren — inte av match-svar
  // som kanske aldrig finns.
  const stat = record[STEPS[index]];
  const lately = stat.recent.slice(-FALLBACK_MISSES);
  const struggling = lately.length === FALLBACK_MISSES && !lately.some(isCorrect);

  // Stödet klampas medvetet *inte* mot användarens golv: det får gå under.
  // Golvet är användarens antagande, missarna är en mätning, och mätningen
  // väger tyngre. Hölls stödet över golvet skulle ett ord som kämpar i
  // ingångssteget fastna där utan väg ut — och då vore valet ett läge trots
  // allt.
  //
  // Mot det *aktiva* golvet klampas det däremot, och det är en annan sak: ett
  // avstängt steg ritas inte av någon vy, så ett stöd som pekar dit är ett kort
  // som aldrig kommer. Se `LOWEST_ACTIVE`.
  const floorIndex = STEPS.indexOf(LOWEST_ACTIVE);
  return struggling && index > floorIndex ? STEPS[index - 1] : STEPS[index];
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
