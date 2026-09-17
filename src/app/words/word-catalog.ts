/**
 * Vad en glosa är, hur den identifieras, och vilka listor som finns.
 *
 * Här finns ingen svårighetsordning. Det är den stora skillnaden mot `ganger`,
 * där hela katalogen härleds ur en enda array eftersom 7 × 8 *är* svårare än
 * 2 × 3 av skäl som går att räkna ut. Ord har ingen sådan inneboende ordning:
 * att `beautiful` är svårare än `cat` är en mätning, inte en härledning. Därför
 * bär en glosa ingen `rank` och inget `band` — svårigheten är något systemet
 * observerar per ord och per steg, och den bor i framstegsdokumentet.
 */
import lists from './word-lists.json';

/** Ett ordpar. `en` är frågan, `sv` är facit. */
export interface WordPair {
  en: string;
  sv: string;
  /**
   * Andra svar som ska godtas i skriftligt läge. `hund` är facit, men den som
   * skriver `hunden` har inte fel om betydelsen — bara om formen.
   */
  also?: readonly string[];
  /**
   * Felsvar skrivna för hand, på var sitt språk.
   *
   * Att de står i listan och inte räknas fram är svaret på öppen fråga 3 i
   * docs/plan.md: dras alla felsvar ur samma tio ord går det att svara rätt på
   * `dog = katt` genom att veta att `katt` hör till `cat`, utan att veta vad
   * `dog` betyder. Ett skrivet felsvar får komma från veckans tema i stort och
   * behöver inte vara ett av blockets egna ord, och då mäter steget betydelsen
   * i stället för uteslutningsförmågan.
   *
   * Saknas de faller `distractors.ts` tillbaka på blocket, eftersom en lista
   * utan felsvar ska gå att öva på ändå.
   */
  distractorsEn?: readonly string[];
  distractorsSv?: readonly string[];
}

/**
 * Vilket språk som frågar.
 *
 * `en` är `dog → hund`, `sv` är `hund → dog`. Att det är två riktningar och
 * inte ett ordpar med två sidor är avgjort sedan tidigare: `hund → dog` är en
 * annan och svårare färdighet, och att träna båda i samma mått hade gjort
 * måttet till ett medelvärde av två saker. Riktningen bor därför i nyckeln, och
 * ett ord åt två håll är två poster med var sin dom och var sin fart.
 */
export type Direction = 'en' | 'sv';

/** Båda hållen, i den ordning de presenteras när båda visas. */
export const DIRECTIONS = ['en', 'sv'] as const;

/** Ett ordpar sett från ett håll. Det som faktiskt hamnar på ett kort. */
export interface DirectedWord {
  pair: WordPair;
  direction: Direction;
}

/** En omgång ord som följs åt genom alla fyra steg. */
export interface WordBlock {
  id: string;
  name: string;
  words: readonly WordPair[];
}

/**
 * Formen ett ord jämförs i. Gemener, utan kantmellanslag och med inre
 * blankstegsrader hoprensade, så att `  Dog ` och `dog` är samma ord.
 *
 * Diakriter rörs inte: `å` och `a` är olika bokstäver på svenska, och den som
 * skriver `hast` för `häst` har stavat fel. Att det *ska* räknas som fel är
 * hela poängen med steg 4 — men rättningen skiljer på «fel ord» och «nästan
 * rätt», se `training/spelling.ts`.
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
 *
 * Att nyckeln inte bär blockets id är också ett beslut: `water = vatten` står i
 * både Mat och Vardagsord, och det är samma glosa. Framstegen följer ordet, inte
 * listan det råkade stå i.
 */
export function wordKey(pair: WordPair, direction: Direction = 'en'): string {
  return `${direction}:${normalize(promptOf(pair, direction))}=${normalize(
    answerOf(pair, direction),
  )}`;
}

/** Nyckeln som identifierar *ordet*, oavsett håll. Planen schemaläggs på den. */
export function pairKey(pair: WordPair): string {
  return wordKey(pair, 'en');
}

/** Ordet som frågas efter åt det hållet. */
export function promptOf(pair: WordPair, direction: Direction): string {
  return direction === 'en' ? pair.en : pair.sv;
}

/** Facit åt det hållet. */
export function answerOf(pair: WordPair, direction: Direction): string {
  return direction === 'en' ? pair.sv : pair.en;
}

/**
 * Alla svar som ska godtas för en glosa, i jämförbar form.
 *
 * `also` gäller bara åt `en`-hållet: de står i listan som svenska former —
 * `hunden` för `hund` — och har ingen motsvarighet när svenskan är frågan.
 */
export function acceptedAnswers(pair: WordPair, direction: Direction = 'en'): string[] {
  const extra = direction === 'en' ? (pair.also ?? []) : [];
  return [answerOf(pair, direction), ...extra].map(normalize);
}

/**
 * Felsvaren som hör till hållet.
 *
 * Skrivna felsvar är på samma språk som facit, så `en`-hållet — där svenskan
 * svarar — hämtar ur `distractorsSv`, och `sv`-hållet ur `distractorsEn`. Att
 * de senare legat oanvända i listorna sedan de skrevs är hela förberedelsen som
 * behövdes.
 */
export function distractorsFor(pair: WordPair, direction: Direction): readonly string[] {
  return (direction === 'en' ? pair.distractorsSv : pair.distractorsEn) ?? [];
}

/** Varje ord i listan åt båda hållen. */
export function bothDirections(words: readonly WordPair[]): DirectedWord[] {
  return words.flatMap((pair) => DIRECTIONS.map((direction) => ({ pair, direction })));
}

/**
 * Ordlistorna appen levereras med, lästa ur `word-lists.json`.
 *
 * JSON:en är genererad ur `data/glosor.csv` av `npm run words` — CSV:n är
 * formatet en lärare faktiskt lämnar ifrån sig, och att listorna är *data* och
 * inte kod är vad som gör att de senare kan komma någon annanstans ifrån utan
 * att någon rör appen. Se steg 6 i docs/plan.md.
 */
export const WORD_BLOCKS: readonly WordBlock[] = parseBlocks(lists);

/**
 * Alla glosor appen känner till, en gång var.
 *
 * Repetitionsplanen behöver hela katalogen och inte en vecka: ett ord som
 * fastnat i vecka 3 ska kunna komma tillbaka samma dag som vecka 5 är ny.
 * Dubbletter faller bort på nyckeln — `water = vatten` står i både Mat och
 * Vardagsord, och det är samma glosa.
 */
export const ALL_WORDS: readonly WordPair[] = dedupe(WORD_BLOCKS.flatMap((block) => block.words));

function dedupe(words: readonly WordPair[]): WordPair[] {
  const seen = new Set<string>();
  const unique: WordPair[] = [];
  for (const pair of words) {
    const key = pairKey(pair);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(pair);
    }
  }
  return unique;
}

export function blockById(id: string | null): WordBlock | null {
  return WORD_BLOCKS.find((block) => block.id === id) ?? null;
}

/**
 * Läser en ordlista ur något som kanske är en ordlista.
 *
 * Samma hållning som `normalize()` i `progress-store.ts`: en lista som appen
 * inte skrev själv — en inklistrad fil, en äldre generering — ska göra det den
 * kan och tiga om resten, inte krascha övningen. En rad utan både engelska och
 * svenska är ingen glosa och faller bort; ett block utan glosor likaså.
 */
export function parseBlocks(value: unknown): WordBlock[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const blocks: WordBlock[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    const block = parseBlock(raw);
    if (block !== null && !seen.has(block.id)) {
      seen.add(block.id);
      blocks.push(block);
    }
  }
  return blocks;
}

function parseBlock(value: unknown): WordBlock | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = text(value['id']);
  const words: WordPair[] = [];
  const keys = new Set<string>();
  if (Array.isArray(value['words'])) {
    for (const raw of value['words']) {
      const pair = parseWord(raw);
      // Två rader som är samma glosa vore två sanningar om samma framsteg.
      if (pair !== null && !keys.has(wordKey(pair))) {
        keys.add(wordKey(pair));
        words.push(pair);
      }
    }
  }
  if (id === null || words.length === 0) {
    return null;
  }
  return { id, name: text(value['name']) ?? id, words };
}

function parseWord(value: unknown): WordPair | null {
  if (!isRecord(value)) {
    return null;
  }
  const en = text(value['en']);
  const sv = text(value['sv']);
  if (en === null || sv === null) {
    return null;
  }
  const pair: WordPair = { en, sv };
  const also = textList(value['also']);
  const distractorsEn = textList(value['distractorsEn']);
  const distractorsSv = textList(value['distractorsSv']);
  if (also.length > 0) {
    pair.also = also;
  }
  if (distractorsEn.length > 0) {
    pair.distractorsEn = distractorsEn;
  }
  if (distractorsSv.length > 0) {
    pair.distractorsSv = distractorsSv;
  }
  return pair;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function textList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(text).filter((item): item is string => item !== null);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
