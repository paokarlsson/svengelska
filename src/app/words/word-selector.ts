/**
 * Urvalet inom blocket: vilket ord som kommer härnäst, och i vilket steg.
 *
 * Blocket *är* urvalsrymden. Det finns ingen nivå att öppna och inget fönster
 * att glida framåt — det som i `ganger` är nivån är här ordets eget steg, och
 * det avgörs per ord i `word-state.ts`.
 *
 * Två saker gör draget till något annat än slumpen:
 *
 * **Gruppen dras före ordet.** Vikterna ensamma ger ingen fördelning: med
 * multiplicerade vikter går det att ange en andel, men bara att hoppas på den.
 * Dras först en grupp — svaga, på gång, behärskade — och sedan ett ord inom
 * den, blir andelen ett tal som går att testa, och testet finns.
 *
 * **Det nyss övade är spärrat.** Ett svårt ord ska komma tillbaka efter några
 * andra ord, inte omedelbart. Att svara på samma glosa två gånger i rad mäter
 * korttidsminnet och inte glosan, och `ganger` lärde sig det som `RECENT_MEMORY`.
 */
import { Step, WordRecord, currentStep, masteryIn, needFor, trainingStep } from '../training/word-state';
import { Random, weightedPick } from './shuffle';
import { WordPair, wordKey } from './word-catalog';

/** Ett ord och steget det ska visas i. */
export interface Exposure {
  pair: WordPair;
  step: Step;
}

/**
 * Så många ord tillbaka som är spärrade från att dras igen.
 *
 * ANTAGANDE: fyra, lyft ur `ganger`. Spärren lyfts när den skulle tömma
 * blocket — ett block med tre ord kvar ska gå att öva på.
 */
export const RECENT_MEMORY = 4;

/** Grupperna draget görs i, och hur ofta var och en ska komma. */
export type Group = 'weak' | 'learning' | 'mastered';

/**
 * Fördelningen mellan grupperna.
 *
 * Konceptets 60–70 / 20–30 / 10–15 med en siffra vald i varje spann.
 *
 * Att *behärskade* ord alls har en andel är hela skälet till att gruppen finns:
 * ett ord som är klart med alla fyra steg lämnar annars urvalet för gott, och
 * då märks det aldrig att det rostat. `needFor` säger samma sak med sitt golv —
 * ett behärskat ord ska komma sällan, men aldrig aldrig.
 *
 * ANTAGANDE: se docs/plan.md.
 */
export const GROUP_SHARES: Record<Group, number> = {
  weak: 0.65,
  learning: 0.25,
  mastered: 0.1,
};

/**
 * Nästa exponering ur blocket, eller `null` bara om blocket är tomt.
 *
 * Ett automatiserat ord ligger kvar i urvalet och underhålls i sitt sista steg;
 * *när ett pass är slut* är dirigentens fråga och inte urvalets. Att blanda ihop
 * de två vore att låta ett färdigt ord försvinna ur systemet, och det är precis
 * då ingen märker att det rostat.
 *
 * `recordOf` är motorns bild av ett ord, och `recent` är nycklarna på de senast
 * dragna orden med det nyaste sist. Båda kommer utifrån: den här filen håller
 * inget tillstånd, och går därför att pröva utan en spelare.
 */
export function selectNext(
  words: readonly WordPair[],
  recordOf: (pair: WordPair) => WordRecord,
  recent: readonly string[] = [],
  random: Random = Math.random,
): Exposure | null {
  const candidates = exposures(words, recordOf);
  if (candidates.length === 0) {
    return null;
  }

  const blocked = new Set(recent.slice(-RECENT_MEMORY));
  const fresh = candidates.filter((exposure) => !blocked.has(wordKey(exposure.pair)));
  const pool = fresh.length > 0 ? fresh : candidates;

  const group = drawGroup(pool, recordOf, random);
  const inGroup = pool.filter((exposure) => groupOf(exposure.pair, recordOf) === group);
  return weightedPick(inGroup, (exposure) => needFor(recordOf(exposure.pair), exposure.step), random);
}

/**
 * Blockets ord med det steg vart och ett ska visas i.
 *
 * Ett ord som klarat alla fyra steg har inget nästa steg, och underhålls då i
 * det sista: skrivsteget är det enda som mäter fri produktion, och därmed det
 * enda som kan upptäcka att ett färdigt ord glidit.
 */
export function exposures(
  words: readonly WordPair[],
  recordOf: (pair: WordPair) => WordRecord,
): Exposure[] {
  return words.map((pair) => ({ pair, step: trainingStep(recordOf(pair)) ?? 'written' }));
}

/**
 * Sällskapet i en match-runda: ordet självt och några till, alla visade i samma
 * omgång.
 *
 * Match är det enda steget som inte är ett kort i taget, och en runda med två
 * par är ingen övning. Därför fylls rundan i första hand med ord som också står
 * i match-steget, och i andra hand med vilka ord som helst ur blocket —
 * ett behärskat ord som får komma med kostar ingenting och håller det vid liv.
 */
export function companionsFor(
  pair: WordPair,
  words: readonly WordPair[],
  recordOf: (pair: WordPair) => WordRecord,
  size: number,
  random: Random = Math.random,
): WordPair[] {
  const chosen = [pair];
  const taken = new Set([wordKey(pair)]);
  const sameStep = exposures(words, recordOf)
    .filter((exposure) => exposure.step === 'match')
    .map((exposure) => exposure.pair);

  for (const source of [sameStep, words]) {
    while (chosen.length < size) {
      const rest = source.filter((other) => !taken.has(wordKey(other)));
      const next = weightedPick(rest, (other) => needFor(recordOf(other), 'match'), random);
      if (next === null) {
        break;
      }
      taken.add(wordKey(next));
      chosen.push(next);
    }
  }
  return chosen;
}

/**
 * Vilken grupp ordet hör till.
 *
 * Domen läses ur ordets *eget* nästa steg och inte ur det steg exponeringen
 * hamnade i. Skillnaden märks för ett ord som får stöd av steget under: det
 * stödsteget sitter ju, och läste gruppen det skulle ett ord som just nu
 * kämpar hamna bland de behärskade och sluta komma tillbaka.
 */
function groupOf(pair: WordPair, recordOf: (pair: WordPair) => WordRecord): Group {
  const record = recordOf(pair);
  const step = currentStep(record);
  return step === null ? 'mastered' : masteryIn(record[step]);
}

/**
 * Drar en grupp enligt `GROUP_SHARES`, men bara bland de grupper som har något
 * att erbjuda: andelarna räknas om mot de icke-tomma, så att ett block där allt
 * är svagt ändå ger ett ord i stället för ett tomt drag.
 */
function drawGroup(
  pool: readonly Exposure[],
  recordOf: (pair: WordPair) => WordRecord,
  random: Random,
): Group {
  const present = (Object.keys(GROUP_SHARES) as Group[]).filter((group) =>
    pool.some((exposure) => groupOf(exposure.pair, recordOf) === group),
  );
  return weightedPick(present, (group) => GROUP_SHARES[group], random) ?? 'weak';
}
