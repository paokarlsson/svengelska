/**
 * Varvet: vilka tio ord, och i vilken ordning de tjugo korten kommer.
 *
 * Ett varv är **tio ord åt båda hållen**. Det är inte tjugo godtyckliga kort:
 * planen schemalägger *ordet*, och varvet visar båda hållen av de ord som står
 * på tur. Annars skulle riktningarna glida isär i tid, och «tio ord åt båda
 * hållen» vara en beskrivning av ingenting.
 *
 * Filen håller inget tillstånd och når varken motorn eller lagret. Den får ett
 * ordförråd, en bild av vad varje ord kan, en klocka och en budget, och lämnar
 * ifrån sig en lista. Det är vad som gör varvet prövbart utan en spelare.
 */
import { Random, shuffle } from '../words/shuffle';
import { Direction, DirectedWord, WordPair, pairKey } from '../words/word-catalog';
import { isDue, overdueBy } from './schedule';
import { StepStat } from './word-state';

/**
 * Så många ord ett varv är.
 *
 * Tjugo kort tar några minuter och slutar medan det fortfarande är roligt.
 * Räknat i ord och inte i kort, eftersom ordet är det som schemaläggs.
 *
 * ANTAGANDE: satt på känsla. Se docs/nerskalad.md.
 */
export const ROUND_WORDS = 10;

/** Vad appen mätt om ett ord åt ett håll. Skickas in, läses aldrig härifrån. */
export type StatOf = (word: DirectedWord) => StepStat;

/** Om ordet setts åt något håll alls. Osett ord är nytt, inte försenat. */
export function isNew(pair: WordPair, statOf: StatOf): boolean {
  return !directionsOf(pair).some((word) => statOf(word).attempts > 0);
}

/**
 * Om ordet ska tillbaka nu.
 *
 * Ett ord är moget när *något* av dess håll är det, och ett påbörjat ord vars
 * andra håll aldrig setts är moget direkt. Det andra ledet är det som gör att
 * en riktning inte kan bli liggande: utan det skulle `hund → dog` aldrig
 * introduceras för ett ord som redan sitter åt andra hållet, eftersom ett osett
 * håll saknar mognadsdag.
 */
export function isWordDue(pair: WordPair, statOf: StatOf, now: number): boolean {
  if (isNew(pair, statOf)) {
    return false;
  }
  return directionsOf(pair).some((word) => {
    const stat = statOf(word);
    return stat.lastSeen === null || isDue(stat, now);
  });
}

/**
 * Hur länge ordet väntat. Sorteringsnyckeln när varvet fylls.
 *
 * Det mest försenade hållet får tala för hela ordet: det är den svagare
 * riktningen som avgör när ordet behöver ses, precis som det är den som avgör
 * om ordet sitter.
 */
function waitedBy(pair: WordPair, statOf: StatOf, now: number): number {
  return Math.max(...directionsOf(pair).map((word) => overdueBy(statOf(word), now)));
}

function directionsOf(pair: WordPair): DirectedWord[] {
  return [
    { pair, direction: 'en' as Direction },
    { pair, direction: 'sv' as Direction },
  ];
}

/**
 * Varvets tio ord.
 *
 * Tre källor, i tur och ordning:
 *
 * 1. **Försenade** ord ur hela katalogen, mest försenat först. Repetitionen tar
 *    allt som setts, oavsett vilken vecka det står i — ett ord som fastnat i
 *    vecka 3 ska kunna komma tillbaka samma dag som vecka 5 är ny.
 * 2. **Nya** ord ur `fresh`, upp till dagens budget. Veckan är alltså källan
 *    till nya ord och inte en avgränsning av övningen: den som väljer vecka 5
 *    säger «hämta nya ord härifrån», inte «öva bara det här».
 * 3. **Närmast mogna** ord som utfyllnad, om de två första inte gav tio.
 *
 * Räcker det ändå inte till tio blir varvet kortare. Det är med flit: ett varv
 * som låtsas vara tio ord långt när det finns fyra att öva är en lögn om hur
 * mycket arbete som återstår.
 */
export function pickRoundWords(
  catalog: readonly WordPair[],
  fresh: readonly WordPair[],
  statOf: StatOf,
  now: number,
  newBudget: number,
  size: number = ROUND_WORDS,
): WordPair[] {
  const chosen: WordPair[] = [];
  const taken = new Set<string>();

  const take = (pair: WordPair): void => {
    const key = pairKey(pair);
    if (!taken.has(key) && chosen.length < size) {
      taken.add(key);
      chosen.push(pair);
    }
  };

  const due = catalog
    .filter((pair) => isWordDue(pair, statOf, now))
    .sort((a, b) => waitedBy(b, statOf, now) - waitedBy(a, statOf, now));
  due.forEach(take);

  const fresher = fresh.filter((pair) => isNew(pair, statOf));
  fresher.slice(0, Math.max(0, Math.floor(newBudget))).forEach(take);

  const soon = catalog
    .filter((pair) => !isNew(pair, statOf) && !taken.has(pairKey(pair)))
    .sort((a, b) => waitedBy(b, statOf, now) - waitedBy(a, statOf, now));
  soon.forEach(take);

  return chosen;
}

/**
 * De tjugo korten, i den ordning de kommer.
 *
 * Varvet delas i två halvor med varje ord en gång i var, och hållen är varandras
 * motsatser mellan halvorna. Det köper två saker på en gång: ett ords två
 * riktningar kan aldrig hamna intill varandra — det finns en halv omgång
 * emellan — och vilket håll som kommer först avgörs av slumpen och inte av en
 * ordning som går att lära sig.
 *
 * Att avståndet är garanterat och inte bara sannolikt spelar roll. Ligger
 * `dog = hund` direkt före `hund = dog` mäts korttidsminnet och inte glosan, och
 * en spärr som håller nästan alltid är en spärr som inte går att skriva ett test
 * på.
 */
export function roundCards(words: readonly WordPair[], random: Random = Math.random): DirectedWord[] {
  if (words.length === 0) {
    return [];
  }

  const first: DirectedWord[] = words.map((pair) => ({
    pair,
    direction: random() < 0.5 ? 'en' : 'sv',
  }));
  const second: DirectedWord[] = first.map((word) => ({
    pair: word.pair,
    direction: word.direction === 'en' ? 'sv' : 'en',
  }));

  const head = shuffle(first, random);
  const tail = shuffle(second, random);

  // Halvorna är var för sig fria från upprepning, eftersom varje ord står en
  // gång i var. Det enda stället två kort av samma ord kan mötas är därför
  // skarven, och den går att laga med ett byte.
  if (tail.length > 1 && pairKey(head[head.length - 1].pair) === pairKey(tail[0].pair)) {
    [tail[0], tail[1]] = [tail[1], tail[0]];
  }
  return [...head, ...tail];
}
