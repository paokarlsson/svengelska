/**
 * Slumpen, som ett argument.
 *
 * Varje funktion här tar sin slumpkälla i stället för att nå `Math.random`
 * själv. Det kostar en parameter och köper två saker: ett test kan mata in en
 * bestämd följd och få ett bestämt svar, och det går att se på signaturen
 * vilken funktion som är ren och vilken som inte är det.
 */

/** Ett tal i [0, 1). Samma form som `Math.random`, och det är hela poängen. */
export type Random = () => number;

/** Ett av alternativen, eller `null` om det inte fanns några. */
export function pick<T>(items: readonly T[], random: Random = Math.random): T | null {
  if (items.length === 0) {
    return null;
  }
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))];
}

/** Fisher–Yates. Rör inte det den fick. */
export function shuffle<T>(items: readonly T[], random: Random = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(random() * (i + 1)));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * En blandning där inget hamnar där det låg.
 *
 * Match lägger engelskan i en kolumn och svenskan i en annan, och ligger ett
 * ord mitt emot sin egen översättning är hela övningen avslöjad av raden. En
 * vanlig blandning låter det hända ungefär en gång av `e`, alltså oftare än
 * man tror.
 *
 * Formen är `ganger`:s: blanda om tills ingen står kvar, och ge upp mot en
 * rotation, som alltid är en derangering när alla element är olika.
 */
export function derange<T>(items: readonly T[], random: Random = Math.random): T[] {
  if (items.length < 2) {
    return [...items];
  }
  for (let attempt = 0; attempt < DERANGE_ATTEMPTS; attempt++) {
    const candidate = shuffle(items, random);
    if (candidate.every((item, index) => item !== items[index])) {
      return candidate;
    }
  }
  return [...items.slice(1), items[0]];
}

/** Så många blandningar som prövas innan rotationen tar vid. Sannolikheten att
 *  alla tio har en fixpunkt är ungefär en på hundra. */
const DERANGE_ATTEMPTS = 10;

/**
 * Ett av alternativen, med vikt. Tyngre vikt är oftare, aldrig alltid.
 *
 * Vikter som inte är positiva behandlas som noll. Är summan noll — allt väger
 * lika lite — faller den tillbaka på ett jämnt drag, eftersom att returnera
 * `null` för att allting är behärskat vore fel svar på rätt fråga.
 */
export function weightedPick<T>(
  items: readonly T[],
  weightOf: (item: T) => number,
  random: Random = Math.random,
): T | null {
  if (items.length === 0) {
    return null;
  }
  const weights = items.map((item) => Math.max(0, weightOf(item)));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) {
    return pick(items, random);
  }

  let threshold = random() * total;
  for (let i = 0; i < items.length; i++) {
    threshold -= weights[i];
    if (threshold < 0) {
      return items[i];
    }
  }
  return items[items.length - 1];
}
