/**
 * Vad en glosa är, och hur den identifieras.
 *
 * Här finns ingen svårighetsordning. Det är den stora skillnaden mot `ganger`,
 * där hela katalogen härleds ur en enda array eftersom 7 × 8 *är* svårare än
 * 2 × 3 av skäl som går att räkna ut. Ord har ingen sådan inneboende ordning:
 * att `beautiful` är svårare än `cat` är en mätning, inte en härledning. Därför
 * bär en glosa ingen `rank` och inget `band` — svårigheten är något systemet
 * observerar per ord och per steg, och den bor i framstegsdokumentet.
 */

/** Ett ordpar. `en` är frågan, `sv` är facit. */
export interface WordPair {
  en: string;
  sv: string;
  /**
   * Andra svar som ska godtas i skriftligt läge. `hund` är facit, men den som
   * skriver `hunden` har inte fel om betydelsen — bara om formen.
   */
  also?: readonly string[];
}

/** En omgång ord som följs åt genom alla fyra steg. */
export interface WordBlock {
  id: string;
  name: string;
  words: readonly WordPair[];
}

/**
 * Så många ord ett block bör innehålla.
 *
 * ANTAGANDE: hämtad ur konceptet, inte mätt. Tjugo är litet nog att kännas
 * hanterbart och stort nog att ge distraktorer som inte upprepas. Se
 * docs/plan.md.
 */
export const BLOCK_SIZE = 20;

/**
 * Formen ett ord jämförs i. Gemener, utan kantmellanslag och med inre
 * blankstegsrader hoprensade, så att `  Dog ` och `dog` är samma ord.
 *
 * Diakriter rörs inte: `å` och `a` är olika bokstäver på svenska, och den som
 * skriver `hast` för `häst` har stavat fel. Att det *ska* räknas som fel är
 * hela poängen med steg 4 — men rättningen skiljer på "fel ord" och "nästan
 * rätt", se `training/spelling.ts` när den finns.
 */
export function normalize(word: string): string {
  return word.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Nyckeln en glosa lagras under.
 *
 * Båda sidorna ingår, och det är ett beslut: `can = kan` och `can = burk` är
 * två glosor, inte en med två svar. Nyckeln på bara engelska hade slagit ihop
 * dem och gjort framstegen på den ena till en lögn om den andra.
 *
 * Priset är att en rättad översättning är ett nytt ord för systemet. Det är
 * rätt pris — ett stavfel i facit ska inte ärva framsteg som mättes mot något
 * annat.
 */
export function wordKey(pair: WordPair): string {
  return `en:${normalize(pair.en)}=${normalize(pair.sv)}`;
}

/**
 * Startblocket. Finns för att appen ska ha något att öva på innan listor går
 * att mata in, och är medvetet vardagligt: konkreta substantiv och några verb,
 * inga ord vars översättning beror på sammanhanget.
 */
export const SEED_BLOCK: WordBlock = {
  id: 'seed-1',
  name: 'Vardagsord 1',
  words: [
    { en: 'dog', sv: 'hund' },
    { en: 'cat', sv: 'katt' },
    { en: 'horse', sv: 'häst' },
    { en: 'house', sv: 'hus' },
    { en: 'water', sv: 'vatten' },
    { en: 'bread', sv: 'bröd' },
    { en: 'window', sv: 'fönster' },
    { en: 'table', sv: 'bord' },
    { en: 'chair', sv: 'stol' },
    { en: 'book', sv: 'bok' },
    { en: 'friend', sv: 'vän', also: ['kompis'] },
    { en: 'school', sv: 'skola' },
    { en: 'street', sv: 'gata' },
    { en: 'money', sv: 'pengar' },
    { en: 'summer', sv: 'sommar' },
    { en: 'winter', sv: 'vinter' },
    { en: 'to run', sv: 'springa', also: ['att springa'] },
    { en: 'to read', sv: 'läsa', also: ['att läsa'] },
    { en: 'to sleep', sv: 'sova', also: ['att sova'] },
    { en: 'to buy', sv: 'köpa', also: ['att köpa'] },
  ],
};

/** Alla svar som ska godtas för en glosa, i jämförbar form. */
export function acceptedAnswers(pair: WordPair): string[] {
  return [pair.sv, ...(pair.also ?? [])].map(normalize);
}
