/**
 * Felsvaren, och varifrån de kommer.
 *
 * `ganger` räknar fram sina felsvar ur talet självt — ett granntal, en
 * förväxlad tabell — eftersom aritmetiken har en struktur att hämta dem ur. Ord
 * har ingen. Därför är felsvaren här i första hand *skrivna*, i ordlistan, av
 * den som kan orden.
 *
 * Ordningen är medveten:
 *
 * 1. Glosans egna felsvar, om listan har några. De hör till samma tema men
 *    behöver inte vara ett av blockets tio ord, och det är precis vad som
 *    hindrar att blocket lärs som *mängd*: kommer alla felsvar ur samma tio ord
 *    går det att svara rätt på `dog = katt` genom att veta att `katt` hör till
 *    `cat`, utan att veta vad `dog` betyder.
 * 2. Annars blockets andra ord, för att en lista utan felsvar ska gå att öva på
 *    ändå.
 *
 * Ett felsvar får aldrig vara något som skulle godtas som rätt: `hunden` för
 * `hund` är inte ett felsvar, det är ett rätt svar i annan form.
 */
import { Random, pick } from './shuffle';
import { WordPair, acceptedAnswers, normalize } from './word-catalog';

/** Ett påstående i sant/falskt-steget: `dog = hund`, sant eller falskt. */
export interface Statement {
  pair: WordPair;
  /** Översättningen som visas — facit eller ett felsvar. */
  shown: string;
  /** Om det som visas är rätt. Det är detta den som övar ska avgöra. */
  truthy: boolean;
}

/**
 * Hur ofta ett påstående är sant.
 *
 * Hälften, och inte mer: en övervikt åt sant lär ut att svepa ja, vilket är
 * ett mönster i gränssnittet och inte i språket.
 *
 * ANTAGANDE: se docs/plan.md.
 */
export const TRUE_SHARE = 0.5;

/**
 * Ett felsvar till glosan, eller `null` om det inte gick att hitta något — en
 * lista med ett enda ord och inga skrivna felsvar har inget att erbjuda, och då
 * ska påståendet vara sant i stället för påhittat.
 */
export function wrongAnswerFor(
  pair: WordPair,
  block: readonly WordPair[],
  random: Random = Math.random,
): string | null {
  const forbidden = new Set(acceptedAnswers(pair));

  const written = (pair.distractorsSv ?? []).filter((word) => !forbidden.has(normalize(word)));
  if (written.length > 0) {
    return pick(written, random);
  }

  const fromBlock = block
    .filter((other) => !forbidden.has(normalize(other.sv)))
    .map((other) => other.sv);
  return pick(fromBlock, random);
}

/** Påståendet som visas i sant/falskt. Sant i ungefär hälften av fallen. */
export function statementFor(
  pair: WordPair,
  block: readonly WordPair[],
  random: Random = Math.random,
): Statement {
  if (random() < TRUE_SHARE) {
    return { pair, shown: pair.sv, truthy: true };
  }
  const wrong = wrongAnswerFor(pair, block, random);
  if (wrong === null) {
    return { pair, shown: pair.sv, truthy: true };
  }
  return { pair, shown: wrong, truthy: false };
}
