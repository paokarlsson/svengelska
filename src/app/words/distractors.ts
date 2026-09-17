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
import {
  Direction,
  DirectedWord,
  WordPair,
  acceptedAnswers,
  answerOf,
  distractorsFor,
  normalize,
  promptOf,
} from './word-catalog';

/**
 * Ett påstående i sant/falskt-steget: `dog = hund`, sant eller falskt.
 *
 * Bär sin riktning, eftersom `hund = dog` och `dog = hund` är två påståenden om
 * två olika färdigheter och inte samma kort läst baklänges.
 */
export interface Statement {
  pair: WordPair;
  direction: Direction;
  /** Ordet som frågas efter, åt det hållet. */
  asked: string;
  /** Översättningen som visas — facit eller ett felsvar. */
  shown: string;
  /** Om det som visas är rätt. Det är detta den som övar ska avgöra. */
  truthy: boolean;
}

/** Ordet påståendet handlar om, som planen och motorn känner igen det. */
export function wordOf(statement: Statement): DirectedWord {
  return { pair: statement.pair, direction: statement.direction };
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
  direction: Direction,
  block: readonly WordPair[],
  random: Random = Math.random,
): string | null {
  const forbidden = new Set(acceptedAnswers(pair, direction));

  const written = distractorsFor(pair, direction).filter(
    (word) => !forbidden.has(normalize(word)),
  );
  if (written.length > 0) {
    return pick(written, random);
  }

  const fromBlock = block
    .map((other) => answerOf(other, direction))
    .filter((word) => !forbidden.has(normalize(word)));
  return pick(fromBlock, random);
}

/**
 * Påståendet som visas i sant/falskt. Sant i ungefär hälften av fallen.
 *
 * Andelen gäller *per riktning* och inte över varvet som helhet. Vore den
 * gemensam går det att lära sig att svenska frågor oftare är sanna, och det är
 * ett mönster i gränssnittet och inte i språket.
 */
export function statementFor(
  pair: WordPair,
  direction: Direction,
  block: readonly WordPair[],
  random: Random = Math.random,
): Statement {
  return statementWith(pair, direction, block, random() < TRUE_SHARE, random);
}

/**
 * Ett påstående med bestämt sanningsvärde.
 *
 * Kalibreringen behöver det: fyra prov som råkade bli tre sanna och ett falskt
 * mäter tre kanaler och lämnar en omätt, och då är hela uppdelningen i kanaler
 * bortkastad. Slumpen får avgöra vilket ord, aldrig vilken kanal.
 *
 * Ett falskt påstående som inte gick att bygga blir sant i stället för påhittat
 * — en lista med ett enda ord och inga skrivna felsvar har inget att erbjuda.
 */
export function statementWith(
  pair: WordPair,
  direction: Direction,
  block: readonly WordPair[],
  truthy: boolean,
  random: Random = Math.random,
): Statement {
  const asked = promptOf(pair, direction);
  const truth = answerOf(pair, direction);
  if (truthy) {
    return { pair, direction, asked, shown: truth, truthy: true };
  }
  const wrong = wrongAnswerFor(pair, direction, block, random);
  if (wrong === null) {
    return { pair, direction, asked, shown: truth, truthy: true };
  }
  return { pair, direction, asked, shown: wrong, truthy: false };
}
