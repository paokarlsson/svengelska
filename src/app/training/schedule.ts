/**
 * Repetitionsplanen: när ett ord ska tillbaka.
 *
 * Under ytan och osynlig. Ingen graf, inga intervall på skärmen, ingen «nästa
 * repetition om fyra dagar» — den som övar ser tio ord och trycker igång. Det
 * är samma hållning som resten av appen: komplexitet under ytan, enkelhet på
 * den.
 *
 * Formen är Leitner. Lådan ligger i `StepStat.box` och flyttas av `nextBox()` i
 * `word-state.ts`, eftersom *vad ett svar betyder* är en regel om ordet. Det
 * här är den andra halvan: vad lådan betyder i tid.
 *
 * Dygn och inte timmar. Ett ord som svarades rätt strax före läggdags ska komma
 * tillbaka nästa dag och inte nästa kväll, och den som övar två gånger samma
 * dag ska inte få samma ord igen för att det gått tjugofyra timmar och en
 * minut. Trappan mäts därför i dygnsgränser, precis som en människa räknar
 * dagar.
 */
import { StepStat } from './word-state';

/**
 * Trappan mellan lådorna, i dygn. Låda noll betyder samma pass.
 *
 * Fördubblingen är Leitners egen och behöver inget försvar; att den börjar med
 * två ettor är däremot ett val: ett ord som just lärts in ska ses två dagar i
 * rad innan det får vila, eftersom den andra dagen är den som avgör om det
 * första rätta svaret var minne eller eko.
 *
 * ANTAGANDE: satt på känsla. Se docs/nerskalad.md.
 */
export const INTERVALS: readonly number[] = [0, 1, 1, 3, 7, 16, 32];

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Dygnets början i lokal tid. Det är i lokala dygn en människa räknar dagar. */
export function startOfDay(at: number): number {
  const date = new Date(at);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** Om två tidpunkter ligger på samma dygn. */
export function sameDay(a: number, b: number): boolean {
  return startOfDay(a) === startOfDay(b);
}

/** Intervallet lådan ger, i dygn. Utanför trappan klampas till dess ändar. */
export function intervalFor(box: number): number {
  const index = Math.max(0, Math.min(INTERVALS.length - 1, Math.floor(box)));
  return INTERVALS[index];
}

/**
 * När ordet är moget igen, eller `null` om det aldrig setts.
 *
 * Ett ord som aldrig setts har ingen mognadsdag utan är *nytt*, och nya ord
 * styrs av dagsbudgeten och inte av planen. Att låta dem se mogna ut vore att
 * låta budgeten gälla bara den första dagen.
 */
export function dueAt(stat: StepStat): number | null {
  if (stat.lastSeen === null) {
    return null;
  }
  return startOfDay(stat.lastSeen) + intervalFor(stat.box) * DAY_MS;
}

/** Om ordet är moget nu. Ett osett ord är inte moget — det är nytt. */
export function isDue(stat: StepStat, now: number): boolean {
  const due = dueAt(stat);
  return due !== null && now >= due;
}

/**
 * Hur försenat ordet är, i millisekunder. Negativt för det som inte är moget.
 *
 * Sorteringsnyckeln när varvet ska fyllas: det som väntat längst går först,
 * eftersom ett ord som legat över sin dag i en vecka är närmare att glömmas än
 * ett som legat över den sedan i morse.
 */
export function overdueBy(stat: StepStat, now: number): number {
  const due = dueAt(stat);
  return due === null ? Number.NEGATIVE_INFINITY : now - due;
}
